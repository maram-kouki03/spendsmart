/**
 * Shared savings plans: people saving together for one item ("an oven for 900 DT in 3 months, 50/50").
 *
 * Each member has a share of the target (share_pct, all shares add up to 100). Contributions are
 * transactions of kind 'shared_saving' on the contributor's own card, linked with shared_plan_id,
 * so card balances stay right. Deleting a plan gives contributions back (see the migration's
 * shared_plan_refund trigger and DELETE /shared-plans/:id).
 */
import { many, query } from '../db.js';
import { HttpError, round2, addMonths, monthsBetween } from './util.js';
import { CATEGORIES } from './finance.js';

const days = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/** Equal shares to the cent; the last member gets the rounding remainder. */
export function equalShares(userIds) {
  const n = userIds.length;
  const each = Math.round((100 / n) * 100) / 100;
  return userIds.map((user_id, i) => ({ user_id, share_pct: i < n - 1 ? each : round2(100 - each * (n - 1)) }));
}

/**
 * Validates `shares` against exactly these members (every member once, each > 0, total 100) and
 * returns { shares, split_mode }. Without `shares`, everyone gets an equal share.
 */
export function checkShares(memberIds, shares) {
  if (!shares) return { shares: equalShares(memberIds), split_mode: 'equal' };
  const ids = new Set(shares.map((s) => s.user_id));
  if (ids.size !== shares.length || ids.size !== memberIds.length || memberIds.some((id) => !ids.has(id))) {
    throw new HttpError(400, 'Give a share for every member of the plan.');
  }
  const total = Math.round(shares.reduce((a, s) => a + Number(s.share_pct) * 100, 0));
  if (total !== 10000) throw new HttpError(400, 'The shares must add up to 100%.');
  const pcts = shares.map((s) => round2(s.share_pct));
  const equal = pcts.every((p) => Math.abs(p - pcts[0]) <= 0.01);
  return {
    shares: shares.map((s) => ({ user_id: s.user_id, share_pct: round2(s.share_pct) })),
    split_mode: equal ? 'equal' : 'ratio',
  };
}

/** A built-in category (canonical spelling) or one of the user's own; 400 otherwise. */
export async function resolveCategory(uid, name, ex) {
  const n = String(name).trim();
  const built = CATEGORIES.find((c) => c.toLowerCase() === n.toLowerCase());
  if (built) return built;
  const own = (
    await many('select name from public.user_categories where owner_id = $1 and lower(name) = lower($2)', [uid, n], ex)
  )[0];
  if (!own) throw new HttpError(400, 'Unknown category — add it as a new category first.');
  return own.name;
}

const PLAN_SELECT = `
  select p.*,
         coalesce((select json_agg(json_build_object('user_id', m.user_id, 'share_pct', m.share_pct) order by m.joined_at, m.user_id)
                     from public.shared_plan_members m where m.plan_id = p.id), '[]'::json) as members,
         coalesce((select json_agg(json_build_object('user_id', s.user_id, 'amount', s.total))
                     from (select t.user_id, sum(t.amount) as total from public.transactions t
                            where t.shared_plan_id = p.id and t.kind = 'shared_saving' group by t.user_id) s), '[]'::json) as saved
    from public.shared_plans p`;

/** Plans `uid` can see: 1:1 plans with a current contact, and plans of their active groups. */
export function visiblePlans(uid, contactIds, groupIds, ex) {
  return many(
    `${PLAN_SELECT}
      where (p.created_by = $1 and p.partner_id = any($2::uuid[]))
         or (p.partner_id = $1 and p.created_by = any($2::uuid[]))
         or p.group_id = any($3::uuid[])
      order by p.created_at`,
    [uid, contactIds, groupIds],
    ex
  );
}

export const planById = async (id, ex) => (await many(`${PLAN_SELECT} where p.id = $1`, [id], ex))[0] || null;

/**
 * What the page shows for one plan, as seen by `uid` on `today` ('YYYY-MM-DD' in their time zone).
 * Per member: share, target share, saved, remaining, needed per month (remaining ÷ months left, at
 * least one month) and whether they're on track (saved ≥ what a steady pace would have by today).
 */
