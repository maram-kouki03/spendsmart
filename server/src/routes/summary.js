import { Router } from 'express';
import { db } from '../supabase.js';
import { ah, must, monthRange, round2, daysUntil, initials } from '../lib/util.js';
import { getSources, getBudgets, syncSubscriptions } from '../lib/finance.js';

const r = Router();

/** Everything the dashboard, sidebar and top bar need in one call. */
r.get('/summary', ah(async (req, res) => {
  const uid = req.user.id;
  await syncSubscriptions(req.profile);
  const { start, end } = monthRange();

  const [sources, monthTx, recent, budgets, subs, incoming, unread] = await Promise.all([
    getSources(uid),
    db.from('transactions').select('kind, amount, category').eq('user_id', uid).gte('occurred_at', start).lt('occurred_at', end).then(must),
    db.from('transactions').select('id, source_id, name, amount, kind, occurred_at').eq('user_id', uid).order('occurred_at', { ascending: false }).limit(60).then(must),
    getBudgets(uid),
    db.from('subscriptions').select('*').eq('user_id', uid).eq('active', true).order('next_renewal').then(must),
    db.from('split_requests').select('id, title, share_amount, total_amount, group_id, from_user, created_at, from:profiles!split_requests_from_user_fkey(full_name, email)')
      .eq('to_user', uid).eq('status', 'pending').order('created_at', { ascending: false }).then(must),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false)
  ]);

  let spent = 0, income = 0;
  const incomeCats = new Set();
  for (const t of monthTx) {
    if (t.kind === 'expense') spent += Number(t.amount);
    if (t.kind === 'income') { income += Number(t.amount); }
  }
  const lastBySource = {};
  for (const t of recent) if (!lastBySource[t.source_id]) lastBySource[t.source_id] = t;
  const incomeNames = recent.filter((t) => t.kind === 'income').slice(0, 3).map((t) => t.name);
  incomeNames.forEach((n) => incomeCats.add(n));

  const upcoming = [
    ...subs.filter((s) => daysUntil(s.next_renewal) <= 7).map((s) => ({
      type: 'subscription', id: s.id, title: s.name, amount: Number(s.price), days: daysUntil(s.next_renewal), date: s.next_renewal, icon: s.icon, color: s.color
    })),
    ...incoming.map((q) => ({
      type: 'split', id: q.id, title: q.title, amount: Number(q.share_amount), group: !!q.group_id,
      from: q.from?.full_name || q.from?.email, initials: initials(q.from?.full_name, q.from?.email)
    }))
  ];

  res.json({
    profile: req.profile,
    totals: { available: round2(sources.reduce((a, s) => a + s.balance, 0)), spent: round2(spent), income: round2(income), incomeFrom: [...incomeCats] },
    monthStart: start,
    sources: sources.map((s) => ({ ...s, last: lastBySource[s.id] || null })),
    upcoming,
    budgets: { total: budgets.length, under: budgets.filter((b) => b.status !== 'over').length, alerts: budgets.filter((b) => b.status !== 'under') },
    unread: unread.count || 0
  });
}));

export default r;
