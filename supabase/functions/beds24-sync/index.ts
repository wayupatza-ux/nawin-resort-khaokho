// beds24-sync: keeps Beds24 (our channel manager) in step with the PMS so it can
// close Agoda inventory the moment staff key in a direct booking. Called by the
// notify_beds24_sync() DB trigger via pg_net with x-internal-secret
// (verify_jwt=false). Agoda bookings are never pushed here — Beds24 gets those
// straight from Agoda.
//
// Actions:
//   { action: "upsert", booking_id }            create/modify/cancel in Beds24
//   { action: "cancel", beds24_booking_id }     booking row was deleted in PMS
//   { action: "set_refresh_token", token }      one-time setup, authorized with
//                                               the agoda_intake_secret instead
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BEDS24 = "https://beds24.com/api/v2";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getSecret(name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_secret", { secret_name: name });
  if (error || !data) return null;
  return data as string;
}

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 5 * 60_000) return cachedToken.token;
  const refresh = await getSecret("beds24_refresh_token");
  if (!refresh) throw new Error("beds24_refresh_token not configured");
  const res = await fetch(`${BEDS24}/authentication/token`, {
    headers: { refreshToken: refresh, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`beds24 token refresh failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.token, exp: Date.now() + (data.expiresIn ?? 86400) * 1000 };
  return cachedToken.token;
}

async function beds24Post(path: string, body: unknown) {
  const res = await fetch(`${BEDS24}${path}`, {
    method: "POST",
    headers: {
      token: await accessToken(),
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep raw text */ }
  return { ok: res.ok, status: res.status, body: parsed };
}

async function log(bookingId: string | null, status: string, detail: unknown) {
  await supabase.from("notifications_log").insert({
    booking_id: bookingId,
    channel: "beds24",
    status,
    detail: typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 2000),
  });
}

async function upsert(bookingId: string) {
  const { data: b, error } = await supabase
    .from("bookings")
    .select("id, booking_ref, check_in, check_out, status, source, num_guests, total_amount, breakfast_included, beds24_booking_id, guests(display_name, first_name, last_name, phone), units(code, beds24_room_id)")
    .eq("id", bookingId)
    .single();
  if (error || !b) return json({ error: "booking not found" }, 404);

  // Agoda bookings are owned by the Agoda↔Beds24 link; only touch ones we created.
  if (b.source === "agoda" && !b.beds24_booking_id) return json({ skipped: "agoda" });

  const cancelled = b.status === "cancelled" || b.status === "no_show";
  if (cancelled) {
    if (!b.beds24_booking_id) return json({ skipped: "cancelled, never synced" });
    const r = await beds24Post("/bookings", [{ id: b.beds24_booking_id, status: "cancelled" }]);
    await log(b.id, r.ok ? "sent" : "failed", { op: "cancel", ...r });
    return json(r, r.ok ? 200 : 502);
  }

  // many-to-one embeds come back as single objects at runtime
  const unit = b.units as unknown as { code: string; beds24_room_id: number | null } | null;
  const g = b.guests as unknown as { display_name: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  const roomId = unit?.beds24_room_id;
  if (!roomId) {
    await log(b.id, "failed", `unit ${unit?.code} has no beds24_room_id`);
    return json({ error: "unit not mapped to Beds24" }, 422);
  }

  const name = g?.display_name || [g?.first_name, g?.last_name].filter(Boolean).join(" ") || b.booking_ref;
  const payload: Record<string, unknown> = {
    roomId,
    arrival: b.check_in,
    departure: b.check_out,
    status: "confirmed",
    lastName: name,
    phone: g?.phone ?? "",
    numAdult: Math.max(1, Math.min(b.num_guests ?? 2, 6)),
    numChild: 0,
    price: Number(b.total_amount ?? 0),
    referer: `Direct (PMS ${b.source})`,
    apiReference: b.booking_ref,
    comments: `PMS ${b.booking_ref} · ${b.source}${b.breakfast_included ? " · อาหารเช้า" : ""} · ${b.num_guests} คน`,
  };
  if (b.beds24_booking_id) payload.id = b.beds24_booking_id;

  const r = await beds24Post("/bookings", [payload]);
  const item = Array.isArray(r.body) ? (r.body[0] as Record<string, any>) : null;
  const ok = r.ok && item?.success;
  const newId = item?.new?.id;
  if (ok && newId && !b.beds24_booking_id) {
    await supabase.from("bookings").update({ beds24_booking_id: newId }).eq("id", b.id);
  }
  await log(b.id, ok ? "sent" : "failed", { op: b.beds24_booking_id ? "modify" : "create", ...r });
  return json(r, ok ? 200 : 502);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "json body required" }, 400);
  const headerSecret = req.headers.get("x-internal-secret");

  if (body.action === "set_refresh_token") {
    const intakeSecret = await getSecret("agoda_intake_secret");
    if (!intakeSecret || headerSecret !== intakeSecret) return new Response("unauthorized", { status: 401 });
    if (typeof body.token !== "string" || body.token.length < 50) return json({ error: "token missing" }, 400);
    const { error } = await supabase.rpc("set_secret", { secret_name: "beds24_refresh_token", secret_value: body.token });
    if (error) return json({ error: error.message }, 500);
    cachedToken = null;
    await accessToken(); // proves the stored token works
    return json({ ok: true });
  }

  const internalSecret = await getSecret("internal_functions_secret");
  if (!internalSecret || headerSecret !== internalSecret) return new Response("unauthorized", { status: 401 });

  try {
    if (body.action === "cancel" && body.beds24_booking_id) {
      const r = await beds24Post("/bookings", [{ id: body.beds24_booking_id, status: "cancelled" }]);
      await log(null, r.ok ? "sent" : "failed", { op: "cancel-deleted", ...r });
      return json(r, r.ok ? 200 : 502);
    }
    if (body.action === "upsert" && body.booking_id) return await upsert(body.booking_id);
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    await log(body.booking_id ?? null, "failed", String(e));
    return json({ error: String(e) }, 500);
  }
});
