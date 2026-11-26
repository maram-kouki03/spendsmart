import { Router } from 'express';
import { z } from 'zod';
import { many, one, query, tx } from '../db.js';
import { ah, parse, HttpError, round2, initials, money, uuidParam, localYmd, DEFAULT_TZ } from '../lib/util.js';
import { CATEGORIES, getActiveSource, notify } from '../lib/finance.js';
import { who, areContacts, isActiveMember } from '../lib/sharing.js';
import { checkShares, planById, planView, resolveCategory, visiblePlans } from '../lib/plans.js';

const r = Router();
uuidParam(r, 'Not found');

const todayFor = (profile) => localYmd(new Date(), profile?.timezone || DEFAULT_TZ);

// ---------------------------------------------------------------------------
// Categories: the built-in ones plus the user's own
// ---------------------------------------------------------------------------
const listCategories = async (uid) => ({
  builtIn: CATEGORIES,
  custom: await many('select id, name from public.user_categories where owner_id = $1 order by lower(name)', [uid]),
});

r.get(
  '/categories',
  ah(async (req, res) => res.json(await listCategories(req.user.id)))
);

/** Add a custom category (adding one that already exists, in any spelling, just returns it). */
r.post(
  '/categories',
  ah(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(30) }), req.body);
    if (CATEGORIES.some((c) => c.toLowerCase() === name.toLowerCase()))
      throw new HttpError(400, `${name} is already a category.`);
    const row =
      (await one(
        `insert into public.user_categories (owner_id, name) values ($1, $2)
     on conflict (owner_id, lower(name)) do nothing returning id, name`,
        [req.user.id, name]
      )) ||
      (await one('select id, name from public.user_categories where owner_id = $1 and lower(name) = lower($2)', [
        req.user.id,
        name,
      ]));
    res.status(201).json({ category: row, ...(await listCategories(req.user.id)) });
  })
);

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** Names and initials for the people a plan view mentions. */
async function namesFor(userIds, ex) {
  const rows = userIds.length
    ? await many('select id, full_name, email from public.profiles where id = any($1::uuid[])', [userIds], ex)
    : [];
  return {
    nameOf: Object.fromEntries(rows.map((p) => [p.id, who(p)])),
    initialsOf: Object.fromEntries(rows.map((p) => [p.id, initials(p.full_name, p.email)])),
  };
}
export async function viewsFor(plans, uid, today, ex) {
  const ids = [...new Set(plans.flatMap((p) => [...p.members.map((m) => m.user_id), p.created_by]))];
  const { nameOf, initialsOf } = await namesFor(ids, ex);
  return plans.map((p) => planView(p, uid, today, nameOf, initialsOf));
}

/** May `uid` see / use this plan right now (accepted contacts, or an active member of the group)? */
async function canUsePlan(p, uid, ex) {
  if (p.group_id) return isActiveMember(p.group_id, uid, ex);
  if (p.created_by !== uid && p.partner_id !== uid) return false;
  return areContacts(p.created_by, p.partner_id, ex);
}
async function loadPlan(id, uid, ex) {
  const p = await planById(id, ex);
  if (!p || !(await canUsePlan(p, uid, ex))) throw new HttpError(404, 'Plan not found');
  return p;
}
const othersIn = (p, uid) => p.members.map((m) => m.user_id).filter((id) => id !== uid);

/** GET /shared-plans?user_id=… (1:1 plans with that contact) or ?group_id=… — or every plan I can see. */
r.get(
  '/shared-plans',
  ah(async (req, res) => {
    const q = parse(
      z.object({ user_id: z.string().uuid().optional(), group_id: z.string().uuid().optional() }),
      req.query
    );
    const uid = req.user.id;
    const [contacts, groups] = await Promise.all([
      many(
        `select c.contact_id as id from public.contacts c
           where c.owner_id = $1 and exists (select 1 from public.contacts b where b.owner_id = c.contact_id and b.contact_id = c.owner_id)`,
        [uid]
      ),
      many("select group_id as id from public.group_members where user_id = $1 and status = 'active'", [uid]),
    ]);
    let plans = await visiblePlans(
      uid,
      contacts.map((c) => c.id),
      groups.map((g) => g.id)
    );
    if (q.user_id)
      plans = plans.filter((p) => !p.group_id && (p.created_by === q.user_id || p.partner_id === q.user_id));
    if (q.group_id) plans = plans.filter((p) => p.group_id === q.group_id);
    res.json(await viewsFor(plans, uid, todayFor(req.profile)));
  })
);

const shareList = z
  .array(z.object({ user_id: z.string().uuid(), share_pct: z.coerce.number().positive().max(100) }))
  .min(1)
  .max(50);
