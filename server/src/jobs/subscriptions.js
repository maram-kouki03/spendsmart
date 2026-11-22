import { many, one, query, tx } from '../db.js';
import { daysUntil, money, zonedTime } from '../lib/util.js';
import { notify } from '../lib/finance.js';

/**
 * Subscription renewals and reminders, for every user.
 *
 * Renewals used to be processed inside GET /summary, /subscriptions and /notifications. They now
 * run here: on server start, every hour, and with `npm run jobs:subscriptions -w server`.
 *
 * Double charges are prevented three ways:
 *   1. a transaction-level advisory lock (pg_try_advisory_xact_lock) — only one job runs at a
 *      time, across all server instances; it works through the Transaction pooler because the
 *      whole run is one transaction on one connection, and the lock ends with it;
 *   2. each subscription is processed with its row locked (FOR UPDATE), inside its own savepoint;
 *   3. a unique index on transactions (subscription_id, subscription_period) + ON CONFLICT DO NOTHING,
 *      so even a replayed period can never be charged twice.
 */

export const JOB_LOCK = 727301; // advisory-lock key (any constant; migrations use a different one)
const MAX_PERIODS = 24; // catch up at most two years per subscription per run
const REMIND_DAYS = 3;
const HOUR = 60 * 60 * 1000;

/** Same day next month, clamped to the month's last day ('2026-01-31' → '2026-02-28'). */
export function addMonth(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

/**
 * Charges every period of one subscription that has come due (renewal date ≤ today in the
 * user's time zone) as a Bills expense on its card, moves next_renewal forward and sends the
 * 3-day reminder. Safe to call any number of times. Returns { charged, reminded }.
 */
export function processSubscription(id, now = new Date()) {
  return tx((c) => chargeDue(c, id, now));
}

/** processSubscription's work, on transaction client `c`. */
async function chargeDue(c, id, now) {
  const s = await one(
    `select s.*, p.timezone, p.currency, p.notify_subs
       from public.subscriptions s join public.profiles p on p.id = s.user_id
      where s.id = $1
      for update of s`,
    [id], c
  );
  if (!s || !s.active) return { charged: 0, reminded: false };
  const tz = s.timezone;

  let next = s.next_renewal;
  let charged = 0;
  for (let i = 0; i < MAX_PERIODS && daysUntil(next, tz, now) <= 0; i++) {
    if (s.source_id) {
      const [y, m, d] = next.split('-').map(Number);
      const at = new Date(Math.min(zonedTime(y, m - 1, d, tz, 9).getTime(), now.getTime())); // 09:00 local, never in the future
      const r = await query(
        `insert into public.transactions
           (user_id, source_id, kind, name, category, amount, occurred_at, note, subscription_id, subscription_period)
         values ($1, $2, 'expense', $3, 'Bills', $4, $5, 'Subscription renewal', $6, $7)
         on conflict (subscription_id, subscription_period) where subscription_id is not null do nothing`,
        [s.user_id, s.source_id, s.name, s.price, at.toISOString(), s.id, next], c
      );
      charged += r.rowCount;
    }
    next = addMonth(next);
  }
  if (next !== s.next_renewal) await query('update public.subscriptions set next_renewal = $1 where id = $2', [next, s.id], c);

  const days = daysUntil(next, tz, now);
  let reminded = false;
  if (s.notify_subs && days >= 0 && days <= REMIND_DAYS) {
    await notify(s.user_id, {
      type: 'subscription',
      title: `${s.name} renews ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
      body: money(s.price, s.currency), data: { subscription_id: s.id }, dedupe_key: `sub:${s.id}:${next}`
    }, c);
    reminded = true;
  }
  return { charged, reminded };
}

/**
 * One pass over every active subscription that is due or within the reminder window, as one
 * transaction holding the job lock. Each subscription gets a savepoint, so one that fails is
 * rolled back on its own and the rest still commit. Returns { skipped: true } when another
 * instance holds the lock, else counts.
 */
export async function runSubscriptionJob({ now = new Date() } = {}) {
  return tx(async (c) => {
    const { ok } = await one('select pg_try_advisory_xact_lock($1) as ok', [JOB_LOCK], c);
    if (!ok) return { skipped: true };
    const due = await many(
      `select s.id
         from public.subscriptions s join public.profiles p on p.id = s.user_id
        where s.active and s.next_renewal <= ($2::timestamptz at time zone p.timezone)::date + $1::int
        order by s.next_renewal`,
      [REMIND_DAYS, now.toISOString()], c
    );
    const out = { processed: due.length, charged: 0, reminded: 0, failed: 0 };
    for (const { id } of due) {
      await c.query('savepoint sub');
      try {
        const r = await chargeDue(c, id, now);
        await c.query('release savepoint sub');
        out.charged += r.charged;
        out.reminded += r.reminded ? 1 : 0;
      } catch (e) {
        await c.query('rollback to savepoint sub'); // if even this fails, the whole run rolls back
        out.failed++;
        console.error(`Subscription ${id} renewal failed:`, e.message);
      }
    }
    return out;
  });
}

/** Runs the job now and then every hour; the timer doesn't keep the process alive. */
export function scheduleSubscriptionJob() {
  const run = () => runSubscriptionJob()
    .then((r) => {
      if (r.skipped) return;
      if (r.charged || r.failed) console.log(`Subscriptions: ${r.charged} renewal(s) charged, ${r.reminded} reminder(s), ${r.failed} failed`);
    })
    .catch((e) => console.error('Subscription job failed:', e.message));
  run();
  setInterval(run, HOUR).unref();
}
