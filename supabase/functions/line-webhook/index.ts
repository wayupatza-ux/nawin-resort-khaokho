// line-webhook: receives LINE Messaging API webhook events for the Nawin
// Resort Khaokho OA. verify_jwt=false (LINE can't send a Supabase JWT);
// authenticity is verified via the x-line-signature HMAC instead.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getSecret(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { secret_name: name });
  if (error || !data) throw new Error(`${name} not configured`);
  return data as string;
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = await getSecret("line_channel_secret");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

const WELCOME_MESSAGES = [
  {
    type: "text",
    text:
      "ยินดีต้อนรับสู่ Nawin Resort Khaokho 🏡🌲\n" +
      "ที่พักท่ามกลางธรรมชาติ อ.เขาค้อ จ.เพชรบูรณ์\n\n" +
      "จองห้องพักหรือเช็คสถานะการจองได้ทันทีที่เมนูด้านล่าง 👇\n" +
      "หรือกดลิงก์นี้เพื่อจองเลย:\n" +
      "https://khaokho.nawingroup.com/guest-app/\n\n" +
      "มีคำถามเพิ่มเติม พิมพ์ทักมาได้เลย ทีมงานยินดีให้บริการ",
  },
  {
    type: "text",
    text:
      "🔒 เพื่อความปลอดภัย: ระบบจะไม่ขอให้โอนเงินผ่านแชทเด็ดขาด " +
      "ชำระผ่าน QR PromptPay ในแอปเท่านั้น หากมีผู้ทักมาขอให้โอนเงินนอกระบบ อย่าโอนและแจ้งเราได้ทันที",
  },
];

async function replyMessage(replyToken: string, messages: unknown[]) {
  const token = await getSecret("line_channel_access_token");
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) console.error("reply failed", res.status, await res.text());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  let valid: boolean;
  try {
    valid = await verifySignature(rawBody, signature);
  } catch (e) {
    console.error(e);
    return new Response("server not configured", { status: 500 });
  }
  if (!valid) return new Response("invalid signature", { status: 401 });

  const payload = JSON.parse(rawBody);
  const events = payload.events ?? [];

  for (const event of events) {
    const eventId: string | undefined = event.webhookEventId;
    if (!eventId) continue;

    // Dedupe: LINE may retry delivery. Insert-or-skip via unique PK.
    const { error: dedupeErr } = await supabase
      .from("line_webhook_events")
      .insert({ id: eventId });
    if (dedupeErr) {
      // already processed (unique violation) — skip silently
      continue;
    }

    if (event.type === "follow" && event.replyToken) {
      try {
        await replyMessage(event.replyToken, WELCOME_MESSAGES);
      } catch (e) {
        console.error("welcome message failed", e);
      }
    }

    // v1 scope: no other bot reply logic yet (booking happens via LIFF, not
    // chat commands). Other events are logged/deduped only.
  }

  return new Response("OK", { status: 200 });
});
