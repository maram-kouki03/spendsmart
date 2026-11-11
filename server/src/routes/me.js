import { Router } from 'express';
import { z } from 'zod';
import { db } from '../supabase.js';
import { ah, must, parse, HttpError } from '../lib/util.js';
import { getSources } from '../lib/finance.js';

const r = Router();

r.get('/me', ah(async (req, res) => res.json(req.profile)));

r.patch('/me', ah(async (req, res) => {
  const body = parse(z.object({
    full_name: z.string().trim().min(1).max(80).optional(),
    currency: z.enum(['TND', 'EUR', 'USD']).optional(),
    notify_budget: z.boolean().optional(),
    notify_split: z.boolean().optional(),
    notify_subs: z.boolean().optional()
  }), req.body);
  const row = must(await db.from('profiles').update(body).eq('id', req.user.id).select().single());
  res.json(row);
}));

// ---- money sources ----
const sourceSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(['debit', 'credit', 'cash', 'other']).default('debit'),
  last4: z.string().regex(/^\d{4}$/).nullable().optional(),
  starting_balance: z.coerce.number().min(-1e9).max(1e9).default(0),
  style: z.enum(['g1', 'g2', 'g3', 'g4']).optional()
});

r.get('/sources', ah(async (req, res) => res.json(await getSources(req.user.id))));

r.post('/sources', ah(async (req, res) => {
  const body = parse(sourceSchema, req.body);
  const existing = await getSources(req.user.id);
  const style = body.style || ['g1', 'g2', 'g3', 'g4'][existing.length % 4];
  const row = must(await db.from('sources').insert({ ...body, style, user_id: req.user.id, position: existing.length }).select().single());
  res.status(201).json(row);
}));

r.patch('/sources/:id', ah(async (req, res) => {
  const body = parse(sourceSchema.partial(), req.body);
  const row = must(await db.from('sources').update(body).eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle());
  if (!row) throw new HttpError(404, 'Source not found');
  res.json(row);
}));

r.delete('/sources/:id', ah(async (req, res) => {
  const all = await getSources(req.user.id);
  if (all.length <= 1) throw new HttpError(400, 'Keep at least one card or wallet');
  must(await db.from('sources').delete().eq('id', req.params.id).eq('user_id', req.user.id));
  res.status(204).end();
}));

export default r;
