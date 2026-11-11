import { Router } from 'express';
import { z } from 'zod';
import { db } from '../supabase.js';
import { ah, must, parse, HttpError, round2 } from '../lib/util.js';
import { getSource } from '../lib/finance.js';

const r = Router();

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  target: z.coerce.number().positive().max(1e9),
  initial_saved: z.coerce.number().min(0).max(1e9).default(0),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  icon: z.enum(['laptop', 'plane', 'shield', 'phone', 'home', 'gift', 'star']).default('star')
});

async function list(userId) {
  const [goals, deposits] = await Promise.all([
    db.from('goals').select('*').eq('user_id', userId).order('created_at').then(must),
    db.from('transactions').select('goal_id, amount').eq('user_id', userId).eq('kind', 'goal').then(must)
  ]);
  const add = {};
  for (const d of deposits) if (d.goal_id) add[d.goal_id] = (add[d.goal_id] || 0) + Number(d.amount);
  return goals.map((g) => ({ ...g, target: Number(g.target), saved: round2(Number(g.initial_saved) + (add[g.id] || 0)) }));
}

r.get('/goals', ah(async (req, res) => res.json(await list(req.user.id))));

r.post('/goals', ah(async (req, res) => {
  const body = parse(schema, req.body);
  must(await db.from('goals').insert({ ...body, user_id: req.user.id }));
  res.status(201).json(await list(req.user.id));
}));

r.patch('/goals/:id', ah(async (req, res) => {
  const body = parse(schema.partial(), req.body);
  const row = must(await db.from('goals').update(body).eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle());
  if (!row) throw new HttpError(404, 'Goal not found');
  res.json(await list(req.user.id));
}));

r.delete('/goals/:id', ah(async (req, res) => {
  must(await db.from('goals').delete().eq('id', req.params.id).eq('user_id', req.user.id));
  res.status(204).end();
}));

/** Move money from a card or wallet into a goal. */
r.post('/goals/:id/contribute', ah(async (req, res) => {
  const body = parse(z.object({ amount: z.coerce.number().positive().max(1e8), source_id: z.string().uuid() }), req.body);
  const goal = must(await db.from('goals').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle());
  if (!goal) throw new HttpError(404, 'Goal not found');
  const src = await getSource(req.user.id, body.source_id);
  if (!src) throw new HttpError(404, 'Card or wallet not found');
  if (src.balance < body.amount) throw new HttpError(400, `Not enough in ${src.name} for that.`);
  must(await db.from('transactions').insert({
    user_id: req.user.id, source_id: src.id, kind: 'goal', name: `Saved for ${goal.name}`, category: 'Savings',
    amount: round2(body.amount), goal_id: goal.id
  }));
  res.json(await list(req.user.id));
}));

export default r;
