import { Router } from 'express';
import { z } from 'zod';
import { many, one, query, setClause, tx } from '../db.js';
import { ah, parse, provided, HttpError, round2, uuidParam } from '../lib/util.js';
import { getActiveSource } from '../lib/finance.js';

const r = Router();
uuidParam(r, 'Goal not found');

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  target: z.coerce.number().positive().max(1e9),
  initial_saved: z.coerce.number().min(0).max(1e9).default(0),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  icon: z.enum(['laptop', 'plane', 'shield', 'phone', 'home', 'gift', 'star']).default('star')
});

/** Money moved into a goal from cards (initial_saved was never taken from a card, so it isn't included). */
const DEPOSITED = `coalesce((select sum(t.amount) from public.transactions t
                              where t.goal_id = g.id and t.user_id = g.user_id and t.kind = 'goal'), 0)`;

async function list(userId) {
  const goals = await many(
    `select g.*, ${DEPOSITED} as deposited
       from public.goals g
      where g.user_id = $1
      order by g.created_at`,
    [userId]
  );
  // `deposited` is new (additive): the part of `saved` that a delete gives back to a card.
  return goals.map((g) => ({ ...g, deposited: round2(g.deposited), saved: round2(Number(g.initial_saved) + Number(g.deposited)) }));
}

r.get('/goals', ah(async (req, res) => res.json(await list(req.user.id))));

r.post('/goals', ah(async (req, res) => {
  const body = parse(schema, req.body);
  await query(
    'insert into public.goals (user_id, name, target, initial_saved, target_date, icon) values ($1, $2, $3, $4, $5, $6)',
    [req.user.id, body.name, body.target, body.initial_saved, body.target_date ?? null, body.icon]
  );
  res.status(201).json(await list(req.user.id));
}));

r.patch('/goals/:id', ah(async (req, res) => {
  const set = setClause(provided(parse(schema.partial(), req.body), req.body), 3);
  const row = set
    ? await one(`update public.goals set ${set.sql} where id = $1 and user_id = $2 returning id`, [req.params.id, req.user.id, ...set.values])
    : await one('select id from public.goals where id = $1 and user_id = $2', [req.params.id, req.user.id]);
  if (!row) throw new HttpError(404, 'Goal not found');
  res.json(await list(req.user.id));
}));

/**
 * Deleting a goal gives its deposits back. When money was moved in from cards, the body (or query)
 * must say where it goes: { return_to_source_id }. In one transaction an income "Returned from
 * <goal>" (category Savings) of the deposited total lands on that card, then the goal is deleted.
 * A goal with no deposits is deleted directly.
 */
r.delete('/goals/:id', ah(async (req, res) => {
  const { return_to_source_id: sourceId } = parse(z.object({ return_to_source_id: z.string().uuid().optional() }),
    { return_to_source_id: req.body?.return_to_source_id ?? req.query.return_to_source_id });
  const out = await tx(async (c) => {
    // Locked so a parallel delete or contribution can't change the amount being refunded.
    const goal = await one('select * from public.goals g where g.id = $1 and g.user_id = $2 for update', [req.params.id, req.user.id], c);
    if (!goal) throw new HttpError(404, 'Goal not found');
    const { deposited } = await one(`select ${DEPOSITED} as deposited from public.goals g where g.id = $1`, [goal.id], c);
    const amount = round2(deposited);
    let returned = null;
    if (amount > 0) {
      if (!sourceId) {
        throw new HttpError(400, `This goal holds ${amount} moved in from your cards. Choose a card to return it to.`, 'return_source_required', { deposited: amount });
      }
      const src = await getActiveSource(req.user.id, sourceId, c);
      await query(
        `insert into public.transactions (user_id, source_id, kind, name, category, amount)
         values ($1, $2, 'income', $3, 'Savings', $4)`,
        [req.user.id, src.id, `Returned from ${goal.name}`.slice(0, 80), amount], c
      );
      returned = { amount, source_id: src.id, source: src.name };
    }
    await query('delete from public.goals where id = $1', [goal.id], c);
    return returned;
  });
  if (!out) return res.status(204).end();
  res.json({ ok: true, returned: out });
}));

/** Move money from a card or wallet into a goal. */
r.post('/goals/:id/contribute', ah(async (req, res) => {
  const body = parse(z.object({ amount: z.coerce.number().positive().max(1e8), source_id: z.string().uuid() }), req.body);
  await tx(async (c) => {
    const goal = await one('select * from public.goals where id = $1 and user_id = $2', [req.params.id, req.user.id], c);
    if (!goal) throw new HttpError(404, 'Goal not found');
    // Lock the source so two contributions can't both pass the balance check.
    await one('select id from public.sources where id = $1 and user_id = $2 for update', [body.source_id, req.user.id], c);
    const src = await getActiveSource(req.user.id, body.source_id, c);
    if (src.balance < body.amount) throw new HttpError(400, `Not enough in ${src.name} for that.`);
    await query(
      `insert into public.transactions (user_id, source_id, kind, name, category, amount, goal_id)
       values ($1, $2, 'goal', $3, 'Savings', $4, $5)`,
      [req.user.id, src.id, `Saved for ${goal.name}`.slice(0, 80), round2(body.amount), goal.id], c
    );
  });
  res.json(await list(req.user.id));
}));

export default r;
