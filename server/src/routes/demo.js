import { Router } from 'express';
import { one, query, insertRows, tx } from '../db.js';
import { ah, HttpError } from '../lib/util.js';
import { createStarterSources, getSources } from '../lib/finance.js';

const r = Router();

const daysAgo = (n, h = 12, m = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
};
const inDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Fills an empty account with the sample month from the design so a new user
 * can explore every screen. Only runs when the account has no transactions.
 * Everything happens in one transaction: either the whole sample lands or nothing does.
 */
r.post(
  '/demo/seed',
  ah(async (req, res) => {
    const uid = req.user.id;
    await tx(async (c) => {
      // Serialise concurrent seeds for the same user (double-click).
      await query('select id from public.profiles where id = $1 for update', [uid], c);
      const { count } = await one('select count(*) as count from public.transactions where user_id = $1', [uid], c);
      if (count) throw new HttpError(400, 'Sample data can only be added to an empty account.');

      let sources = await getSources(uid, c);
      const byName = (n) => sources.find((s) => s.name === n);
      if (!byName('Card 1') || !byName('Card 2') || !byName('Cash Wallet')) {
        await query('delete from public.sources where user_id = $1', [uid], c);
        await createStarterSources(uid, c);
        sources = await getSources(uid, c);
      }
      const c1 = byName('Card 1').id,
        c2 = byName('Card 2').id,
        cash = byName('Cash Wallet').id;
      await query("update public.sources set starting_balance = 0, last4 = '4821' where id = $1", [c1], c);
      await query("update public.sources set starting_balance = 0, last4 = '7390' where id = $1", [c2], c);
      await query('update public.sources set starting_balance = 120 where id = $1', [cash], c);

      const T = (source_id, kind, name, category, amount, at, note) => ({
        user_id: uid,
        source_id,
        kind,
        name,
        category,
        amount,
        occurred_at: at,
        note: note || null,
      });
      await insertRows(c, 'transactions', [
        T(c1, 'income', 'Freelance UI project', 'Income', 450, daysAgo(4, 15, 30)),
        T(c2, 'income', 'Internship stipend', 'Income', 1800, daysAgo(4, 9)),
        T(cash, 'income', 'Birthday gift', 'Income', 100, daysAgo(3, 12)),
        T(c2, 'expense', 'Electricity bill', 'Bills', 46.3, daysAgo(2, 10, 2)),
        T(cash, 'expense', 'Pizza night with Sarah', 'Food', 24, daysAgo(2, 21, 30)),
        T(c2, 'expense', 'Green Basket Market', 'Groceries', 38.2, daysAgo(1, 18, 40)),
        T(c2, 'expense', 'Lip tint & mascara', 'Makeup', 22, daysAgo(1, 16, 15)),
        T(cash, 'expense', 'Bus pass top-up', 'Transport', 10, daysAgo(1, 7, 50)),
        T(c1, 'expense', 'Café Lumière', 'Coffee', 4.5, daysAgo(0, 9, 12)),
        T(cash, 'expense', 'Taxi to campus', 'Transport', 6, daysAgo(0, 8, 5)),
        T(c1, 'expense', 'Lunch at Dar Zitouna', 'Food', 11.8, daysAgo(0, 13, 20)),
        T(c1, 'expense', 'Coffee runs', 'Coffee', 68.5, daysAgo(3, 10)),
        T(c2, 'expense', 'Weekly groceries', 'Groceries', 229.8, daysAgo(3, 17)),
        T(c1, 'expense', 'Restaurants', 'Food', 106.2, daysAgo(3, 20)),
        T(c2, 'expense', 'Skincare', 'Makeup', 30, daysAgo(3, 15)),
      ]);

      await insertRows(c, 'budgets', [
        { user_id: uid, category: 'Coffee', name: 'Coffee', limit_amount: 115, alert_threshold: 80 },
        { user_id: uid, category: 'Food', name: 'Restaurants', limit_amount: 200, alert_threshold: 80 },
        { user_id: uid, category: 'Makeup', name: 'Lipstick & makeup', limit_amount: 45, alert_threshold: 90 },
        { user_id: uid, category: 'Groceries', name: 'Weekly groceries', limit_amount: 350, alert_threshold: 85 },
        { user_id: uid, category: 'Transport', name: 'Taxi & bus', limit_amount: 80, alert_threshold: 80 },
      ]);

      await insertRows(c, 'subscriptions', [
        {
          user_id: uid,
          name: 'StreamBox',
          price: 12.99,
          next_renewal: inDays(3),
          source_id: c1,
          icon: 'play',
          color: 'cocoa',
        },
        {
          user_id: uid,
          name: 'TuneWave',
          price: 5.99,
          next_renewal: inDays(7),
          source_id: c2,
          icon: 'music',
          color: 'green',
        },
        {
          user_id: uid,
          name: 'CloudDrive',
          price: 2.99,
          next_renewal: inDays(15),
          source_id: c1,
          icon: 'cloud',
          color: 'blue',
        },
        {
          user_id: uid,
          name: 'FitPulse Gym',
          price: 25,
          next_renewal: inDays(26),
          source_id: c2,
          icon: 'gym',
          color: 'butter',
        },
        {
          user_id: uid,
          name: 'NewsDaily',
          price: 4.99,
          next_renewal: inDays(28),
          source_id: c1,
          icon: 'news',
          color: 'violet',
          active: false,
        },
      ]);

      const year = new Date().getUTCFullYear() + 1;
      await insertRows(c, 'goals', [
        {
          user_id: uid,
          name: 'New Laptop',
          target: 1200,
          initial_saved: 800,
          target_date: `${year}-02-28`,
          icon: 'laptop',
        },
        {
          user_id: uid,
          name: 'Trip to Japan',
          target: 4000,
          initial_saved: 1450,
          target_date: `${year}-08-31`,
          icon: 'plane',
        },
        { user_id: uid, name: 'Emergency fund', target: 1500, initial_saved: 900, icon: 'shield' },
        {
          user_id: uid,
          name: 'New phone',
          target: 600,
          initial_saved: 120,
          target_date: `${year}-06-30`,
          icon: 'phone',
        },
      ]);
    });

    res.json({ ok: true });
  })
);

export default r;
