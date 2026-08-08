import { CONFIG } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let liffReadyPromise = null;

export function ensureLiff() {
  if (liffReadyPromise) return liffReadyPromise;
  liffReadyPromise = new Promise((resolve, reject) => {
    if (CONFIG.LIFF_ID === "REPLACE_ME_STAFF_LIFF_ID") {
      reject(new Error("LIFF_ID ยังไม่ได้ตั้งค่า — โปรดติดต่อผู้ดูแลระบบ"));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.onload = async () => {
      try {
        await window.liff.init({ liffId: CONFIG.LIFF_ID });
        if (!window.liff.isLoggedIn()) {
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

export async function callStaffApi(path, body) {
  const res = await fetch(`${CONFIG.STAFF_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
    err.lineUserId = data.lineUserId;
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fmtBaht(n) {
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " บาท";
}
