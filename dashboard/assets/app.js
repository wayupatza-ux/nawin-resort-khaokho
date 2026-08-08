import { CONFIG } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "./index.html";
    return null;
  }
  return session;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "./index.html";
}

export function fmtDate(d) {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtBaht(n) {
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " บาท";
}

export const STATUS_TH = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  checked_in: "เช็คอินแล้ว",
  checked_out: "เช็คเอาท์แล้ว",
  cancelled: "ยกเลิกแล้ว",
  no_show: "ไม่มาเข้าพัก",
};
