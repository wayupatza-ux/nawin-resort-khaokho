// Payment records for direct bookings (migration 0022). Staff record what
// the guest paid — a bank transfer needs its slip — and the owner verifies
// it on payments.html. A booking only becomes "confirmed" once recorded
// payments cover a 50% deposit; the DB enforces the same rule for staff.

export const METHOD_TH = { transfer: "โอน", promptpay: "PromptPay", cash: "เงินสด" };
export const DEPOSIT_SHARE = 0.5;

export async function uploadSlip(supabase, bookingId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${bookingId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("payment-slips").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw new Error("อัปโหลดสลิปไม่สำเร็จ: " + error.message);
  return path;
}

// Inserts the payment, then confirms a pending booking once the deposit is
// covered. Returns true when the booking ended up confirmed by this call.
export async function recordPayment(supabase, bookingId, { amount, method, file, total, note }) {
  const slipPath = file ? await uploadSlip(supabase, bookingId, file) : null;
  const { error } = await supabase.from("payments").insert({
    booking_id: bookingId,
    amount,
    method,
    slip_url: slipPath,
    note: note || null,
  });
  if (error) throw new Error(error.message);

  const [{ data: booking }, { data: pays }] = await Promise.all([
    supabase.from("bookings").select("status, total_amount").eq("id", bookingId).single(),
    supabase.from("payments").select("amount").eq("booking_id", bookingId),
  ]);
  const paid = (pays || []).reduce((s, p) => s + Number(p.amount), 0);
  const bookingTotal = Number(booking?.total_amount ?? total);
  if (booking?.status === "pending" && paid >= bookingTotal * DEPOSIT_SHARE) {
    const { error: upErr } = await supabase.from("bookings").update({ status: "confirmed" }).eq("id", bookingId);
    if (upErr) throw new Error(upErr.message);
    return true;
  }
  return false;
}

// Summary used by the booking list/popup and the monthly report.
//   ota      — paid through Agoda/Booking.com
//   unpaid   — nothing recorded
//   partial  — some money recorded, less than the total
//   paid     — recorded ≥ total (verified or not, see `unverified`)
export function paymentSummary(booking, payments) {
  const total = Number(booking.total_amount) || 0;
  const list = payments || [];
  const paid = list.reduce((s, p) => s + Number(p.amount), 0);
  const verified = list.filter((p) => p.verified).reduce((s, p) => s + Number(p.amount), 0);
  const isOta = ["agoda", "booking.com", "beds24"].includes(booking.source);
  let state = "unpaid";
  if (isOta) state = "ota";
  else if (total <= 0 || paid >= total) state = "paid";
  else if (paid > 0) state = "partial";
  return { total, paid, verified, unverified: paid - verified, outstanding: Math.max(0, total - paid), state };
}

export const PAYMENT_BADGE = {
  ota: ["ota", "ชำระผ่าน OTA"],
  unpaid: ["unpaid", "❗ยังไม่ชำระ"],
  partial: ["partial", "มัดจำแล้ว"],
  paid: ["paid", "💰 ชำระครบ"],
};