export function planView(p, uid, today, nameOf = {}, initialsOf = {}) {
  const target = Number(p.target_amount);
  const start = p.start_date;
  const end = addMonths(start, p.months);
  const total = Math.max(1, days(start, end));
  const gone = Math.min(total, Math.max(0, days(start, today)));
  const monthsLeft = Math.max(1, p.months - Math.max(0, monthsBetween(start, today)));
  const savedBy = Object.fromEntries(p.saved.map((s) => [s.user_id, Number(s.amount)]));

  const members = p.members.map((m) => {
    const share = Number(m.share_pct);
    const targetShare = round2((target * share) / 100);
    const saved = round2(savedBy[m.user_id] || 0);
    const remaining = round2(Math.max(0, targetShare - saved));
    const expected = round2((targetShare * gone) / total);
    const status = remaining <= 0 ? 'done' : saved + 0.005 >= expected ? 'on_track' : 'behind';
    return {
      user_id: m.user_id,
      isMe: m.user_id === uid,
      name: m.user_id === uid ? 'You' : nameOf[m.user_id] || 'Member',
      initials: initialsOf[m.user_id] || '',
      share_pct: share,
      target_share: targetShare,
      saved,
      remaining,
      per_month: round2(remaining / monthsLeft),
      expected,
      status,
    };
  });
  // Money from people who are no longer members (e.g. left a group) still counts towards the total.
  const saved = round2(Object.values(savedBy).reduce((a, v) => a + v, 0));
  return {
    id: p.id,
    item_name: p.item_name,
    category: p.category,
    target,
    months: p.months,
    split_mode: p.split_mode,
    start_date: start,
    end_date: end,
    months_left: monthsLeft,
    saved,
    remaining: round2(Math.max(0, target - saved)),
    pct: target > 0 ? Math.round((saved / target) * 100) : 0,
    mine: p.created_by === uid,
    isMember: members.some((m) => m.isMe),
    partner_id: p.partner_id,
    group_id: p.group_id,
    created_by: p.created_by,
    members,
  };
}

/**
 * Inside `c`: `userId` leaves `groupId`'s plans. Their contributions go back to the cards they came
 * from, they stop being a member and the others' shares are scaled back up to 100%.
 */
export async function leaveGroupPlans(c, groupId, userId) {
  const plans = await many(
    'select p.id, p.item_name from public.shared_plans p where p.group_id = $1 for update',
    [groupId],
    c
  );
  if (!plans.length) return;
  const ids = plans.map((p) => p.id);
  await query(
    `insert into public.transactions (user_id, source_id, kind, name, category, amount, note)
     select t.user_id, t.source_id, 'income', left('Returned from ' || p.item_name, 80), 'Savings', sum(t.amount), 'Left the group'
       from public.transactions t join public.shared_plans p on p.id = t.shared_plan_id
      where t.shared_plan_id = any($1::uuid[]) and t.user_id = $2 and t.kind = 'shared_saving'
      group by t.user_id, t.source_id, p.item_name
     having sum(t.amount) > 0`,
    [ids, userId],
    c
  );
  await query(
    "update public.transactions set shared_plan_id = null where shared_plan_id = any($1::uuid[]) and user_id = $2 and kind = 'shared_saving'",
    [ids, userId],
    c
  );
  await query(
    'delete from public.shared_plan_members where plan_id = any($1::uuid[]) and user_id = $2',
    [ids, userId],
    c
  );
  // Rescale the remaining shares to 100 (rounding remainder to the first member).
  const rest = await many(
    'select plan_id, user_id, share_pct from public.shared_plan_members where plan_id = any($1::uuid[]) order by plan_id, joined_at, user_id',
    [ids],
    c
  );
  const byPlan = new Map();
  for (const m of rest) {
    if (!byPlan.has(m.plan_id)) byPlan.set(m.plan_id, []);
    byPlan.get(m.plan_id).push(m);
  }
  for (const [planId, list] of byPlan) {
    const sum = list.reduce((a, m) => a + Number(m.share_pct), 0);
    if (Math.round(sum * 100) === 10000) continue;
    const scaled = list.map((m) => ({ ...m, pct: Math.round((Number(m.share_pct) / sum) * 10000) / 100 }));
    scaled[0].pct = round2(100 - scaled.slice(1).reduce((a, m) => a + m.pct, 0));
    for (const m of scaled) {
      await query(
        'update public.shared_plan_members set share_pct = $3 where plan_id = $1 and user_id = $2',
        [planId, m.user_id, m.pct],
        c
      );
    }
  }
  // A plan nobody is in any more is deleted (the trigger refunds what's left in it).
  await query(
    'delete from public.shared_plans p where p.id = any($1::uuid[]) and not exists (select 1 from public.shared_plan_members m where m.plan_id = p.id)',
    [ids],
    c
  );
}
