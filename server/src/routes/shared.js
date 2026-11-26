import { Router } from 'express';
import { z } from 'zod';
import { many, one, query, insertRows, tx } from '../db.js';
import { ah, parse, HttpError, round2, initials, money, uuidParam, isUuid, localYmd, DEFAULT_TZ } from '../lib/util.js';
import { CATEGORIES, getActiveSource, notify } from '../lib/finance.js';
import { visiblePlans } from '../lib/plans.js';
import { viewsFor } from './plans.js';
import {
  who, normEmail, maskEmail, areContacts, isActiveMember, checkInviteQuota, logInviteSend,
  cancelPairSplits, cancelGroupSplits, removeFromGroup, contactInviteNote, groupInviteNote, emailJoinInvite,
  INVITE_SENT, GROUP_INVITES_SENT
} from '../lib/sharing.js';

const r = Router();
uuidParam(r);

// json_build_object for a profile as { id, full_name, email }
const personJson = (alias) => `json_build_object('id', ${alias}.id, 'full_name', ${alias}.full_name, 'email', ${alias}.email)`;

/** Split requests joined with both people, like the old `from:profiles(...)`/`to:profiles(...)` embeds. */
const SPLIT_SELECT = `
  select s.*, ${personJson('pf')} as "from", ${personJson('pt')} as "to"
    from public.split_requests s
    join public.profiles pf on pf.id = s.from_user
    join public.profiles pt on pt.id = s.to_user`;

/** People, groups, balances, savings plans and pending requests. */
r.get('/shared', ah(async (req, res) => {
  const uid = req.user.id;
  const [contacts, memberOf, splits] = await Promise.all([
    // Accepted contacts only: both directions must exist.
    many(
      `select c.id, c.relation, ${personJson('p')} as contact
         from public.contacts c join public.profiles p on p.id = c.contact_id
        where c.owner_id = $1
          and exists (select 1 from public.contacts back where back.owner_id = c.contact_id and back.contact_id = c.owner_id)
        order by c.created_at`,
      [uid]
    ),
    many("select group_id from public.group_members where user_id = $1 and status = 'active'", [uid]),
    many(`${SPLIT_SELECT} where s.from_user = $1 or s.to_user = $1 order by s.created_at desc limit 200`, [uid])
  ]);

  const groupIds = memberOf.map((m) => m.group_id);
  const contactIds = contacts.map((c) => c.contact.id);
  const [groups, planRows] = await Promise.all([
    groupIds.length
      ? many(
        `select g.id, g.name, g.owner_id,
                coalesce((select json_agg(json_build_object('user', ${personJson('p')}) order by gm.joined_at, p.created_at)
                            from public.group_members gm join public.profiles p on p.id = gm.user_id
                           where gm.group_id = g.id and gm.status = 'active'), '[]'::json) as members,
                coalesce((select json_agg(json_build_object('email', x.email, 'invited_by', x.invited_by, 'at', x.at) order by x.at)
                            from (select lower(p.email) as email, gm.invited_by, gm.invited_at as at
                                    from public.group_members gm join public.profiles p on p.id = gm.user_id
                                   where gm.group_id = g.id and gm.status = 'invited'
                                  union all
                                  select e.email, e.invited_by, e.created_at
                                    from public.group_email_invites e where e.group_id = g.id) x), '[]'::json) as invited
           from public.groups g
          where g.id = any($1::uuid[])
          order by g.created_at`,
        [groupIds]
      )
      : [],
    // Savings plans I can see: 1:1 plans with a current contact, and my active groups' plans.
    visiblePlans(uid, contactIds, groupIds)
  ]);

  const plans = await viewsFor(planRows, uid, localYmd(new Date(), req.profile?.timezone || DEFAULT_TZ));

  const people = [];
  for (const c of contacts) {
    const them = c.contact.id;
    let iOwe = 0, theyOwe = 0;
    for (const s of splits) {
      if (s.status !== 'pending' || s.group_id) continue;
      if (s.from_user === them && s.to_user === uid) iOwe += Number(s.share_amount);
      if (s.from_user === uid && s.to_user === them) theyOwe += Number(s.share_amount);
    }
    people.push({ kind: 'person', id: c.id, user_id: them, name: who(c.contact), email: c.contact.email, initials: initials(c.contact.full_name, c.contact.email),
      relation: c.relation, iOwe: round2(iOwe), theyOwe: round2(theyOwe),
      plans: plans.filter((p) => !p.group_id && (p.created_by === them || p.partner_id === them)) });
  }

  const groupViews = [];
  for (const g of groups) {
    const owner = g.owner_id === uid;
    const members = g.members.map((m) => ({ user_id: m.user.id, name: m.user.id === uid ? 'You' : who(m.user), initials: initials(m.user.full_name, m.user.email), owner: m.user.id === g.owner_id }));
    // Invited people are shown by the address they were invited with (never their name, so the list
    // doesn't reveal who has an account). Only the owner and whoever invited them see the full address.
    const invited = g.invited.map((x) => {
      const full = owner || x.invited_by === uid;
      return { email: full ? x.email : maskEmail(x.email), canCancel: full, invited_at: x.at };
    });
    const pending = splits.filter((s) => s.group_id === g.id && s.status === 'pending');
    const latest = pending[0];
    groupViews.push({ kind: 'group', id: g.id, name: g.name, owner, members, invited,
      pending: latest ? { title: latest.title, share: Number(latest.share_amount) } : null,
      pendingCount: pending.length,
      plans: plans.filter((p) => p.group_id === g.id) });
  }

  const shape = (s) => ({ id: s.id, title: s.title, category: s.category, total: Number(s.total_amount), share: Number(s.share_amount), status: s.status,
    group_id: s.group_id, created_at: s.created_at, from: { id: s.from.id, name: who(s.from), initials: initials(s.from.full_name, s.from.email) },
    to: { id: s.to.id, name: who(s.to) } });

  res.json({
    people, groups: groupViews,
    incoming: splits.filter((s) => s.to_user === uid && s.status === 'pending').map(shape),
    outgoing: splits.filter((s) => s.from_user === uid).slice(0, 20).map(shape),
    // Every split I sent or received (newest first), for the per-person history.
    history: splits.map(shape)
  });
}));

