import { pool, many, one, query } from '../db.js';
import { HttpError, round2, money, localYmd, addDays, addMonths, monthsBetween, zonedTime } from './util.js';

export const CATEGORIES = ['Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More'];

// Every helper takes an optional `ex` (a transaction client) so it can join the caller's transaction.

const shapeSource = (s) => ({
  ...s,
  starting_balance: Number(s.starting_balance),
  balance: round2(s.balance),
  archived: !!s.archived_at,
});

/**
 * The user's cards and wallets with live balances. Archived ones only with `{ archived: true }`.
 * A balance is never stored: the source_balances view computes starting_balance + income − every
 * other kind (expenses, goal deposits, shared savings), so it can't drift from the transactions.
 */
export async function getSources(userId, ex = pool, { archived = false } = {}) {
  const rows = await many(
    `select * from public.source_balances
      where user_id = $1 ${archived ? '' : 'and archived_at is null'}
      order by position, created_at`,
    [userId],
    ex
  );
  return rows.map(shapeSource);
}

/** One source of the user (archived or not), or null. */
export async function getSource(userId, sourceId, ex = pool) {
  const row = await one('select * from public.source_balances where user_id = $1 and id = $2', [userId, sourceId], ex);
  return row ? shapeSource(row) : null;
}

/** A source money can move in or out of now: the user's own and not archived. Throws 404 / 400. */
export async function getActiveSource(userId, sourceId, ex = pool) {
  const s = await getSource(userId, sourceId, ex);
  if (!s) throw new HttpError(404, 'Card or wallet not found');
  if (s.archived)
    throw new HttpError(400, `${s.name} is archived — restore it in Settings to use it again.`, 'source_archived');
  return s;
}

export const BUDGET_PERIODS = ['week', 'month', 'quarter', 'year', 'custom'];

const ymdUTC = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/**
 * The period of budget `b` that contains `today` ('YYYY-MM-DD' in the user's time zone), as
 * { start, end } dates with `end` exclusive: this week (Mon–Sun), this calendar month, the current
 * 3-month block counted from b.start_date, this calendar year, or b's own custom dates.
 * A custom budget always uses its own dates, even when today is outside them.
 */
export function budgetPeriod(b, today) {
  const [y, m, d] = today.split('-').map(Number);
  switch (b.period) {
    case 'week': {
      const monday = ymdUTC(y, m, d - ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
      return { start: monday, end: addDays(monday, 7) };
    }
    case 'quarter': {
      // Blocks are [start + 3k months, start + 3(k+1) months); before the first block, the first one.
      let k = Math.max(0, Math.floor(monthsBetween(b.start_date, today) / 3));
      while (today >= addMonths(b.start_date, 3 * k + 3)) k++;
      while (k > 0 && today < addMonths(b.start_date, 3 * k)) k--;
      return { start: addMonths(b.start_date, 3 * k), end: addMonths(b.start_date, 3 * k + 3) };
    }
    case 'year':
      return { start: ymdUTC(y, 1, 1), end: ymdUTC(y + 1, 1, 1) };
    case 'custom':
      return { start: b.start_date, end: addDays(b.end_date, 1) };
    default:
      return { start: ymdUTC(y, m, 1), end: ymdUTC(y, m + 1, 1) };
  }
}

/** The instant a local 'YYYY-MM-DD' day starts in `tz`. */
const dayStart = (ymd, tz) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return zonedTime(y, m - 1, d, tz);
};

export function budgetStatus(pct, thr) {
  if (pct > 100) return 'over';
  if (pct >= thr) return 'near';
  return 'under';
}

/**
 * The user's budgets, each with what was spent in its category during its current period (in the
 * user's time zone, profiles.timezone). Adds period_start / period_end (inclusive dates) and
 * `current` (false for a custom budget whose dates are past or still ahead).
 */
