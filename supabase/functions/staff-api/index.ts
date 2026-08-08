// staff-api: lets staff key in a walk-in booking from their phone via a
// LIFF app opened inside LINE (no separate login — identity comes from
// their linked LINE account). verify_jwt=false (public function); every
// request is authorized manually by verifying the LIFF ID token against
// LINE, then matching profiles.line_user_id to find which staff member
// this is (and stamping bookings.created_by with their profile id, same
// as new-booking.html, for commission tracking).
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

async function findStaffProfile(lineUserId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getOrCreateGuest(name: string, phone?: string) {
  const { data: existing } = await supabase
    .from("guests")
    .select("id")
    .eq("display_name", name)
    .eq("phone", phone || "")
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("guests")
    .insert({ display_name: name, phone: phone || null })
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

async function handleMe(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.idToken) return json({ error: "idToken required" }, 400);

  let line;
  try {
    line = await verifyIdToken(body.idToken);
  } catch {
    return json({ error: "invalid LIFF token" }, 401);
  }

  const profile = await findStaffProfile(line.sub);
  if (!profile) {
    return json({
      error: "บัญชี LINE นี้ยังไม่ได้ผูกกับพนักงาน",
      lineUserId: line.sub,
    }, 403);
  }
  return json({ profile: { displayName: profile.display_name, role: profile.role } });
}

async function handleBook(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.idToken) return json({ error: "idToken required" }, 400);
  const { unitId, checkIn, checkOut, numGuests, guestName, guestPhone, notes } = body;
  let totalAmount = body.totalAmount;

  if (!unitId || !checkIn || !checkOut || !guestName) {
    return json({ error: "unitId, checkIn, checkOut, guestName required" }, 400);
  }

  let line;
  try {
    line = await verifyIdToken(body.idToken);
  } catch {
    return json({ error: "invalid LIFF token" }, 401);
  }

  const staff = await findStaffProfile(line.sub);
  if (!staff) {
    return json({
      error: "บัญชี LINE นี้ยังไม่ได้ผูกกับพนักงาน กรุณาแจ้งเจ้าของให้ผูกบัญชีในหน้า Dashboard",
      lineUserId: line.sub,
    }, 403);
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
  if (!totalAmount) totalAmount = unit.base_price * nights;
  if (Number(totalAmount) <= 0) return json({ error: "invalid totalAmount" }, 400);

  const guestId = await getOrCreateGuest(guestName, guestPhone);

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
      source: "staff-liff",
      notes: notes ?? null,
      status: "confirmed",
      created_by: staff.id,
    })
    .select("id, booking_ref, status, total_amount")
    .single();

  if (bookingErr) {
    if (bookingErr.code === "23P01") {
      return json({ error: "ยูนิตนี้ถูกจองไปแล้วในช่วงเวลาเดียวกัน" }, 409);
    }
    return json({ error: "booking failed" }, 500);
  }

  return json({ booking, staffName: staff.display_name });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/staff-api/, "");

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    if (path === "/me") return await handleMe(req);
    if (path === "/book") return await handleBook(req);
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
});