// ---------------------------------------------------------------------------
// Contacts: invitations
// ---------------------------------------------------------------------------

/** Inside `c`: accepts a (locked, pending) contact invite addressed to `me`. */
async function acceptContactInvite(c, inv, me) {
  await query(
    `insert into public.contacts (owner_id, contact_id, relation) values ($1, $2, $3), ($2, $1, $3)
     on conflict (owner_id, contact_id) do nothing`,
    [inv.from_user, me.id, inv.relation], c
  );
  await query("update public.contact_invites set status = 'accepted', to_user = $2, responded_at = now() where id = $1", [inv.id, me.id], c);
  // An invite I had sent them is answered by this too.
  await query(
    `update public.contact_invites set status = 'accepted', responded_at = now()
      where from_user = $1 and status = 'pending' and (to_user = $2 or to_email = lower($3))`,
    [me.id, inv.from_user, inv.from_email], c
  );
  await notify(inv.from_user, { type: 'invite', title: `${who(me)} accepted your invitation`, body: 'You can now split costs and share budgets.', dedupe_key: `invite-acc:${inv.id}` }, c);
}

const INVITE_SELECT = `
  select i.*, p.email as from_email, p.full_name as from_name
    from public.contact_invites i join public.profiles p on p.id = i.from_user`;

/**
 * Invite someone by email. The answer is the same whether or not the address has an account (and
 * whether or not they're already a contact), so it can't be used to find out who uses SpendSmart.
 */
