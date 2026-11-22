import { Router } from 'express';
import { many } from '../db.js';
import { ah, round2, zonedParts, zonedTime, localYmd, localYm, addDays } from '../lib/util.js';

const r = Router();

/** All income/expense rows for one user since `from` (no row cap with direct SQL). */
function txSince(uid, from) {
  return many(
    `select kind, amount, category, occurred_at from public.transactions
      where user_id = $1 and kind in ('expense', 'income') and occurred_at >= $2
      order by occurred_at`,
    [uid, from.toISOString()]
  );
}

/**
 * Chart data for the dashboard: this month by category, last 30 days, last 6 months.
 * Days and months are calendar days/months in the user's time zone. Excludes goal transfers.
 */
r.get('/analytics', ah(async (req, res) => {
  const tz = req.profile.timezone;
  const now = new Date();
  const p = zonedParts(now, tz);
  const today = localYmd(now, tz);
  const firstDay = addDays(today, -29);
  const [fy, fm, fd] = firstDay.split('-').map(Number);
  const dayStart = zonedTime(fy, fm - 1, fd, tz);
  const monthStart = zonedTime(p.y, p.m, 1, tz);
  const sixStart = zonedTime(p.y, p.m - 5, 1, tz);
  const from = sixStart < dayStart ? sixStart : dayStart;

  const rows = await txSince(req.user.id, from);

  const daily = new Map();
  for (let i = 0; i < 30; i++) daily.set(addDays(firstDay, i), 0);
  const monthly = new Map();
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(p.y, p.m - 5 + i, 1));
    monthly.set(d.toISOString().slice(0, 7), { income: 0, expense: 0 });
  }
  const byCat = new Map();

  for (const t of rows) {
    const at = new Date(t.occurred_at);
    const amt = Number(t.amount) || 0;
    const m = monthly.get(localYm(at, tz));
    if (m) m[t.kind] += amt;
    if (t.kind !== 'expense') continue;
    const d = localYmd(at, tz);
    if (daily.has(d)) daily.set(d, daily.get(d) + amt);
    if (at >= monthStart) byCat.set(t.category, (byCat.get(t.category) || 0) + amt);
  }

  res.json({
    byCategory: [...byCat].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total),
    daily: [...daily].map(([date, total]) => ({ date, total: round2(total) })),
    monthly: [...monthly].map(([month, v]) => ({ month, income: round2(v.income), expense: round2(v.expense) }))
  });
}));

export default r;
