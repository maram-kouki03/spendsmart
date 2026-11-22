import { pool, many, one, query } from '../db.js';
import { HttpError, round2, money, localYm } from './util.js';

export const CATEGORIES = ['Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More'];

// Every helper takes an optional `ex` (a transaction client) so it can join the caller's transaction.

const shapeSource = (s) => ({ ...s, starting_balance: Number(s.starting_balance), balance: round2(s.balance), archived: !!s.archived_at });

/** The user's cards and wallets with live balances. Archived ones only with `{ archived: true }`. */
export async function getSources(userId, ex = pool, { archived = false } = {}) {
  const rows = await many(
    `select * from public.source_balances
      where user_id = $1 ${archived ? '' : 'and archived_at is null'}
      order by position, created_at`,
    [userId], ex
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
  if (s.archived) throw new HttpError(400, `${s.name} is archived — restore it in Settings to use it again.`, 'source_archived');
  return s;
}

/**
 * Expense totals per category for a user in the current calendar month of *their* time zone
 * (profiles.timezone), so it also works for other people's budgets in shared views.
 */
export async function monthSpendByCategory(userId, ex = pool) {
  const rows = await many(
    `with m as (
       select date_trunc('month', now() at time zone p.timezone) as start, p.timezone as tz
         from public.profiles p where p.id = $1
     )
     select t.category, sum(t.amount) as total
       from public.transactions t, m
      where t.user_id = $1 and t.kind = 'expense'
        and t.occurred_at >= (m.start at time zone m.tz)
        and t.occurred_at <  ((m.start + interval '1 month') at time zone m.tz)
      group by t.category`,
    [userId], ex
  );
  const map = {};
  for (const r of rows) map[r.category] = round2(r.total);
  return map;
}

export function budgetStatus(pct, thr) {
  if (pct > 100) return 'over';
  if (pct >= thr) return 'near';
  return 'under';
}

export async function getBudgets(userId, ex = pool) {
  const [budgets, spend] = await Promise.all([
    many('select * from public.budgets where user_id = $1 order by created_at', [userId], ex),
    monthSpendByCategory(userId, ex)
  ]);
  return budgets.map((b) => {
    const spent = spend[b.category] || 0;
    const limit = Number(b.monthly_limit);
    const pct = Math.round((spent / limit) * 100);
    return { ...b, monthly_limit: limit, spent, pct, status: budgetStatus(pct, b.alert_threshold) };
  });
}

/** Adds a notification; a repeated dedupe_key for the same user is ignored. */
export async function notify(userId, n, ex = pool) {
  try {
    await query(
      `insert into public.notifications (user_id, type, title, body, data, dedupe_key)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, dedupe_key) do nothing`,
      [userId, n.type, n.title, n.body ?? null, JSON.stringify(n.data ?? {}), n.dedupe_key ?? null], ex
    );
  } catch (e) {
    // Inside a transaction a failed statement aborts the whole transaction, so let it bubble up there.
    if (ex !== pool) throw e;
    console.warn('notify failed', e.message);
  }
}

/**
 * After an expense lands, warn when a budget in that category just crossed
 * its alert threshold or its limit. Returns the impacted budgets.
 */
export async function checkBudgetAlerts(profile, category, added, ex = pool) {
  const budgets = (await getBudgets(profile.id, ex)).filter((b) => b.category === category);
  const month = localYm(new Date(), profile.timezone);
  const cur = profile.currency;
  const out = [];
  for (const b of budgets) {
    const beforeSpent = round2(b.spent - added);
    const beforePct = Math.round((beforeSpent / b.monthly_limit) * 100);
    out.push({ id: b.id, name: b.name, category: b.category, limit: b.monthly_limit, threshold: b.alert_threshold,
      before: beforeSpent, after: b.spent, beforePct, pct: b.pct, status: b.status });
    if (!profile.notify_budget) continue;
    if (beforePct <= 100 && b.pct > 100) {
      await notify(profile.id, { type: 'over', title: `${b.name} is over budget`, body: `${money(b.spent, cur)} / ${money(b.monthly_limit, cur)}`,
        data: { budget_id: b.id }, dedupe_key: `over:${b.id}:${month}` }, ex);
    } else if (beforePct < b.alert_threshold && b.pct >= b.alert_threshold) {
      await notify(profile.id, { type: 'budget', title: `You've used ${b.pct}% of your ${b.name} budget`, body: `${money(b.spent, cur)} / ${money(b.monthly_limit, cur)}`,
        data: { budget_id: b.id, pct: b.pct }, dedupe_key: `budget:${b.id}:${month}` }, ex);
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
    [userId], ex
  );
}
