import { Router } from 'express';
import { z } from 'zod';
import { many, one, tx } from '../db.js';
import { ah, parse, HttpError, round2, uuidParam, zonedParts, zonedTime, localYmd } from '../lib/util.js';
import { CATEGORIES, getActiveSource, checkBudgetAlerts } from '../lib/finance.js';

const r = Router();
uuidParam(r, 'Transaction not found');

/** Escapes LIKE wildcards so a search term is matched literally. */
const likeTerm = (s) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const MIN_DATE = Date.UTC(2000, 0, 1);
const DAY = 86400000;

/**
 * When a transaction happened. A plain date ('YYYY-MM-DD', a day in the user's time zone) gets
 * the current local time of day, so ordering within a day stays natural; today means "now".
 * Must be a real date, from 2000 on, and at most one day in the future.
 */
export function parseOccurredAt(value, tz, now = new Date()) {
  if (value === undefined || value === null || value === '') return now;
  const bad = (msg) => new HttpError(400, `occurred_at: ${msg}`);
  let at;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
    const check = new Date(Date.UTC(y, mo, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo || check.getUTCDate() !== d) throw bad('Not a valid date');
    if (value === localYmd(now, tz)) return now;
    const p = zonedParts(now, tz);
    at = zonedTime(y, mo, d, tz, p.h, p.min);
  } else {
    if (!z.string().datetime({ offset: true }).safeParse(value).success) throw bad('Use a date (YYYY-MM-DD) or an ISO date-time');
    at = new Date(value);
  }
  if (isNaN(at)) throw bad('Not a valid date');
  if (at.getTime() < MIN_DATE) throw bad('Dates before 2000 are not allowed');
  if (at.getTime() > now.getTime() + DAY) throw bad('Dates more than one day in the future are not allowed');
  return at;
}

r.get('/transactions', ah(async (req, res) => {
  const q = parse(z.object({
    kind: z.enum(['expense', 'income', 'goal']).optional(),
    source: z.string().uuid().optional(),
    category: z.string().max(40).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    q: z.string().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(300)
  }), req.query);

  const where = ['t.user_id = $1'];
  const params = [req.user.id];
  const add = (cond, value) => { params.push(value); where.push(cond.replace('?', `$${params.length}`)); };
  if (q.kind) add('t.kind = ?', q.kind);
  if (q.source) add('t.source_id = ?', q.source);
  if (q.category) add('t.category = ?', q.category);
  if (q.from) add('t.occurred_at >= ?', q.from);
  if (q.to) add('t.occurred_at < ?', q.to);
  const term = q.q?.trim();
  if (term) {
    params.push(likeTerm(term));
    const n = `$${params.length}`;
    where.push(`(t.name ilike ${n} or t.note ilike ${n} or t.category ilike ${n})`);
  }
  params.push(q.limit);

  // Archived cards keep their history: the source name is still shown (with `archived`).
  const rows = await many(
    `select t.*, json_build_object('id', s.id, 'name', s.name, 'archived', s.archived_at is not null) as source
       from public.transactions t
       left join public.sources s on s.id = t.source_id
      where ${where.join(' and ')}
      order by t.occurred_at desc
      limit $${params.length}`,
    params
  );
  res.json(rows);
}));

const txSchema = z.object({
  kind: z.enum(['expense', 'income']),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).optional(),
  amount: z.coerce.number().positive().max(1e8),
  source_id: z.string().uuid(),
  occurred_at: z.string().max(40).optional().nullable(),
  note: z.string().max(240).optional().nullable()
});

r.post('/transactions', ah(async (req, res) => {
  const body = parse(txSchema, req.body);
  const category = body.kind === 'income' ? 'Income' : (body.category || 'More');
  if (body.kind === 'expense' && !CATEGORIES.includes(category)) throw new HttpError(400, 'Unknown category');
  const occurred = parseOccurredAt(body.occurred_at, req.profile.timezone);

  const before = await getActiveSource(req.user.id, body.source_id);
  const amount = round2(body.amount);
  const { transaction, budgets } = await tx(async (c) => {
    const t = await one(
      `insert into public.transactions (user_id, source_id, kind, name, category, amount, occurred_at, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [req.user.id, body.source_id, body.kind, body.name, category, amount, occurred.toISOString(), body.note || null], c
    );
    const b = body.kind === 'expense' ? await checkBudgetAlerts(req.profile, category, amount, occurred, c) : [];
    return { transaction: t, budgets: b };
  });
  const after = round2(before.balance + (body.kind === 'income' ? amount : -amount));
  res.status(201).json({ transaction, source: { id: before.id, name: before.name, style: before.style, last4: before.last4, before: before.balance, after }, budgets });
}));

r.delete('/transactions/:id', ah(async (req, res) => {
  const t = await one('delete from public.transactions where id = $1 and user_id = $2 returning id', [req.params.id, req.user.id]);
  if (!t) throw new HttpError(404, 'Transaction not found');
  res.status(204).end();
}));

export default r;
