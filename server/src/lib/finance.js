import { db } from '../supabase.js';
import { must, monthRange, round2, money, daysUntil } from './util.js';

export const CATEGORIES = ['Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More'];

export async function getSources(userId) {
  const rows = must(await db.from('source_balances').select('*').eq('user_id', userId).order('position').order('created_at'));
  return rows.map((s) => ({ ...s, starting_balance: Number(s.starting_balance), balance: round2(s.balance) }));
}

export async function getSource(userId, sourceId) {
  const row = must(await db.from('source_balances').select('*').eq('user_id', userId).eq('id', sourceId).maybeSingle());
  return row ? { ...row, balance: round2(row.balance) } : null;
}

/** Expense totals per category for a user in the current month. */
export async function monthSpendByCategory(userId, when = new Date()) {
  const { start, end } = monthRange(when);
  const rows = must(await db.from('transactions').select('category, amount')
    .eq('user_id', userId).eq('kind', 'expense').gte('occurred_at', start).lt('occurred_at', end));
  const map = {};
  for (const r of rows) map[r.category] = round2((map[r.category] || 0) + Number(r.amount));
  return map;
}

export function budgetStatus(pct, thr) {
  if (pct > 100) return 'over';
  if (pct >= thr) return 'near';
  return 'under';
}

export async function getBudgets(userId) {
  const [budgets, spend] = await Promise.all([
    db.from('budgets').select('*').eq('user_id', userId).order('created_at').then(must),
    monthSpendByCategory(userId)
  ]);
  return budgets.map((b) => {
    const spent = spend[b.category] || 0;
    const limit = Number(b.monthly_limit);
    const pct = Math.round((spent / limit) * 100);
    return { ...b, monthly_limit: limit, spent, pct, status: budgetStatus(pct, b.alert_threshold) };
  });
}

export async function notify(userId, n) {
  const { error } = await db.from('notifications').upsert(
    { user_id: userId, type: n.type, title: n.title, body: n.body ?? null, data: n.data ?? {}, dedupe_key: n.dedupe_key ?? null },
    { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }
  );
  if (error) console.warn('notify failed', error.message);
}

/**
 * After an expense lands, warn when a budget in that category just crossed
 * its alert threshold or its limit. Returns the impacted budgets.
 */
export async function checkBudgetAlerts(profile, category, added) {
  const budgets = (await getBudgets(profile.id)).filter((b) => b.category === category);
  const month = new Date().toISOString().slice(0, 7);
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
        data: { budget_id: b.id }, dedupe_key: `over:${b.id}:${month}` });
    } else if (beforePct < b.alert_threshold && b.pct >= b.alert_threshold) {
      await notify(profile.id, { type: 'budget', title: `You've used ${b.pct}% of your ${b.name} budget`, body: `${money(b.spent, cur)} / ${money(b.monthly_limit, cur)}`,
        data: { budget_id: b.id, pct: b.pct }, dedupe_key: `budget:${b.id}:${month}` });
    }
  }
  return out;
}

function addMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/**
 * Logs renewals that have come due (as a Bills expense on the subscription's
 * source), rolls next_renewal forward, and sends 3-day reminders.
 */
export async function syncSubscriptions(profile) {
  const subs = must(await db.from('subscriptions').select('*').eq('user_id', profile.id).eq('active', true));
  for (const s of subs) {
    let next = s.next_renewal;
    let guard = 0;
    while (daysUntil(next) < 0 && guard++ < 24) {
      if (s.source_id) {
        await db.from('transactions').insert({ user_id: profile.id, source_id: s.source_id, kind: 'expense', name: s.name,
          category: 'Bills', amount: s.price, occurred_at: new Date(next + 'T09:00:00Z').toISOString(), note: 'Subscription renewal' });
      }
      next = addMonth(next);
    }
    if (next !== s.next_renewal) await db.from('subscriptions').update({ next_renewal: next }).eq('id', s.id);
    const days = daysUntil(next);
    if (profile.notify_subs && days >= 0 && days <= 3) {
      await notify(profile.id, { type: 'subscription', title: `${s.name} renews ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
        body: money(s.price, profile.currency), data: { subscription_id: s.id }, dedupe_key: `sub:${s.id}:${next}` });
    }
  }
}
