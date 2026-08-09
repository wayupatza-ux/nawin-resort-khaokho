// line-admin: one-off admin operations against the LINE Messaging API
// (rich menu create/upload/list/default/delete) for the Nawin Resort
// Khaokho OA. verify_jwt=false — authorized via a dedicated shared secret
// (x-internal-secret / line_admin_secret) rather than a Supabase JWT, since
// this is only ever called manually during setup, never by the app.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function getSecret(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { secret_name: name });
  if (error || !data) throw new Error(`${name} not configured`);
  return data as string;
}

async function checkSecret(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-internal-secret");
  if (!provided) return false;
  const expected = await getSecret("line_admin_secret").catch(() => null);
  return !!expected && provided === expected;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  const authorized = await checkSecret(req);
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/line-admin/, "");
  const token = await getSecret("line_channel_access_token");

  try {
    // POST /richmenu  { richMenuObject }
    if (req.method === "POST" && path === "/richmenu") {
      const body = await req.json();
      const res = await fetch("https://api.line.me/v2/bot/richmenu", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return json(data, res.status);
    }

    // POST /richmenu/:id/content  { imageBase64 }
    const contentMatch = path.match(/^\/richmenu\/([^/]+)\/content$/);
    if (req.method === "POST" && contentMatch) {
      const { imageBase64 } = await req.json();
      const bytes = base64ToBytes(imageBase64);
      const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${contentMatch[1]}/content`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" },
        body: bytes,
      });
      const text = await res.text();
      return json({ status: res.status, body: text }, res.status);
    }

    // POST /richmenu/:id/default
    const defaultMatch = path.match(/^\/richmenu\/([^/]+)\/default$/);
    if (req.method === "POST" && defaultMatch) {
      const res = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${defaultMatch[1]}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      return json({ status: res.status, body: text }, res.status);
    }

    // POST /richmenu/:id/delete
    const deleteMatch = path.match(/^\/richmenu\/([^/]+)\/delete$/);
    if (req.method === "POST" && deleteMatch) {
      const res = await fetch(`https://api.line.me/v2/bot/richmenu/${deleteMatch[1]}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      return json({ status: res.status, body: text }, res.status);
    }

    // GET /richmenu/list
    if (req.method === "GET" && path === "/richmenu/list") {
      const res = await fetch("https://api.line.me/v2/bot/richmenu/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return json(data, res.status);
    }

    // GET /richmenu/default
    if (req.method === "GET" && path === "/richmenu/default") {
      const res = await fetch("https://api.line.me/v2/bot/user/all/richmenu", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      return json({ status: res.status, body: text }, res.status);
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
