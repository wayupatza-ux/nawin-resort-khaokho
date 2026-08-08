// guest-api: booking, my-bookings, cancel — for the LIFF guest-app.
// verify_jwt=false (this function is public); every request is authorized
// manually by verifying the LIFF ID token against LINE's endpoint, then
// using the service-role client (bypasses RLS) to act on that guest's own
// data only.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getLineLoginChannelId(): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", {
    secret_name: "line_login_channel_id",
  });
  if (error || !data) throw new Error("line_login_channel_id not configured");
  return data as string;
}

// Verifies a LIFF ID token via LINE's /oauth2/v2.1/verify endpoint and
// returns the LINE user id (sub) + profile display name on success.
async function verifyIdToken(idToken: string): Promise<{ sub: string; name?: string }> {
  const channelId = await getLineLoginChannelId();
  const params = new URLSearchParams({ id_token: idToken, client_id: channelId });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) throw new Error("invalid id token");
  const payload = await res.json();
  return { sub: payload.sub, name: payload.name };
}

async function getOrCreateGuest(lineUserId: string, displayName?: string) {
  const { data: existing } = await supabase
    .from("guests")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("guests")
    .insert({ line_user_id: lineUserId, display_name: displayName })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

function genBookingRef() {
  const rand = crypto.randomUUID().split("-")[0].toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `NRK-${date}-${rand}`;
}

async function handleBook(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.idToken) return json({ error: "idToken required" }, 400);
  const { unitId, checkIn, checkOut, numGuests, notes } = body;
  if (!unitId || !checkIn || !checkOut) {
    return json({ error: "unitId, checkIn, checkOut required" }, 400);
  }

  let line;
  try {
    line = await verifyIdToken(body.idToken);
  } catch {
    return json({ error: "invalid LIFF token" }, 401);
  }

  const { data: available, error: availErr } = await supabase.rpc("check_availability", {
    p_unit_id: unitId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });
  if (availErr) return json({ error: "availability check failed" }, 500);
  if (!available) return json({ error: "ยูนิตนี้ไม่ว่างในช่วงวันที่เลือก" }, 409);

  const { data: unit, error: unitErr } = await supabase
    .from("units")
    .select("base_price")
    .eq("id", unitId)
    .single();
  if (unitErr || !unit) return json({ error: "unit not found" }, 404);

  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  );
  if (nights <= 0) return json({ error: "checkOut must be after checkIn" }, 400);
  const totalAmount = unit.base_price * nights;

  const guestId = await getOrCreateGuest(line.sub, line.name);

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .insert({
      booking_ref: genBookingRef(),
      guest_id: guestId,
      unit_id: unitId,
      check_in: checkIn,
      check_out: checkOut,
      num_guests: numGuests ?? 1,
      total_amount: totalAmount,
      source: "liff",
      notes: notes ?? null,
    })
    .select("id, booking_ref, status, total_amount")
    .single();

  if (bookingErr) {
    if (bookingErr.code === "23P01") {
      return json({ error: "ยูนิตนี้ถูกจองไปแล้วในช่วงเวลาเดียวกัน" }, 409);
    }
    return json({ error: "booking failed" }, 500);
  }

  return json({ booking });
}

async function handleMyBookings(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.idToken) return json({ error: "idToken required" }, 400);

  let line;
  try {
    line = await verifyIdToken(body.idToken);
  } catch {
    return json({ error: "invalid LIFF token" }, 401);
  }

  const { data: guest } = await supabase
    .from("guests")
    .select("id")
    .eq("line_user_id", line.sub)
    .maybeSingle();
  if (!guest) return json({ bookings: [] });

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, booking_ref, check_in, check_out, num_guests, status, total_amount, units(name)")
    .eq("guest_id", guest.id)
    .order("check_in", { ascending: false });

  if (error) return json({ error: "failed to load bookings" }, 500);
  return json({ bookings });
}

async function handleCancel(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.idToken || !body?.bookingId) {
    return json({ error: "idToken and bookingId required" }, 400);
  }

  let line;
  try {
    line = await verifyIdToken(body.idToken);
  } catch {
    return json({ error: "invalid LIFF token" }, 401);
  }

  const { data: guest } = await supabase
    .from("guests")
    .select("id")
    .eq("line_user_id", line.sub)
    .maybeSingle();
  if (!guest) return json({ error: "guest not found" }, 404);

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, guest_id, status")
    .eq("id", body.bookingId)
    .maybeSingle();

  if (!booking || booking.guest_id !== guest.id) {
    return json({ error: "booking not found" }, 404);
  }
  if (["cancelled", "checked_out", "no_show"].includes(booking.status)) {
    return json({ error: "booking cannot be cancelled" }, 409);
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id);

  if (error) return json({ error: "cancel failed" }, 500);
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/guest-api/, "");

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    if (path === "/book") return await handleBook(req);
    if (path === "/my-bookings") return await handleMyBookings(req);
    if (path === "/cancel") return await handleCancel(req);
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
});
