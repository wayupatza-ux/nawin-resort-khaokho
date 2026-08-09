// agoda-intake: receives parsed Agoda booking-notification data from an
// external caller (Hermes reading Gmail, or a Zapier/Make webhook watching
// the inbox Agoda sends reservation emails to) and turns it into a row in
// public.bookings. verify_jwt=false — this is a server-to-server endpoint,
// authorized via a dedicated shared secret (x-internal-secret) rather than
// a Supabase JWT, since the caller isn't a logged-in user or guest LIFF
// session.
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

async function checkSecret(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-internal-secret");
  if (!provided) return false;
  const { data, error } = await supabase.rpc("get_secret", { secret_name: "agoda_intake_secret" });
  if (error || !data) return false;
  return provided === data;
}

const REF_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function genBookingRef(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
  return code;
}

async function findUnitByRoomTypeName(roomTypeName: string) {
  const needle = roomTypeName.trim();
  const { data: exact } = await supabase
    .from("units")
    .select("id, name")
    .ilike("agoda_room_type_name", needle)
    .limit(2);
  if (exact && exact.length === 1) return exact[0];
  if (exact && exact.length > 1) return { ambiguous: true, matches: exact };

  const { data: fuzzy } = await supabase
    .from("units")
    .select("id, name")
    .ilike("agoda_room_type_name", `%${needle}%`)
    .limit(2);
  if (fuzzy && fuzzy.length === 1) return fuzzy[0];
  if (fuzzy && fuzzy.length > 1) return { ambiguous: true, matches: fuzzy };
  return null;
}

async function getOrCreateGuest(name: string, phone?: string) {
  const { data: existing } = await supabase
    .from("guests")
    .select("id")
    .eq("display_name", name)
    .eq("phone", phone || "")
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("guests")
    .insert({ display_name: name, phone: phone || null })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function handleBooking(req: Request) {
  const body = await req.json();
  const {
    externalRef,
    roomTypeName,
    guestName,
    guestPhone,
    checkIn,
    checkOut,
    numGuests,
    totalAmount,
    action,
  } = body;

  if (!externalRef) return json({ error: "externalRef required" }, 400);

  // --- cancel path ---
  if (action === "cancel") {
    const { data: existing } = await supabase
      .from("bookings")
      .select("id, booking_ref, status")
      .eq("source", "agoda")
      .eq("external_ref", externalRef)
      .maybeSingle();
    if (!existing) return json({ error: "no matching agoda booking found for that externalRef" }, 404);
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", existing.id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, action: "cancelled", bookingId: existing.id, bookingRef: existing.booking_ref });
  }

  // --- confirm / amend path ---
  if (!roomTypeName || !guestName || !checkIn || !checkOut || !totalAmount) {
    return json({ error: "roomTypeName, guestName, checkIn, checkOut, totalAmount required" }, 400);
  }
  if (checkOut <= checkIn) return json({ error: "checkOut must be after checkIn" }, 400);

  // idempotent: if we've already recorded this Agoda reservation, update it
  // instead of creating a duplicate (Agoda re-sends emails on amendment).
  const { data: existing } = await supabase
    .from("bookings")
    .select("id, booking_ref, unit_id")
    .eq("source", "agoda")
    .eq("external_ref", externalRef)
    .maybeSingle();

  const unit = await findUnitByRoomTypeName(roomTypeName);
  if (!unit) {
    return json(
      { error: `no unit mapped to Agoda room type "${roomTypeName}" — set units.agoda_room_type_name in the dashboard` },
      422,
    );
  }
  if ("ambiguous" in unit) {
    return json({ error: `room type "${roomTypeName}" matches multiple units`, matches: unit.matches }, 422);
  }

  const guestId = await getOrCreateGuest(guestName, guestPhone);

  if (existing) {
    const { error } = await supabase
      .from("bookings")
      .update({
        unit_id: unit.id,
        check_in: checkIn,
        check_out: checkOut,
        num_guests: numGuests || 1,
        total_amount: totalAmount,
        guest_id: guestId,
      })
      .eq("id", existing.id);
    if (error) {
      if (error.code === "23P01") {
        return json({ error: "date/unit conflict with an existing booking — needs manual review", conflict: true }, 409);
      }
      return json({ error: error.message }, 500);
    }
    return json({ success: true, action: "updated", bookingId: existing.id, bookingRef: existing.booking_ref });
  }

  let insertError, booking;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await supabase
      .from("bookings")
      .insert({
        booking_ref: genBookingRef(),
        guest_id: guestId,
        unit_id: unit.id,
        check_in: checkIn,
        check_out: checkOut,
        num_guests: numGuests || 1,
        total_amount: totalAmount,
        source: "agoda",
        external_ref: externalRef,
        status: "confirmed",
      })
      .select("id, booking_ref")
      .single();
    insertError = result.error;
    booking = result.data;
    if (!insertError || insertError.code !== "23505") break;
  }
  if (insertError) {
    if (insertError.code === "23P01") {
      return json({ error: "date/unit conflict with an existing booking — needs manual review", conflict: true }, 409);
    }
    return json({ error: insertError.message }, 500);
  }

  return json({ success: true, action: "created", bookingId: booking.id, bookingRef: booking.booking_ref });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const authorized = await checkSecret(req);
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const path = new URL(req.url).pathname.replace(/^\/agoda-intake/, "");
  try {
    if (path === "/booking") return await handleBooking(req);
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
});
