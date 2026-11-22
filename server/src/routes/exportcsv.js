import { Router } from 'express';
import { many } from '../db.js';
import { ah } from '../lib/util.js';
import { getBudgets } from '../lib/finance.js';

const r = Router();

const cell = (v) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const row = (arr) => arr.map(cell).join(',');

r.get('/export.csv', ah(async (req, res) => {
  const uid = req.user.id;
  const [tx, budgets, goals, subs] = await Promise.all([
    many(
      `select t.*, s.name as source_name
         from public.transactions t left join public.sources s on s.id = t.source_id
        where t.user_id = $1 order by t.occurred_at desc`,
      [uid]
    ),
    getBudgets(uid),
    many('select * from public.goals where user_id = $1', [uid]),
    many('select * from public.subscriptions where user_id = $1', [uid])
  ]);
  const lines = ['# Transactions', row(['date', 'type', 'name', 'category', 'source', 'amount', 'note'])];
  tx.forEach((t) => lines.push(row([t.occurred_at, t.kind, t.name, t.category, t.source_name, t.amount, t.note])));
  lines.push('', '# Budgets', row(['category', 'name', 'monthly_limit', 'alert_threshold', 'spent_this_month']));
  budgets.forEach((b) => lines.push(row([b.category, b.name, b.monthly_limit, b.alert_threshold, b.spent])));
  lines.push('', '# Goals', row(['name', 'target', 'initial_saved', 'target_date']));
  goals.forEach((g) => lines.push(row([g.name, g.target, g.initial_saved, g.target_date])));
  lines.push('', '# Subscriptions', row(['name', 'price', 'next_renewal', 'active']));
  subs.forEach((s) => lines.push(row([s.name, s.price, s.next_renewal, s.active])));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="spendsmart-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + lines.join('\n'));
}));

export default r;
