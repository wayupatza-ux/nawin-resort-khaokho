// pickup-report: read-only feed for Hermes' daily revenue-management report
// (.hermes/scripts/khaokho_pickup_report.py). Returns every live booking that
// hasn't checked out yet — no guest names or phone numbers, just what pricing
// decisions need: which unit/room type, which nights, which channel, when it
// was booked and for how much. verify_jwt=false; authorized with the same
// server-to-server secret Hermes already holds for agoda-intake.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function checkSecret(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-internal-secret");
  if (!provided) return false;
  const { data, error } = await supabase.rpc("get_secret", { secret_name: "agoda_intake_secret" });
  if (error || !data) return false;
  return provided === data;
}

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (!(await checkSecret(req))) return new Response("unauthorized", { status: 401 });

  const today = bangkokToday();
  const { data: units, error: uErr } = await supabase
    .from("units")
    .select("id, code, agoda_room_type_name");
  if (uErr) return json({ error: uErr.message }, 500);

  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("booking_ref, unit_id, check_in, check_out, source, status, total_amount, created_at")
    .gt("check_out", today)
    .not("status", "in", "(cancelled,no_show)")
    .order("check_in");
  if (bErr) return json({ error: bErr.message }, 500);

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));
  return json({
    today,
    units: (units ?? []).map((u) => ({ code: u.code, room_type: u.agoda_room_type_name })),
    bookings: (bookings ?? []).map((b) => {
      const u = unitById.get(b.unit_id);
      return {
        ref: b.booking_ref,
        unit: u?.code ?? null,
        room_type: u?.agoda_room_type_name ?? null,
        check_in: b.check_in,
        check_out: b.check_out,
        source: b.source,
        total_amount: Number(b.total_amount ?? 0),
        created_at: b.created_at,
      };
    }),
  });
});