r.post('/contacts', ah(async (req, res) => {
  const body = parse(z.object({ email: z.string().trim().email().max(320), relation: z.string().trim().min(1).max(40).default('Friend') }), req.body);
  const me = req.profile;
  const email = normEmail(body.email);
  if (email === normEmail(me.email)) throw new HttpError(400, "That's you!");

  const emailTo = await tx(async (c) => {
    await checkInviteQuota(c, me.id, 1);
    const target = await one('select id, full_name, email from public.profiles where lower(email) = $1', [email], c);
    if (target && (await areContacts(me.id, target.id, c))) return null;
    // Already invited (a declined invite also counts: the sender isn't told it was declined).
    if (await one("select 1 from public.contact_invites where from_user = $1 and to_email = $2 and status in ('pending', 'declined')", [me.id, email], c)) return null;
    if (target) {
      // They already invited me: inviting them back is accepting.
      const back = await one(`${INVITE_SELECT} where i.from_user = $1 and i.to_user = $2 and i.status = 'pending' for update of i`, [target.id, me.id], c);
      if (back) { await acceptContactInvite(c, back, me); return null; }
    }
    const inv = await one(
      'insert into public.contact_invites (from_user, to_email, to_user, relation) values ($1, $2, $3, $4) returning id',
      [me.id, email, target?.id ?? null, body.relation], c
    );
    const emailIt = await logInviteSend(c, me.id, email, { hasAccount: !!target });
    if (target) await notify(target.id, contactInviteNote(me, inv.id), c);
    return emailIt ? email : null;
  });

  res.status(202).json({ ok: true, message: INVITE_SENT });
  if (emailTo) emailJoinInvite({ to: emailTo, from: me });
}));

/** Remove a contact: gone on both sides, pending 1:1 splits cancelled, savings plans together ended (each person refunded to their own card). History stays. */
r.delete('/contacts/:id', ah(async (req, res) => {
  await tx(async (c) => {
    const row = await one('select contact_id from public.contacts where id = $1 and owner_id = $2 for update', [req.params.id, req.user.id], c);
    if (!row) throw new HttpError(404, 'Contact not found');
    const them = row.contact_id;
    await query(
      'delete from public.contacts where (owner_id = $1 and contact_id = $2) or (owner_id = $2 and contact_id = $1)',
      [req.user.id, them], c
    );
    await cancelPairSplits(c, req.user.id, them);
    // Your savings plans together end: each person's contributions go back to the card they came from.
    await query(
      'delete from public.shared_plans where (created_by = $1 and partner_id = $2) or (created_by = $2 and partner_id = $1)',
      [req.user.id, them], c
    );
    await query(
      `update public.contact_invites set status = 'cancelled', responded_at = now()
        where status = 'pending' and ((from_user = $1 and to_user = $2) or (from_user = $2 and to_user = $1))`,
      [req.user.id, them], c
    );
  });
  res.status(204).end();
}));

