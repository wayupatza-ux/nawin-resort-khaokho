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

// Returns the signed-in user's role ('owner' | 'manager' | 'staff'), or
// null if they have no profiles row. Used for owner-only UI (units/reports).
export async function getRole(session) {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();
  return data?.role ?? null;
}

// Hides every element tagged [data-owner-only] when the signed-in user's
// role isn't 'owner'. Call after requireSession() on any page whose nav
// includes the units/reports link.
export async function gateOwnerOnlyNav(session) {
  const role = await getRole(session);
  if (role !== "owner") {
    document.querySelectorAll("[data-owner-only]").forEach((el) => el.remove());
  }
  return role;
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
