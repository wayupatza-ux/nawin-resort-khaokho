// line-group-notify: pushes a LINE message to the staff project group chat
// (id captured automatically by line-webhook the first time the bot is
// added to a group -- see resort_settings.staff_notify_group_line_id).
// Called only by the notify_staff_group_new_booking() DB trigger via pg_net,
// authenticated with a shared internal secret (verify_jwt=false -- not a
// real API for browsers). body.kind:
//   "confirmed"    (default) a booking became confirmed, any source
//   "liff_pending" a guest just booked through LINE and hasn't paid yet --
//                  staff can follow up before the 24h auto-cancel (migration 0023)
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getSecret(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { secret_name: name });
  if (error || !data) throw new Error(`${name} not configured`);
  return data as string;
}

async function pushMessage(to: string, text: string) {
  const accessToken = await getSecret("line_channel_access_token");
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });
  return res.ok;
}

const SOURCE_LABELS: Record<string, string> = {
  agoda: "🌐 Agoda",
  "staff-liff": "👤 พนักงานคีย์เอง (walk-in/โทรจอง)",
  liff: "📱 แขกจองเอง (LINE)",
  "walk-in": "🚪 Walk-in",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const internalSecret = await getSecret("internal_functions_secret").catch(() => null);
  const headerSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || headerSecret !== internalSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const bookingId = body?.booking_id;
  const kind = body?.kind === "liff_pending" ? "liff_pending" : "confirmed";
  if (!bookingId) return new Response("booking_id required", { status: 400 });

  const { data: groupSetting } = await supabase
    .from("resort_settings")
    .select("value")
    .eq("key", "staff_notify_group_line_id")
    .maybeSingle();

  if (!groupSetting?.value) {
    await supabase.from("notifications_log").insert({
      booking_id: bookingId,
      channel: "line_group",
      status: "skipped",
      detail: "staff_notify_group_line_id not set -- bot not added to a group yet",
    });
    return new Response("OK", { status: 200 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "booking_ref, source, created_at, check_in, check_out, num_guests, total_amount, breakfast_included, guests(display_name, phone), units(name)",
    )
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    await supabase.from("notifications_log").insert({
      booking_id: bookingId,
      channel: "line_group",
      status: "failed",
      detail: "booking not found",
    });
    return new Response("OK", { status: 200 });
  }

  const sourceLabel = SOURCE_LABELS[booking.source] ?? booking.source;
  // deno-lint-ignore no-explicit-any
  const g = booking.guests as any;
  // deno-lint-ignore no-explicit-any
  const u = booking.units as any;
  const guestName = g?.display_name ?? "-";
  const phone = g?.phone ? ` (${g.phone})` : "";
  const breakfastLabel = booking.breakfast_included ? "รวม 🍳" : "ไม่รวม";

  const header = kind === "liff_pending"
    ? `⏳ แขกจองผ่าน LINE — รอชำระเงิน\n`
    : `📥 มีการจองใหม่ ${sourceLabel}\n`;
  let text =
    header +
    `เลขที่จอง: ${booking.booking_ref}\n` +
    `แขก: ${guestName}${phone}\n` +
    `ห้อง: ${u?.name ?? "-"}\n` +
    `เช็คอิน: ${booking.check_in}  เช็คเอาท์: ${booking.check_out}\n` +
    `ผู้เข้าพัก: ${booking.num_guests} คน\n` +
    `อาหารเช้า: ${breakfastLabel}\n` +
    `ยอด: ${Number(booking.total_amount).toLocaleString("th-TH")} บาท`;
  // Until Beds24 pushes PMS availability to Agoda, a direct booking has to
  // be closed on Agoda by hand (N4 12 Dec 2026 stayed open and could have
  // been double-sold). Switch off via resort_settings once sync is live.
  if (kind === "confirmed" && !["agoda", "booking.com", "beds24"].includes(booking.source)) {
    const { data: remind } = await supabase
      .from("resort_settings")
      .select("value")
      .eq("key", "agoda_manual_close_reminder")
      .maybeSingle();
    if ((remind?.value ?? "on") !== "off") {
      text += `\n\n⚠️ อย่าลืมปิดห้องนี้บน Agoda ตามวันที่เข้าพัก (ระบบยังไม่ sync อัตโนมัติ)`;
    }
  }
  if (kind === "liff_pending") {
    const deadline = new Date(new Date(booking.created_at).getTime() + 24 * 3600_000)
      .toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    text += `\n\n⚠️ ถ้ายังไม่ได้รับสลิปภายใน ${deadline} น. ระบบจะยกเลิกอัตโนมัติ — ช่วยทักแขกเพื่อปิดการขาย`;
  }

  const ok = await pushMessage(groupSetting.value, text);

  await supabase.from("notifications_log").insert({
    booking_id: bookingId,
    channel: "line_group",
    status: ok ? "sent" : "failed",
    detail: kind === "liff_pending" ? "liff_pending" : null,
  });

  return new Response("OK", { status: 200 });
});
