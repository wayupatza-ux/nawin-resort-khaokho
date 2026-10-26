// line-notify: sends a LINE push message to a guest. Called only from the
// database via pg_net, authenticated with a shared internal secret (not a
// real API for browsers — verify_jwt=false, x-internal-secret required).
// body.kind:
//   "confirmed"         (default) notify_booking_confirmed() trigger
//   "payment_reminder"  send_liff_payment_reminders() — a LINE self-booking
//                       still unpaid ~12h in, before the 24h auto-cancel
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MY_BOOKINGS_URL = "https://liff.line.me/2011027975-pX2LznMW?next=my-bookings.html";

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
  const kind = body?.kind === "payment_reminder" ? "payment_reminder" : "confirmed";
  if (!bookingId) return new Response("booking_id required", { status: 400 });

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("booking_ref, status, created_at, check_in, check_out, total_amount, guests(line_user_id), units(name)")
    .eq("id", bookingId)
    .single();

  // deno-lint-ignore no-explicit-any
  const lineUserId = (booking?.guests as any)?.line_user_id;
  // deno-lint-ignore no-explicit-any
  const unitName = (booking?.units as any)?.name ?? "-";
  if (error || !lineUserId) {
    await supabase.from("notifications_log").insert({
      booking_id: bookingId,
      channel: "line",
      status: "skipped",
      detail: kind === "payment_reminder" ? "payment_reminder: no line_user_id" : "no line_user_id for guest",
    });
    return new Response("OK", { status: 200 });
  }
  // Paid or cancelled in the meantime — nothing to remind about.
  if (kind === "payment_reminder" && booking.status !== "pending") {
    await supabase.from("notifications_log").insert({
      booking_id: bookingId,
      channel: "line",
      status: "skipped",
      detail: `payment_reminder: status ${booking.status}`,
    });
    return new Response("OK", { status: 200 });
  }

  let text: string;
  if (kind === "payment_reminder") {
    const deadline = new Date(new Date(booking.created_at).getTime() + 24 * 3600_000)
      .toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    text =
      `⏰ แจ้งเตือนการชำระเงิน\n` +
      `การจอง ${booking.booking_ref} (${unitName}, เช็คอิน ${booking.check_in})\n` +
      `ยอดชำระ ${Number(booking.total_amount).toLocaleString("th-TH")} บาท — ยังไม่ได้รับสลิปค่ะ\n` +
      `กรุณาโอนและแนบสลิปภายใน ${deadline} น. มิฉะนั้นระบบจะยกเลิกการจองอัตโนมัติ\n` +
      `แนบสลิป: ${MY_BOOKINGS_URL}\n\n` +
      `Payment reminder: booking ${booking.booking_ref} is still unpaid. ` +
      `Please transfer and upload your slip by ${deadline}, or the booking will be cancelled automatically.\n` +
      `Nawin Resort Khaokho`;
  } else {
    text =
      `ยืนยันการจองสำเร็จ ✅\n` +
      `เลขที่จอง: ${booking.booking_ref}\n` +
      `ห้อง: ${unitName}\n` +
      `เช็คอิน: ${booking.check_in}\n` +
      `เช็คเอาท์: ${booking.check_out}\n` +
      `Nawin Resort Khaokho`;
  }

  const ok = await pushMessage(lineUserId, text);

  await supabase.from("notifications_log").insert({
    booking_id: bookingId,
    channel: "line",
    status: ok ? "sent" : "failed",
    detail: kind === "payment_reminder" ? "payment_reminder" : null,
  });

  return new Response("OK", { status: 200 });
});