/** Invitations waiting on me (contacts and groups) and contact invitations I sent. */
r.get('/invites', ah(async (req, res) => {
  const uid = req.user.id;
  const [contactsIn, groupsIn, out] = await Promise.all([
    many(`${INVITE_SELECT} where i.to_user = $1 and i.status = 'pending' order by i.created_at desc`, [uid]),
    many(
      `select g.id, g.name, gm.invited_at, p.full_name as from_name, p.email as from_email,
              (select count(*) from public.group_members x where x.group_id = g.id and x.status = 'active') as members
         from public.group_members gm
         join public.groups g on g.id = gm.group_id
         left join public.profiles p on p.id = gm.invited_by
        where gm.user_id = $1 and gm.status = 'invited'
        order by gm.invited_at desc`,
      [uid]
    ),
    // A declined invite still shows as sent: the sender isn't told it was declined.
    many(
      `select id, to_email, relation, created_at from public.contact_invites
        where from_user = $1 and status in ('pending', 'declined') order by created_at desc limit 50`,
      [uid]
    )
  ]);
  const from = (name, email) => ({ name: who({ full_name: name, email }), email, initials: initials(name || '', email || '') });
  res.json({
    incoming: [
      ...contactsIn.map((i) => ({ kind: 'contact', id: i.id, relation: i.relation, created_at: i.created_at, from: from(i.from_name, i.from_email) })),
      ...groupsIn.map((g) => ({ kind: 'group', id: g.id, group: { id: g.id, name: g.name, members: g.members }, created_at: g.invited_at, from: from(g.from_name, g.from_email) }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    outgoing: out.map((i) => ({ kind: 'contact', id: i.id, email: i.to_email, relation: i.relation, created_at: i.created_at, status: 'pending' }))
  });
}));

async function loadIncomingInvite(c, id, uid) {
  const inv = await one(`${INVITE_SELECT} where i.id = $1 and i.to_user = $2 for update of i`, [id, uid], c);
  if (!inv) throw new HttpError(404, 'Invitation not found');
  if (inv.status !== 'pending') throw new HttpError(400, `Already ${inv.status}`);
  return inv;
}

r.post('/invites/:id/accept', ah(async (req, res) => {
  await tx(async (c) => acceptContactInvite(c, await loadIncomingInvite(c, req.params.id, req.user.id), req.profile));
  res.json({ ok: true });
}));

r.post('/invites/:id/decline', ah(async (req, res) => {
  await tx(async (c) => {
    const inv = await loadIncomingInvite(c, req.params.id, req.user.id);
    await query("update public.contact_invites set status = 'declined', responded_at = now() where id = $1", [inv.id], c);
  });
  res.json({ ok: true });
}));

/** Cancel an invitation I sent. */
r.delete('/invites/:id', ah(async (req, res) => {
  const row = await one(
    `update public.contact_invites set status = 'cancelled', responded_at = now()
      where id = $1 and from_user = $2 and status in ('pending', 'declined') returning id`,
    [req.params.id, req.user.id]
  );
  if (!row) throw new HttpError(404, 'Invitation not found');
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Groups: members are invited and must accept
// ---------------------------------------------------------------------------
const emailList = z.array(z.string().trim().email().max(320)).max(20);

/**
 * Inside `c`: invites addresses to a group. People with an account get an 'invited' row and a
 * notification; other addresses are kept until someone signs up with them. Returns the addresses
 * to email after the response.
 */
async function inviteToGroup(c, group, inviter, emails) {
  const list = [...new Set(emails.map(normEmail))].filter((e) => e !== normEmail(inviter.email));
  if (!list.length) return [];
  await checkInviteQuota(c, inviter.id, list.length);
  const toEmail = [];
  for (const email of list) {
    const p = await one('select id from public.profiles where lower(email) = $1', [email], c);
    let added;
    if (p) {
      added = await one(
        `insert into public.group_members (group_id, user_id, status, invited_by) values ($1, $2, 'invited', $3)
         on conflict (group_id, user_id) do nothing returning user_id`,
        [group.id, p.id, inviter.id], c
      );
    } else {
      added = await one(
        `insert into public.group_email_invites (group_id, email, invited_by) values ($1, $2, $3)
         on conflict (group_id, email) do nothing returning email`,
        [group.id, email, inviter.id], c
      );
    }
    if (!added) continue; // already a member / already invited
    const emailIt = await logInviteSend(c, inviter.id, email, { hasAccount: !!p });
    if (p) await notify(p.id, groupInviteNote(inviter, group), c);
    if (emailIt) toEmail.push(email);
  }
  return toEmail;
}

r.post('/groups', ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(40), emails: emailList.min(1) }), req.body);
  const me = req.profile;
  const { group, toEmail } = await tx(async (c) => {
    const group = await one('insert into public.groups (owner_id, name) values ($1, $2) returning *', [me.id, body.name], c);
    await query("insert into public.group_members (group_id, user_id, status, joined_at) values ($1, $2, 'active', now())", [group.id, me.id], c);
    return { group, toEmail: await inviteToGroup(c, group, me, body.emails) };
  });
  res.status(201).json({ ...group, message: GROUP_INVITES_SENT });
  for (const to of toEmail) emailJoinInvite({ to, from: me, groupName: group.name });
}));

/** Loads a group I'm an active member of (404 otherwise), optionally locked. */
async function myGroup(c, groupId, uid, { lock = false } = {}) {
  const g = await one(
    `select g.* from public.groups g
       join public.group_members gm on gm.group_id = g.id and gm.user_id = $2 and gm.status = 'active'
      where g.id = $1 ${lock ? 'for update of g' : ''}`,
    [groupId, uid], c
  );
  if (!g) throw new HttpError(404, 'Group not found');
  return g;
}

/** Invite more people (owner only). */
r.post('/groups/:id/invite', ah(async (req, res) => {
  const body = parse(z.object({ emails: emailList.min(1) }), req.body);
  const me = req.profile;
  const { group, toEmail } = await tx(async (c) => {
    const group = await myGroup(c, req.params.id, me.id, { lock: true });
    if (group.owner_id !== me.id) throw new HttpError(403, 'Only the group owner can invite people');
    return { group, toEmail: await inviteToGroup(c, group, me, body.emails) };
  });
  res.status(202).json({ ok: true, message: INVITE_SENT });
  for (const to of toEmail) emailJoinInvite({ to, from: me, groupName: group.name });
}));

r.post('/groups/:id/accept', ah(async (req, res) => {
  await tx(async (c) => {
    const row = await one(
      `update public.group_members set status = 'active', joined_at = now()
        where group_id = $1 and user_id = $2 and status = 'invited' returning invited_by`,
      [req.params.id, req.user.id], c
    );
    if (!row) throw new HttpError(404, 'Invitation not found');
    const g = await one('select id, name, owner_id from public.groups where id = $1', [req.params.id], c);
    const tell = row.invited_by || g.owner_id;
    if (tell && tell !== req.user.id) {
      await notify(tell, { type: 'invite', title: `${who(req.profile)} joined ${g.name}`, dedupe_key: `group-join:${g.id}:${req.user.id}:${Date.now()}` }, c);
    }
  });
  res.json({ ok: true });
}));

r.post('/groups/:id/decline', ah(async (req, res) => {
  const row = await one("delete from public.group_members where group_id = $1 and user_id = $2 and status = 'invited' returning group_id", [req.params.id, req.user.id]);
  if (!row) throw new HttpError(404, 'Invitation not found');
  res.json({ ok: true });
}));

/** Leave a group. If the owner leaves, the longest-standing member takes over; an empty group is deleted. */
r.post('/groups/:id/leave', ah(async (req, res) => {
  const uid = req.user.id;
  const out = await tx(async (c) => {
    const g = await myGroup(c, req.params.id, uid, { lock: true });
    await removeFromGroup(c, g.id, uid);
    if (g.owner_id !== uid) return { ok: true };
    const next = await one(
      "select user_id from public.group_members where group_id = $1 and status = 'active' order by joined_at, invited_at limit 1", [g.id], c
    );
    if (!next) {
      await cancelGroupSplits(c, g.id);
      await query('delete from public.groups where id = $1', [g.id], c);
      return { ok: true, deleted: true };
    }
    await query('update public.groups set owner_id = $1 where id = $2', [next.user_id, g.id], c);
    await notify(next.user_id, { type: 'info', title: `You're now the owner of ${g.name}`, body: `${who(req.profile)} left the group.`, dedupe_key: `group-owner:${g.id}:${Date.now()}` }, c);
    return { ok: true, newOwner: next.user_id };
  });
  res.json(out);
}));

/** Owner removes an active member. */
r.delete('/groups/:id/members/:userId', ah(async (req, res) => {
  const target = req.params.userId;
  if (!isUuid(target)) throw new HttpError(404, 'Member not found');
  await tx(async (c) => {
    const g = await myGroup(c, req.params.id, req.user.id, { lock: true });
    if (g.owner_id !== req.user.id) throw new HttpError(403, 'Only the group owner can remove members');
    if (target === req.user.id) throw new HttpError(400, 'To leave your own group, use Leave group');
    if (!(await one('select 1 from public.group_members where group_id = $1 and user_id = $2', [g.id, target], c))) throw new HttpError(404, 'Member not found');
    await removeFromGroup(c, g.id, target);
  });
  res.status(204).end();
}));

/** Cancel a pending group invitation (owner, or whoever sent it), by the address it was sent to. */
r.delete('/groups/:id/invites', ah(async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().email().max(320) }), { ...req.query, ...(req.body || {}) });
  const addr = normEmail(email);
  const uid = req.user.id;
  await tx(async (c) => {
    const g = await myGroup(c, req.params.id, uid, { lock: true });
    const isOwner = g.owner_id === uid;
    const a = await one(
      `delete from public.group_members gm using public.profiles p
        where gm.group_id = $1 and gm.status = 'invited' and p.id = gm.user_id and lower(p.email) = $2
          and ($3 or gm.invited_by = $4)
        returning gm.user_id`,
      [g.id, addr, isOwner, uid], c
    );
    const b = await one(
      'delete from public.group_email_invites where group_id = $1 and email = $2 and ($3 or invited_by = $4) returning email',
      [g.id, addr, isOwner, uid], c
    );
    if (!a && !b) throw new HttpError(404, 'Invitation not found');
  });
  res.status(204).end();
}));

