// daily-close: read-only feed for Hermes' 21:00 end-of-day report to บอสตอง
// (.hermes/scripts/khaokho_daily_close.py). Flags the money/stay problems
// the bank-statement reconciliation of 24 Oct 2026 turned up:
//   * direct bookings checking in within 3 days without a 50% deposit
//   * check-in date reached but not marked checked-in (no-show?)
//   * check-out date reached but not marked checked-out
//   * direct bookings marked confirmed/checked-in/out without the payment
//     to back it (deposit < 50%, or checked out without the full amount)
//   * payments recorded by staff that the owner hasn't verified yet
// Plus today's new bookings and payments. Guest first names only, no phones.
// verify_jwt=false; same server-to-server secret as pickup-report.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const OTA_SOURCES = ["agoda", "booking.com", "beds24"];
const DEPOSIT_SHARE = 0.5;

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

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Guest = { display_name: string | null; first_name: string | null } | null;
function firstName(g: Guest): string {
  return (g?.first_name || g?.display_name || "-").split(" ")[0];
}

Deno.serve(async (req: Request) => {
  if (!(await checkSecret(req))) return new Response("unauthorized", { status: 401 });

  const today = bangkokToday();
  const soon = addDays(today, 3);
  // created_at / paid_at are UTC; "today" in Bangkok starts at 17:00 UTC the day before.
  const dayStartUtc = new Date(Date.parse(today + "T00:00:00+07:00")).toISOString();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_ref, check_in, check_out, status, source, total_amount, created_at, " +
        "units(code), guests(display_name, first_name), creator:profiles!bookings_created_by_fkey(display_name), " +
        "payments(amount, method, verified, paid_at, slip_url)",
    )
    .not("status", "in", "(cancelled,no_show)")
    .or(`check_out.gte.${addDays(today, -60)},created_at.gte.${dayStartUtc}`)
    .order("check_in");
  if (error) return json({ error: error.message }, 500);

  const out = {
    today,
    unpaid_soon: [] as unknown[],
    not_checked_in: [] as unknown[],
    not_checked_out: [] as unknown[],
    confirmed_unpaid: [] as unknown[],
    unverified_payments: [] as unknown[],
    new_today: [] as unknown[],
    paid_today: [] as unknown[],
  };

  for (const b of bookings ?? []) {
    // deno-lint-ignore no-explicit-any
    const r = b as any;
    const total = Number(r.total_amount) || 0;
    const pays = (r.payments ?? []) as { amount: number; method: string; verified: boolean; paid_at: string; slip_url: string | null }[];
    const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
    const isOta = OTA_SOURCES.includes(r.source);
    const row = {
      ref: r.booking_ref,
      unit: r.units?.code ?? null,
      guest: firstName(r.guests),
      check_in: r.check_in,
      check_out: r.check_out,
      status: r.status,
      source: r.source,
      by: r.creator?.display_name ?? null,
      total,
      paid,
    };

    if (!isOta && total > 0) {
      const depositShort = paid < total * DEPOSIT_SHARE;
      if (["pending", "confirmed"].includes(r.status) && r.check_in >= today && r.check_in <= soon && depositShort) {
        out.unpaid_soon.push(row);
      }
      if ((["confirmed", "checked_in"].includes(r.status) && depositShort) || (r.status === "checked_out" && paid < total)) {
        out.confirmed_unpaid.push(row);
      }
      for (const p of pays.filter((p) => !p.verified)) {
        out.unverified_payments.push({ ...row, amount: Number(p.amount), method: p.method, has_slip: !!p.slip_url, paid_at: p.paid_at });
      }
      for (const p of pays.filter((p) => p.paid_at >= dayStartUtc)) {
        out.paid_today.push({ ...row, amount: Number(p.amount), method: p.method, verified: p.verified });
      }
    }
    // At 21:00 anyone due today should have arrived; checkout is at noon.
    if (["pending", "confirmed"].includes(r.status) && r.check_in <= today && r.check_out > today) {
      out.not_checked_in.push(row);
    }
    if (["pending", "confirmed", "checked_in"].includes(r.status) && r.check_out <= today) {
      out.not_checked_out.push(row);
    }
    if (r.created_at >= dayStartUtc) out.new_today.push(row);
  }

  return json(out);
});
