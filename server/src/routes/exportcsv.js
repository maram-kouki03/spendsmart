import { Router } from 'express';
import { db } from '../supabase.js';
import { ah, must } from '../lib/util.js';
import { getBudgets } from '../lib/finance.js';

const r = Router();

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const row = (arr) => arr.map(cell).join(',');

r.get('/export.csv', ah(async (req, res) => {
  const uid = req.user.id;
  const [tx, budgets, goals, subs] = await Promise.all([
    db.from('transactions').select('*, source:sources(name)').eq('user_id', uid).order('occurred_at', { ascending: false }).then(must),
    getBudgets(uid),
    db.from('goals').select('*').eq('user_id', uid).then(must),
    db.from('subscriptions').select('*').eq('user_id', uid).then(must)
  ]);
  const lines = ['# Transactions', row(['date', 'type', 'name', 'category', 'source', 'amount', 'note'])];
  tx.forEach((t) => lines.push(row([t.occurred_at, t.kind, t.name, t.category, t.source?.name, t.amount, t.note])));
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
