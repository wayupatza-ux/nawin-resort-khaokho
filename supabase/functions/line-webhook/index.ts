// line-webhook: receives LINE Messaging API webhook events for the Nawin
// Resort Khaokho OA. verify_jwt=false (LINE can't send a Supabase JWT);
// authenticity is verified via the x-line-signature HMAC instead.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getChannelSecret(): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", {
    secret_name: "line_channel_secret",
  });
  if (error || !data) throw new Error("line_channel_secret not configured");
  return data as string;
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = await getChannelSecret();
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

    // v1 scope: no bot reply logic yet (booking happens via LIFF, not chat
    // commands). Event is logged/deduped only; extend here later if needed
    // (e.g. handling "unfollow" to clean up, or quick-reply menus).
  }

  return new Response("OK", { status: 200 });
});
