import { Router } from 'express';
import { z } from 'zod';
import { many, one, query, setClause, tx } from '../db.js';
import { ah, parse, provided, HttpError, isValidTimeZone, uuidParam } from '../lib/util.js';
import { getSources } from '../lib/finance.js';

const r = Router();
uuidParam(r, 'Card or wallet not found');

r.get(
  '/me',
  ah(async (req, res) => res.json(req.profile))
);

r.patch(
  '/me',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        full_name: z.string().trim().min(1).max(80).optional(),
        currency: z.enum(['TND', 'EUR', 'USD']).optional(),
        notify_budget: z.boolean().optional(),
        notify_split: z.boolean().optional(),
        notify_subs: z.boolean().optional(),
        // IANA name from the browser: Intl.DateTimeFormat().resolvedOptions().timeZone
        timezone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone').optional(),
      }),
      req.body
    );
    // Node and Postgres both use the IANA database, but make sure Postgres knows this name too.
    if (body.timezone && !(await one('select 1 from pg_timezone_names where name = $1', [body.timezone]))) {
      throw new HttpError(400, 'timezone: Unknown time zone');
    }
    const set = setClause(body, 2);
    if (!set) return res.json(req.profile);
    const row = await tx(async (c) => {
      const p = await one(
        `update public.profiles set ${set.sql} where id = $1 returning *`,
        [req.user.id, ...set.values],
        c
      );
      if (body.full_name !== undefined)
        await query('update public.users set full_name = $1 where id = $2', [body.full_name, req.user.id], c);
      return p;
    });
    res.json(row);
  })
);

// ---- money sources ----
const sourceSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(['debit', 'credit', 'cash', 'other']).default('debit'),
  last4: z
    .string()
    .regex(/^\d{4}$/)
    .nullable()
    .optional(),
  starting_balance: z.coerce.number().min(-1e9).max(1e9).default(0),
  style: z.enum(['g1', 'g2', 'g3', 'g4']).optional(),
});

/** Active cards and wallets; `?include=archived` adds the archived ones (with `archived: true`). */
r.get(
  '/sources',
  ah(async (req, res) =>
    res.json(await getSources(req.user.id, undefined, { archived: req.query.include === 'archived' }))
  )
);

r.post(
  '/sources',
  ah(async (req, res) => {
    const body = parse(sourceSchema, req.body);
    const existing = await getSources(req.user.id, undefined, { archived: true });
    const style = body.style || ['g1', 'g2', 'g3', 'g4'][existing.length % 4];
    const row = await one(
      `insert into public.sources (user_id, name, kind, last4, starting_balance, style, position)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [req.user.id, body.name, body.kind, body.last4 ?? null, body.starting_balance, style, existing.length]
    );
    res.status(201).json(row);
  })
);

r.patch(
  '/sources/:id',
  ah(async (req, res) => {
    const set = setClause(provided(parse(sourceSchema.partial(), req.body), req.body), 3);
    const row = set
      ? await one(`update public.sources set ${set.sql} where id = $1 and user_id = $2 returning *`, [
          req.params.id,
          req.user.id,
          ...set.values,
        ])
      : await one('select * from public.sources where id = $1 and user_id = $2', [req.params.id, req.user.id]);
    if (!row) throw new HttpError(404, 'Card or wallet not found');
    res.json(row);
  })
);

const KEEP_ONE = 'Keep at least one card or wallet';

/**
 * A card without transactions is deleted (204). A card with history is never deleted: the answer
 * is 409 { code: 'source_has_history', count } unless `?archive=true`, which archives it instead —
 * its transactions, and their effect on balances, stay. Answers 200 { archived: true, source }.
 */
r.delete(
  '/sources/:id',
  ah(async (req, res) => {
    const archive = req.query.archive === 'true' || req.query.archive === '1';
    const out = await tx(async (c) => {
      // Lock all of the user's sources so two parallel deletes can't both pass the "keep one" check.
      const all = await many(
        'select id, archived_at from public.sources where user_id = $1 order by id for update',
        [req.user.id],
        c
      );
      const s = all.find((x) => x.id === req.params.id);
      if (!s) throw new HttpError(404, 'Card or wallet not found');
      const activeLeft = all.filter((x) => !x.archived_at && x.id !== s.id).length;
      const { count } = await one('select count(*) as count from public.transactions where source_id = $1', [s.id], c);

      if (count === 0) {
        if (!s.archived_at && activeLeft === 0) throw new HttpError(400, KEEP_ONE);
        await query('delete from public.sources where id = $1', [s.id], c);
        return { deleted: true };
      }
      if (!archive) {
        throw new HttpError(
          409,
          `This card has ${count} transaction${count === 1 ? '' : 's'}. Archive it instead? Its history stays.`,
          'source_has_history',
          { count }
        );
      }
      if (!s.archived_at) {
        if (activeLeft === 0) throw new HttpError(400, KEEP_ONE);
        await query('update public.sources set archived_at = now() where id = $1', [s.id], c);
      }
      return { archived: true, source: await one('select * from public.source_balances where id = $1', [s.id], c) };
    });
    if (out.deleted) return res.status(204).end();
    res.json(out);
  })
);

r.post(
  '/sources/:id/restore',
  ah(async (req, res) => {
    const row = await one('update public.sources set archived_at = null where id = $1 and user_id = $2 returning id', [
      req.params.id,
      req.user.id,
    ]);
    if (!row) throw new HttpError(404, 'Card or wallet not found');
    res.json(await one('select * from public.source_balances where id = $1', [row.id]));
  })
);

export default r;