export async function getBudgets(userId, ex = pool) {
  const rows = await many(
    `select b.*, p.timezone from public.budgets b join public.profiles p on p.id = b.user_id
      where b.user_id = $1 order by b.created_at`,
    [userId],
    ex
  );
  if (!rows.length) return [];
  const tz = rows[0].timezone;
  const today = localYmd(new Date(), tz);
  const periods = rows.map((b) => budgetPeriod(b, today));
  const spentRows = await many(
    `select x.id, coalesce(sum(t.amount), 0) as spent
       from unnest($2::uuid[], $3::text[], $4::timestamptz[], $5::timestamptz[]) as x(id, category, s, e)
       left join public.transactions t
         on t.user_id = $1 and t.kind = 'expense' and t.category = x.category
        and t.occurred_at >= x.s and t.occurred_at < x.e
      group by x.id`,
    [
      userId,
      rows.map((b) => b.id),
      rows.map((b) => b.category),
      periods.map((p) => dayStart(p.start, tz).toISOString()),
      periods.map((p) => dayStart(p.end, tz).toISOString()),
    ],
    ex
  );
  const spentBy = Object.fromEntries(spentRows.map((r) => [r.id, round2(r.spent)]));
  return rows.map(({ timezone, ...b }, i) => {
    const { start, end } = periods[i];
    const spent = spentBy[b.id] || 0;
    const limit = Number(b.limit_amount);
    const pct = Math.round((spent / limit) * 100);
    return {
      ...b,
      limit_amount: limit,
      spent,
      pct,
      status: budgetStatus(pct, b.alert_threshold),
      period_start: start,
      period_end: addDays(end, -1),
      current: today >= start && today < end,
    };
  });
}

/** Adds a notification; a repeated dedupe_key for the same user is ignored. */
export async function notify(userId, n, ex = pool) {
  try {
    await query(
      `insert into public.notifications (user_id, type, title, body, data, dedupe_key)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, dedupe_key) do nothing`,
      [userId, n.type, n.title, n.body ?? null, JSON.stringify(n.data ?? {}), n.dedupe_key ?? null],
      ex
    );
  } catch (e) {
    // Inside a transaction a failed statement aborts the whole transaction, so let it bubble up there.
    if (ex !== pool) throw e;
    console.warn('notify failed', e.message);
  }
}

/**
 * After an expense of `added` on `occurredAt` lands, warn when a budget in that category just
 * crossed its alert threshold or its limit in the budget's current period (an expense dated outside
 * that period changes nothing). One alert of each kind per budget per period. Returns the impacted budgets.
 */
export async function checkBudgetAlerts(profile, category, added, occurredAt, ex = pool) {
  const day = localYmd(occurredAt, profile.timezone);
  const budgets = (await getBudgets(profile.id, ex)).filter(
    (b) => b.category === category && day >= b.period_start && day <= b.period_end
  );
  const cur = profile.currency;
  const out = [];
  for (const b of budgets) {
    const beforeSpent = round2(b.spent - added);
    const beforePct = Math.round((beforeSpent / b.limit_amount) * 100);
    out.push({
      id: b.id,
      name: b.name,
      category: b.category,
      limit: b.limit_amount,
      threshold: b.alert_threshold,
      period: b.period,
      period_start: b.period_start,
      period_end: b.period_end,
      before: beforeSpent,
      after: b.spent,
      beforePct,
      pct: b.pct,
      status: b.status,
    });
    if (!profile.notify_budget) continue;
    // Monthly budgets keep their older 'YYYY-MM' key, so alerts already sent this month aren't repeated.
    const periodKey = b.period === 'month' ? b.period_start.slice(0, 7) : `${b.period}:${b.period_start}`;
    const body = `${money(b.spent, cur)} / ${money(b.limit_amount, cur)} limit`;
    if (beforePct <= 100 && b.pct > 100) {
      await notify(
        profile.id,
        {
          type: 'over',
          title: `${b.name} is over its limit`,
          body,
          data: { budget_id: b.id },
          dedupe_key: `over:${b.id}:${periodKey}`,
        },
        ex
      );
    } else if (beforePct < b.alert_threshold && b.pct >= b.alert_threshold) {
      await notify(
        profile.id,
        {
          type: 'budget',
          title: `You've used ${b.pct}% of your ${b.name} limit`,
          body,
          data: { budget_id: b.id, pct: b.pct },
          dedupe_key: `budget:${b.id}:${periodKey}`,
        },
        ex
      );
    }
  }
  return out;
}

/** The three starter sources every new account gets. */
export async function createStarterSources(userId, ex) {
  await query(
    `insert into public.sources (user_id, name, kind, style, position) values
       ($1, 'Card 1', 'debit', 'g1', 0),
       ($1, 'Card 2', 'credit', 'g2', 1),
       ($1, 'Cash Wallet', 'cash', 'g3', 2)`,
    [userId],
    ex
  );
}
