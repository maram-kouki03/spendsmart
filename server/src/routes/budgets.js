import { Router } from 'express';
import { z } from 'zod';
import { one, query, setClause } from '../db.js';
import { ah, parse, provided, HttpError, uuidParam } from '../lib/util.js';
import { CATEGORIES, getBudgets } from '../lib/finance.js';

const r = Router();
uuidParam(r, 'Budget not found');

const schema = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(1).max(60),
  monthly_limit: z.coerce.number().positive().max(1e8),
  alert_threshold: z.coerce.number().int().min(50).max(100).default(80)
});

r.get('/budgets', ah(async (req, res) => res.json(await getBudgets(req.user.id))));

r.post('/budgets', ah(async (req, res) => {
  const body = parse(schema, req.body);
  await query(
    'insert into public.budgets (user_id, category, name, monthly_limit, alert_threshold) values ($1, $2, $3, $4, $5)',
    [req.user.id, body.category, body.name, body.monthly_limit, body.alert_threshold]
  );
  res.status(201).json(await getBudgets(req.user.id));
}));

r.patch('/budgets/:id', ah(async (req, res) => {
  const set = setClause(provided(parse(schema.partial(), req.body), req.body), 3);
  const row = set
    ? await one(`update public.budgets set ${set.sql} where id = $1 and user_id = $2 returning id`, [req.params.id, req.user.id, ...set.values])
    : await one('select id from public.budgets where id = $1 and user_id = $2', [req.params.id, req.user.id]);
  if (!row) throw new HttpError(404, 'Budget not found');
  res.json(await getBudgets(req.user.id));
}));

r.delete('/budgets/:id', ah(async (req, res) => {
  const row = await one('delete from public.budgets where id = $1 and user_id = $2 returning id', [req.params.id, req.user.id]);
  if (!row) throw new HttpError(404, 'Budget not found');
  res.status(204).end();
}));

export default r;
