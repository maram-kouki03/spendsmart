import { Router } from 'express';
import { many, one } from '../db.js';
import { ah, monthRange, round2, daysUntil, initials } from '../lib/util.js';
import { getSources, getBudgets } from '../lib/finance.js';

const r = Router();

/**
 * Everything the dashboard, sidebar and top bar need in one call. Read-only: subscription
 * renewals are charged by the background job, not here. "This month" is the user's calendar
 * month in profiles.timezone.
 */
r.get('/summary', ah(async (req, res) => {
  const uid = req.user.id;
  const tz = req.profile.timezone;
  const { start, end } = monthRange(new Date(), tz);

  const [allSources, monthTx, recent, budgets, subs, incoming, unread] = await Promise.all([
    getSources(uid, undefined, { archived: true }),
    many('select kind, amount, category from public.transactions where user_id = $1 and occurred_at >= $2 and occurred_at < $3', [uid, start, end]),
    many('select id, source_id, name, amount, kind, occurred_at from public.transactions where user_id = $1 order by occurred_at desc limit 60', [uid]),
    getBudgets(uid),
    many('select * from public.subscriptions where user_id = $1 and active order by next_renewal', [uid]),
    many(
      `select s.id, s.title, s.share_amount, s.total_amount, s.group_id, s.from_user, s.created_at,
              json_build_object('full_name', p.full_name, 'email', p.email) as "from"
         from public.split_requests s
         join public.profiles p on p.id = s.from_user
        where s.to_user = $1 and s.status = 'pending'
        order by s.created_at desc`,
      [uid]
    ),
    one('select count(*) as count from public.notifications where user_id = $1 and not read', [uid])
  ]);

  let spent = 0, income = 0;
  for (const t of monthTx) {
    if (t.kind === 'expense') spent += Number(t.amount);
    if (t.kind === 'income') income += Number(t.amount);
  }
  const lastBySource = {};
  for (const t of recent) if (!lastBySource[t.source_id]) lastBySource[t.source_id] = t;
  const incomeFrom = [...new Set(recent.filter((t) => t.kind === 'income').slice(0, 3).map((t) => t.name))];

  const upcoming = [
    ...subs.filter((s) => daysUntil(s.next_renewal, tz) <= 7).map((s) => ({
      type: 'subscription', id: s.id, title: s.name, amount: Number(s.price), days: daysUntil(s.next_renewal, tz), date: s.next_renewal, icon: s.icon, color: s.color
    })),
    ...incoming.map((q) => ({
      type: 'split', id: q.id, title: q.title, amount: Number(q.share_amount), group: !!q.group_id,
      from: q.from?.full_name || q.from?.email, initials: initials(q.from?.full_name, q.from?.email)
    }))
  ];

  const sources = allSources.filter((s) => !s.archived);
  res.json({
    profile: req.profile,
    // Archived cards still count: a zero balance adds nothing, a non-zero one is still your money.
    totals: { available: round2(allSources.reduce((a, s) => a + s.balance, 0)), spent: round2(spent), income: round2(income), incomeFrom },
    monthStart: start,
    sources: sources.map((s) => ({ ...s, last: lastBySource[s.id] || null })),
    archivedSources: allSources.filter((s) => s.archived),
    upcoming,
    budgets: { total: budgets.length, under: budgets.filter((b) => b.status !== 'over').length, alerts: budgets.filter((b) => b.status !== 'under') },
    unread: unread.count || 0
  });
}));

export default r;