const planFields = {
  item_name: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(30),
  target_amount: z.coerce.number().positive().max(1e8),
  months: z.coerce.number().int().min(1).max(60),
  shares: shareList.optional(),
};

/** Create a plan with an accepted contact (partner_id) or one of my groups (group_id). */
r.post(
  '/shared-plans',
  ah(async (req, res) => {
    const body = parse(
      z
        .object({
          ...planFields,
          my_pct: z.coerce.number().min(1).max(99).optional(),
          partner_id: z.string().uuid().optional(),
          group_id: z.string().uuid().optional(),
        })
        .refine((b) => !!b.partner_id !== !!b.group_id, 'Pick a person or a group'),
      req.body
    );
    const uid = req.user.id,
      me = req.profile;
    const out = await tx(async (c) => {
      let members;
      if (body.group_id) {
        if (!(await isActiveMember(body.group_id, uid, c))) throw new HttpError(403, 'Not in this group');
        members = (
          await many(
            "select user_id from public.group_members where group_id = $1 and status = 'active' order by joined_at nulls last, user_id",
            [body.group_id],
            c
          )
        ).map((m) => m.user_id);
        if (members.length < 2) throw new HttpError(400, 'Nobody else has joined this group yet');
      } else {
        if (body.partner_id === uid) throw new HttpError(400, "That's you!");
        if (!(await areContacts(uid, body.partner_id, c)))
          throw new HttpError(403, 'You can only save together with people who accepted your invitation');
        members = [uid, body.partner_id];
      }
      // 1:1 plans may just say my share ("60" → 60 / 40).
      const asked =
        body.shares ||
        (body.partner_id && body.my_pct
          ? [
              { user_id: uid, share_pct: round2(body.my_pct) },
              { user_id: body.partner_id, share_pct: round2(100 - body.my_pct) },
            ]
          : undefined);
      const { shares, split_mode } = checkShares(members, asked);
      const category = await resolveCategory(uid, body.category, c);
      const plan = await one(
        `insert into public.shared_plans (created_by, partner_id, group_id, item_name, category, target_amount, months, start_date, split_mode)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [
          uid,
          body.partner_id || null,
          body.group_id || null,
          body.item_name,
          category,
          round2(body.target_amount),
          body.months,
          todayFor(me),
          split_mode,
        ],
        c
      );
      for (const s of shares) {
        await query(
          'insert into public.shared_plan_members (plan_id, user_id, share_pct) values ($1, $2, $3)',
          [plan.id, s.user_id, s.share_pct],
          c
        );
      }
      for (const other of members.filter((id) => id !== uid)) {
        const mine = shares.find((s) => s.user_id === other);
        await notify(
          other,
          {
            type: 'plan',
            title: `${who(me)} started saving with you for ${body.item_name}`,
            body: `${money(body.target_amount, me.currency)} in ${body.months} month${body.months === 1 ? '' : 's'} — your share is ${mine.share_pct}%.`,
            data: { plan_id: plan.id },
            dedupe_key: `plan-new:${plan.id}`,
          },
          c
        );
      }
      return planById(plan.id, c);
    });
    res.status(201).json((await viewsFor([out], uid, todayFor(me)))[0]);
  })
);

/** Edit a plan (any member): item, category, price, months, shares (must add up to 100). */
r.patch(
  '/shared-plans/:id',
  ah(async (req, res) => {
    const body = parse(z.object(planFields).partial(), req.body);
    const uid = req.user.id;
    const out = await tx(async (c) => {
      await one('select id from public.shared_plans where id = $1 for update', [req.params.id], c);
      const p = await loadPlan(req.params.id, uid, c);
      if (!p.members.some((m) => m.user_id === uid)) throw new HttpError(403, "You're not part of this plan");
      const set = [],
        vals = [p.id];
      const add = (col, v) => {
        vals.push(v);
        set.push(`${col} = $${vals.length}`);
      };
      if (body.item_name !== undefined) add('item_name', body.item_name);
      if (body.target_amount !== undefined) add('target_amount', round2(body.target_amount));
      if (body.months !== undefined) add('months', body.months);
      if (body.category !== undefined && body.category.toLowerCase() !== p.category.toLowerCase())
        add('category', await resolveCategory(uid, body.category, c));
      if (body.shares) {
        const { shares, split_mode } = checkShares(
          p.members.map((m) => m.user_id),
          body.shares
        );
        add('split_mode', split_mode);
        for (const s of shares)
          await query(
            'update public.shared_plan_members set share_pct = $3 where plan_id = $1 and user_id = $2',
            [p.id, s.user_id, s.share_pct],
            c
          );
      }
      if (set.length) await query(`update public.shared_plans set ${set.join(', ')} where id = $1`, vals, c);
      return planById(p.id, c);
    });
    res.json((await viewsFor([out], uid, todayFor(req.profile)))[0]);
  })
);

/** Put money aside: moves `amount` from one of MY cards into the plan (refused when the card is short). */
r.post(
  '/shared-plans/:id/contribute',
  ah(async (req, res) => {
    const body = parse(
      z.object({ amount: z.coerce.number().positive().max(1e8), source_id: z.string().uuid() }),
      req.body
    );
    const uid = req.user.id,
      me = req.profile;
    const amount = round2(body.amount);
    const out = await tx(async (c) => {
      const p = await loadPlan(req.params.id, uid, c);
      if (!p.members.some((m) => m.user_id === uid)) throw new HttpError(403, "You're not part of this plan");
      // Lock the card so two contributions can't both pass the balance check.
      await one('select id from public.sources where id = $1 and user_id = $2 for update', [body.source_id, uid], c);
      const src = await getActiveSource(uid, body.source_id, c);
      if (src.balance < amount) throw new HttpError(400, `Not enough in ${src.name} for that.`, 'insufficient_funds');
      await query(
        `insert into public.transactions (user_id, source_id, kind, name, category, amount, shared_plan_id)
       values ($1, $2, 'shared_saving', $3, 'Savings', $4, $5)`,
        [uid, src.id, `Saved for ${p.item_name}`.slice(0, 80), amount, p.id],
        c
      );
      for (const other of othersIn(p, uid)) {
        await notify(
          other,
          {
            type: 'plan',
            title: `${who(me)} put ${money(amount, me.currency)} aside for ${p.item_name}`,
            data: { plan_id: p.id },
          },
          c
        );
      }
      return {
        plan: await planById(p.id, c),
        source: { id: src.id, name: src.name, before: src.balance, after: round2(src.balance - amount) },
      };
    });
    res.json({ ...(await viewsFor([out.plan], uid, todayFor(me)))[0], source: out.source });
  })
);

/**
 * Delete a plan (only whoever created it). My own contributions go back to the card I pick
 * ({ return_to_source_id }, required when I put money in); everyone else's go back to the cards
 * they came from (database trigger), and they're told. Nobody's money moves to someone else.
 */
r.delete(
  '/shared-plans/:id',
  ah(async (req, res) => {
    const { return_to_source_id: sourceId } = parse(z.object({ return_to_source_id: z.string().uuid().optional() }), {
      return_to_source_id: req.body?.return_to_source_id ?? req.query.return_to_source_id,
    });
    const uid = req.user.id,
      me = req.profile;
    const out = await tx(async (c) => {
      await one('select id from public.shared_plans where id = $1 for update', [req.params.id], c);
      const p = await loadPlan(req.params.id, uid, c);
      if (p.created_by !== uid) throw new HttpError(403, 'Only the person who created this plan can delete it');
      const mine = round2(p.saved.find((s) => s.user_id === uid)?.amount || 0);
      let returned = null;
      if (mine > 0) {
        if (!sourceId)
          throw new HttpError(
            400,
            `You put ${money(mine, me.currency)} into this plan. Choose a card to return it to.`,
            'return_source_required',
            { deposited: mine }
          );
        const src = await getActiveSource(uid, sourceId, c);
        await query(
          `insert into public.transactions (user_id, source_id, kind, name, category, amount, note)
         values ($1, $2, 'income', $3, 'Savings', $4, 'Shared plan deleted')`,
          [uid, src.id, `Returned from ${p.item_name}`.slice(0, 80), mine],
          c
        );
        await query(
          "update public.transactions set shared_plan_id = null where shared_plan_id = $1 and user_id = $2 and kind = 'shared_saving'",
          [p.id, uid],
          c
        );
        returned = { amount: mine, source_id: src.id, source: src.name };
      }
      const refunded = Object.fromEntries(
        p.saved.filter((s) => s.user_id !== uid).map((s) => [s.user_id, round2(s.amount)])
      );
      await query('delete from public.shared_plans where id = $1', [p.id], c); // the trigger refunds the others
      for (const other of othersIn(p, uid)) {
        const amt = refunded[other] || 0;
        await notify(
          other,
          {
            type: 'plan',
            title: `${who(me)} deleted the plan ${p.item_name}`,
            body: amt > 0 ? `Your ${money(amt, me.currency)} went back to the card you saved it from.` : undefined,
            data: {},
            dedupe_key: `plan-del:${p.id}`,
          },
          c
        );
      }
      return returned;
    });
    if (!out) return res.status(204).end();
    res.json({ ok: true, returned: out });
  })
);

export default r;
