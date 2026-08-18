import { CONFIG } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let liffReadyPromise = null;

export function ensureLiff() {
  if (liffReadyPromise) return liffReadyPromise;
  liffReadyPromise = new Promise((resolve, reject) => {
    if (CONFIG.LIFF_ID === "REPLACE_ME_LIFF_ID") {
      reject(new Error("LIFF_ID ยังไม่ได้ตั้งค่า — โปรดติดต่อผู้ดูแลระบบ"));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.onload = async () => {
      try {
        await window.liff.init({ liffId: CONFIG.LIFF_ID });
        if (!window.liff.isLoggedIn()) {
          if (!window.liff.isInClient()) {
            // Opened outside the LINE app (e.g. Facebook's in-app browser) —
            // a script-triggered liff.login() redirect gets blocked or
            // routed through the fragile external web-login flow in many
            // in-app browsers. Fail with a special error so the page can
            // show a real, user-tapped link instead, which OS deep-link
            // handoff honors far more reliably.
            const err = new Error("OPEN_IN_LINE");
            err.code = "OPEN_IN_LINE";
            reject(err);
            return;
          }
          window.liff.login();
          return; // page will redirect
        }
        resolve(window.liff);
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("โหลด LIFF SDK ไม่สำเร็จ"));
    document.head.appendChild(script);
  });
  return liffReadyPromise;
}

export async function getIdToken() {
  const liff = await ensureLiff();
  return liff.getIDToken();
}

export async function callGuestApi(path, body) {
  const res = await fetch(`${CONFIG.GUEST_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
  return data;
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

export async function getResortSettings() {
  const { data, error } = await supabase.from("resort_settings").select("key, value");
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is "data:<mime>;base64,<data>" — strip the prefix.
      const base64 = String(reader.result).split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}
