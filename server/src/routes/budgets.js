import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, parse, HttpError, uuidParam, localYmd } from '../lib/util.js';
import { BUDGET_PERIODS, CATEGORIES, getBudgets } from '../lib/finance.js';

const r = Router();
uuidParam(r, 'Budget not found');

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}, 'Not a valid date');

const fields = {
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(1).max(60),
  limit_amount: z.coerce.number().positive().max(1e8),
  alert_threshold: z.coerce.number().int().min(50).max(100),
  period: z.enum(BUDGET_PERIODS),
  start_date: ymd.nullable(),
  end_date: ymd.nullable()
};
const createSchema = z.object({
  ...fields,
  alert_threshold: fields.alert_threshold.default(80),
  period: fields.period.default('month'),
  start_date: fields.start_date.optional(),
  end_date: fields.end_date.optional()
});

/**
 * The dates a period keeps: custom → both (end after start), quarter → its start (default: the
 * first of the current month, in the user's time zone), the others → none.
 */
function periodDates(period, start, end, tz) {
  if (period === 'custom') {
    if (!start || !end) throw new HttpError(400, 'Pick a start date and an end date.');
    if (end <= start) throw new HttpError(400, 'The end date must be after the start date.');
    return { start_date: start, end_date: end };
  }
  if (period === 'quarter') return { start_date: start || `${localYmd(new Date(), tz).slice(0, 7)}-01`, end_date: null };
  return { start_date: null, end_date: null };
}

r.get('/budgets', ah(async (req, res) => res.json(await getBudgets(req.user.id))));

r.post('/budgets', ah(async (req, res) => {
  const body = parse(createSchema, req.body);
  const d = periodDates(body.period, body.start_date, body.end_date, req.profile.timezone);
  await query(
    `insert into public.budgets (user_id, category, name, limit_amount, alert_threshold, period, start_date, end_date)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [req.user.id, body.category, body.name, body.limit_amount, body.alert_threshold, body.period, d.start_date, d.end_date]
  );
  res.status(201).json(await getBudgets(req.user.id));
}));

/** Partial update; a new period (or new dates) is checked against the budget's resulting period. */
r.patch('/budgets/:id', ah(async (req, res) => {
  const body = parse(z.object(fields).partial(), req.body);
  const cur = await one('select * from public.budgets where id = $1 and user_id = $2', [req.params.id, req.user.id]);
  if (!cur) throw new HttpError(404, 'Budget not found');
  const has = (k) => Object.prototype.hasOwnProperty.call(req.body || {}, k);
  const next = {};
  for (const k of ['category', 'name', 'limit_amount', 'alert_threshold']) if (has(k)) next[k] = body[k];
  if (has('period') || has('start_date') || has('end_date')) {
    const period = body.period ?? cur.period;
    // Dates sent with the request win; otherwise keep the stored ones when the period is unchanged.
    const keep = period === cur.period;
    const start = has('start_date') ? body.start_date : keep ? cur.start_date : null;
    const end = has('end_date') ? body.end_date : keep ? cur.end_date : null;
    Object.assign(next, { period, ...periodDates(period, start, end, req.profile.timezone) });
  }
  const cols = Object.keys(next);
  if (cols.length) {
    await query(
      `update public.budgets set ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')} where id = $1 and user_id = $2`,
      [req.params.id, req.user.id, ...cols.map((c) => next[c])]
    );
  }
  res.json(await getBudgets(req.user.id));
}));

r.delete('/budgets/:id', ah(async (req, res) => {
  const row = await one('delete from public.budgets where id = $1 and user_id = $2 returning id', [req.params.id, req.user.id]);
  if (!row) throw new HttpError(404, 'Budget not found');
  res.status(204).end();
}));

export default r;
