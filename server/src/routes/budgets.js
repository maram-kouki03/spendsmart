import { Router } from 'express';
import { z } from 'zod';
import { db } from '../supabase.js';
import { ah, must, parse, HttpError } from '../lib/util.js';
import { CATEGORIES, getBudgets } from '../lib/finance.js';

const r = Router();

const schema = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(1).max(60),
  monthly_limit: z.coerce.number().positive().max(1e8),
  alert_threshold: z.coerce.number().int().min(50).max(100).default(80)
});

r.get('/budgets', ah(async (req, res) => res.json(await getBudgets(req.user.id))));

r.post('/budgets', ah(async (req, res) => {
  const body = parse(schema, req.body);
  must(await db.from('budgets').insert({ ...body, user_id: req.user.id }));
  res.status(201).json(await getBudgets(req.user.id));
}));

r.patch('/budgets/:id', ah(async (req, res) => {
  const body = parse(schema.partial(), req.body);
  const row = must(await db.from('budgets').update(body).eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle());
  if (!row) throw new HttpError(404, 'Budget not found');
  res.json(await getBudgets(req.user.id));
}));

r.delete('/budgets/:id', ah(async (req, res) => {
  must(await db.from('budgets').delete().eq('id', req.params.id).eq('user_id', req.user.id));
  res.status(204).end();
}));

export default r;