r.delete('/groups/:id', ah(async (req, res) => {
  await tx(async (c) => {
    const row = await one('select id from public.groups where id = $1 and owner_id = $2 for update', [req.params.id, req.user.id], c);
    if (!row) throw new HttpError(404, 'Group not found');
    // Otherwise group_id becomes null and pending group splits would look like 1:1 debts.
    await cancelGroupSplits(c, row.id);
    await query('delete from public.groups where id = $1', [row.id], c);
  });
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Splits — only between accepted contacts / active members of the same group
// ---------------------------------------------------------------------------

/** Log what I paid and ask the other person (or each active group member) for their share. */
r.post('/splits', ah(async (req, res) => {
  const body = parse(z.object({
    target: z.discriminatedUnion('type', [
      z.object({ type: z.literal('person'), user_id: z.string().uuid() }),
      z.object({ type: z.literal('group'), group_id: z.string().uuid() })
    ]),
    title: z.string().trim().min(1).max(80),
    category: z.enum(CATEGORIES).default('More'),
    amount: z.coerce.number().positive().max(1e8),
    my_pct: z.coerce.number().min(1).max(99).default(50),
    source_id: z.string().uuid()
  }), req.body);
  const uid = req.user.id;
  const src = await getActiveSource(uid, body.source_id);
  const total = round2(body.amount);

  const rows = await tx(async (c) => {
    let recipients, share, groupId = null;
    if (body.target.type === 'person') {
      if (!(await areContacts(uid, body.target.user_id, c))) throw new HttpError(403, 'You can only split with people who accepted your invitation');
      recipients = [body.target.user_id];
      share = round2(total * (100 - body.my_pct) / 100);
    } else {
      groupId = body.target.group_id;
      if (!(await isActiveMember(groupId, uid, c))) throw new HttpError(403, 'Not in this group');
      const mem = await many("select user_id from public.group_members where group_id = $1 and status = 'active'", [groupId], c);
      recipients = mem.map((m) => m.user_id).filter((id) => id !== uid);
      if (!recipients.length) throw new HttpError(400, 'Nobody else has joined this group yet');
      share = round2(total / (recipients.length + 1));
    }

    await query(
      `insert into public.transactions (user_id, source_id, kind, name, category, amount, note)
       values ($1, $2, 'expense', $3, $4, $5, 'Shared expense')`,
      [uid, src.id, body.title, body.category, total], c
    );
    const created = await insertRows(c, 'split_requests', recipients.map((to) => ({
      from_user: uid, to_user: to, group_id: groupId, title: body.title, category: body.category,
      total_amount: total, share_amount: share, from_source_id: src.id
    })), 'returning *');
    const prefs = await many('select id, notify_split, currency from public.profiles where id = any($1::uuid[])', [recipients], c);
    for (const p of prefs) {
      if (!p.notify_split) continue;
      const row = created.find((x) => x.to_user === p.id);
      await notify(p.id, { type: 'split', title: `${who(req.profile)} added ${body.title} – ${money(total, p.currency)}`,
        body: `Deduct your share (${money(share, p.currency)})?`, data: { split_id: row.id }, dedupe_key: `split:${row.id}` }, c);
    }
    return created;
  });
  res.status(201).json({ share: rows[0].share_amount, count: rows.length });
}));

/** The two people of a split request are still connected (contacts, or both active in its group). */
async function stillConnected(c, split) {
  if (split.group_id) {
    const n = await one(
      "select count(*) as n from public.group_members where group_id = $1 and user_id = any($2::uuid[]) and status = 'active'",
      [split.group_id, [split.from_user, split.to_user]], c
    );
    return n.n === 2;
  }
  return areContacts(split.from_user, split.to_user, c);
}

/** Pays one split request. Must run inside a transaction (`c`) with the request row locked. */
async function accept(c, split, userProfile, sourceId) {
  if (!(await stillConnected(c, split))) throw new HttpError(403, `You're no longer connected with ${who(split.from)} — this request can only be declined`);
  const src = await getActiveSource(userProfile.id, sourceId, c);
  const share = Number(split.share_amount);
  const fromName = who(split.from);
  await query(
    `insert into public.transactions (user_id, source_id, kind, name, category, amount, note, split_request_id)
     values ($1, $2, 'expense', $3, $4, $5, $6, $7)`,
    [userProfile.id, src.id, split.title, split.category, share, `Your share · split with ${fromName}`, split.id], c
  );
  if (split.from_source_id) {
    await query(
      `insert into public.transactions (user_id, source_id, kind, name, category, amount, note, split_request_id)
       values ($1, $2, 'income', $3, 'Income', $4, $5, $6)`,
      [split.from_user, split.from_source_id, `${who(userProfile)} paid their share`, share, split.title, split.id], c
    );
  }
  await query("update public.split_requests set status = 'accepted', to_source_id = $1, responded_at = now() where id = $2", [src.id, split.id], c);
  await notify(split.from_user, { type: 'split', title: `${who(userProfile)} accepted ${split.title}`, body: `${money(share)} sent back to you`, dedupe_key: `split-acc:${split.id}` }, c);
  return { before: src.balance, after: round2(src.balance - share), source: src.name };
}

/** Loads and locks a pending request addressed to me, so it can't be answered twice at once. */
async function loadPending(c, id, uid) {
  const s = await one(`${SPLIT_SELECT} where s.id = $1 and s.to_user = $2 for update of s`, [id, uid], c);
  if (!s) throw new HttpError(404, 'Request not found');
  if (s.status !== 'pending') throw new HttpError(400, `Already ${s.status}`);
  return s;
}

r.post('/splits/:id/accept', ah(async (req, res) => {
  const body = parse(z.object({ source_id: z.string().uuid() }), req.body);
  const out = await tx(async (c) => accept(c, await loadPending(c, req.params.id, req.user.id), req.profile, body.source_id));
  res.json(out);
}));

r.post('/splits/:id/decline', ah(async (req, res) => {
  await tx(async (c) => {
    const s = await loadPending(c, req.params.id, req.user.id);
    await query("update public.split_requests set status = 'declined', responded_at = now() where id = $1", [s.id], c);
    if (await stillConnected(c, s)) {
      await notify(s.from_user, { type: 'split', title: `${who(req.profile)} declined ${s.title}`, dedupe_key: `split-dec:${s.id}` }, c);
    }
  });
  res.json({ ok: true });
}));

/** Pay every pending request this person sent me — all or nothing. */
r.post('/settle', ah(async (req, res) => {
  const body = parse(z.object({ user_id: z.string().uuid(), source_id: z.string().uuid() }), req.body);
  const settled = await tx(async (c) => {
    if (!(await areContacts(req.user.id, body.user_id, c))) throw new HttpError(403, 'You can only settle up with your contacts');
    const pending = await many(
      `${SPLIT_SELECT} where s.to_user = $1 and s.from_user = $2 and s.status = 'pending' and s.group_id is null
       order by s.created_at for update of s`,
      [req.user.id, body.user_id], c
    );
    for (const s of pending) await accept(c, s, req.profile, body.source_id);
    return pending.length;
  });
  res.json({ settled });
}));

export default r;
