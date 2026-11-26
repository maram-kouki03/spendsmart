import { Router } from 'express';
import { z } from 'zod';
import { many, one, setClause } from '../db.js';
import { ah, parse, provided, HttpError, daysUntil, uuidParam } from '../lib/util.js';
import { getActiveSource } from '../lib/finance.js';
import { processSubscription } from '../jobs/subscriptions.js';

const r = Router();
uuidParam(r, 'Subscription not found');

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  price: z.coerce.number().positive().max(1e6),
  next_renewal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  icon: z.enum(['play', 'music', 'cloud', 'gym', 'news', 'game', 'star']).optional(),
  color: z.enum(['cocoa', 'green', 'blue', 'butter', 'violet', 'pink']).optional(),
});

/** A subscription can only charge one of the caller's own, active cards. */
async function checkSource(userId, sourceId) {
  if (sourceId) await getActiveSource(userId, sourceId);
}

/** Renewals are charged by the background job (jobs/subscriptions.js), not here. */
async function list(profile) {
  const rows = await many(
    `select sub.*, case when s.id is null then null else json_build_object('id', s.id, 'name', s.name) end as source
       from public.subscriptions sub
       left join public.sources s on s.id = sub.source_id
      where sub.user_id = $1
      order by sub.next_renewal`,
    [profile.id]
  );
  return rows.map((s) => ({ ...s, days: daysUntil(s.next_renewal, profile.timezone) }));
}

r.get(
  '/subscriptions',
  ah(async (req, res) => res.json(await list(req.profile)))
);

r.post(
  '/subscriptions',
  ah(async (req, res) => {
    const body = parse(schema, req.body);
    await checkSource(req.user.id, body.source_id);
    const row = await one(
      `insert into public.subscriptions (user_id, name, price, next_renewal, source_id, active, icon, color)
     values ($1, $2, $3, $4, $5, coalesce($6, true), coalesce($7, 'play'), coalesce($8, 'cocoa')) returning id`,
      [
        req.user.id,
        body.name,
        body.price,
        body.next_renewal,
        body.source_id ?? null,
        body.active ?? null,
        body.icon ?? null,
        body.color ?? null,
      ]
    );
    // A renewal that is already due is charged right away instead of waiting for the hourly job.
    await processSubscription(row.id);
    res.status(201).json(await list(req.profile));
  })
);

r.patch(
  '/subscriptions/:id',
  ah(async (req, res) => {
    const fields = provided(parse(schema.partial(), req.body), req.body);
    await checkSource(req.user.id, fields.source_id);
    const set = setClause(fields, 3);
    const row = set
      ? await one(`update public.subscriptions set ${set.sql} where id = $1 and user_id = $2 returning id`, [
          req.params.id,
          req.user.id,
          ...set.values,
        ])
      : await one('select id from public.subscriptions where id = $1 and user_id = $2', [req.params.id, req.user.id]);
    if (!row) throw new HttpError(404, 'Subscription not found');
    if (fields.next_renewal !== undefined || fields.active === true) await processSubscription(row.id);
    res.json(await list(req.profile));
  })
);

r.delete(
  '/subscriptions/:id',
  ah(async (req, res) => {
    const row = await one('delete from public.subscriptions where id = $1 and user_id = $2 returning id', [
      req.params.id,
      req.user.id,
    ]);
    if (!row) throw new HttpError(404, 'Subscription not found');
    res.status(204).end();
  })
);

export default r;
