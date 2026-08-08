// line-notify: sends a LINE push message to a guest when their booking is
// confirmed. Called only by the notify_booking_confirmed() DB trigger via
// pg_net, authenticated with a shared internal secret (not a real API for
// browsers — verify_jwt=false, x-internal-secret required instead).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getSecret(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { secret_name: name });
  if (error || !data) throw new Error(`${name} not configured`);
  return data as string;
}

async function pushMessage(lineUserId: string, text: string) {
  const accessToken = await getSecret("line_channel_access_token");
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const internalSecret = await getSecret("internal_functions_secret").catch(() => null);
  const headerSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || headerSecret !== internalSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const bookingId = body?.booking_id;
  if (!bookingId) return new Response("booking_id required", { status: 400 });

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("booking_ref, check_in, check_out, guests(line_user_id), units(name)")
    .eq("id", bookingId)
    .single();

  if (error || !booking?.guests?.line_user_id) {
    await supabase.from("notifications_log").insert({
      booking_id: bookingId,
      channel: "line",
      status: "skipped",
      detail: "no line_user_id for guest",
    });
    return new Response("OK", { status: 200 });
  }

  const text =
    `ยืนยันการจองสำเร็จ ✅\n` +
    `เลขที่จอง: ${booking.booking_ref}\n` +
    `ยูนิต: ${booking.units?.name ?? "-"}\n` +
    `เช็คอิน: ${booking.check_in}\n` +
    `เช็คเอาท์: ${booking.check_out}\n` +
    `Nawin Resort Khaokho`;

  const ok = await pushMessage(booking.guests.line_user_id, text);

  await supabase.from("notifications_log").insert({
    booking_id: bookingId,
    channel: "line",
    status: ok ? "sent" : "failed",
  });

  return new Response("OK", { status: 200 });
});
