import { Router } from 'express';
import { z } from 'zod';
import { db } from '../supabase.js';
import { ah, must, parse, HttpError, daysUntil } from '../lib/util.js';
import { syncSubscriptions } from '../lib/finance.js';

const r = Router();

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  price: z.coerce.number().positive().max(1e6),
  next_renewal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  icon: z.enum(['play', 'music', 'cloud', 'gym', 'news', 'game', 'star']).optional(),
  color: z.enum(['cocoa', 'green', 'blue', 'butter', 'violet', 'pink']).optional()
});

async function list(profile) {
  await syncSubscriptions(profile);
  const rows = must(await db.from('subscriptions').select('*, source:sources(id, name)').eq('user_id', profile.id).order('next_renewal'));
  return rows.map((s) => ({ ...s, price: Number(s.price), days: daysUntil(s.next_renewal) }));
}

r.get('/subscriptions', ah(async (req, res) => res.json(await list(req.profile))));

r.post('/subscriptions', ah(async (req, res) => {
  const body = parse(schema, req.body);
  must(await db.from('subscriptions').insert({ ...body, user_id: req.user.id }));
  res.status(201).json(await list(req.profile));
}));

r.patch('/subscriptions/:id', ah(async (req, res) => {
  const body = parse(schema.partial(), req.body);
  const row = must(await db.from('subscriptions').update(body).eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle());
  if (!row) throw new HttpError(404, 'Subscription not found');
  res.json(await list(req.profile));
}));

r.delete('/subscriptions/:id', ah(async (req, res) => {
  must(await db.from('subscriptions').delete().eq('id', req.params.id).eq('user_id', req.user.id));
  res.status(204).end();
}));

export default r;
