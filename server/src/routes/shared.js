import { Router } from 'express';
import { z } from 'zod';
import { db } from '../supabase.js';
import { ah, must, parse, HttpError, round2, initials, money } from '../lib/util.js';
import { CATEGORIES, getSource, monthSpendByCategory, notify } from '../lib/finance.js';

const r = Router();
const who = (p) => p?.full_name || p?.email || 'Someone';

/** People, groups, balances, shared budgets and pending requests. */
r.get('/shared', ah(async (req, res) => {
  const uid = req.user.id;
  const [contacts, memberOf, splits, sbs] = await Promise.all([
    db.from('contacts').select('id, relation, contact:profiles!contacts_contact_id_fkey(id, full_name, email)').eq('owner_id', uid).order('created_at').then(must),
    db.from('group_members').select('group_id').eq('user_id', uid).then(must),
    db.from('split_requests').select('*, from:profiles!split_requests_from_user_fkey(id, full_name, email), to:profiles!split_requests_to_user_fkey(id, full_name, email)')
      .or(`from_user.eq.${uid},to_user.eq.${uid}`).order('created_at', { ascending: false }).limit(200).then(must),
    db.from('shared_budgets').select('*, limits:shared_budget_limits(user_id, monthly_limit)').then(must)
  ]);

  const groupIds = memberOf.map((m) => m.group_id);
  const groups = groupIds.length
    ? must(await db.from('groups').select('id, name, owner_id, members:group_members(user:profiles(id, full_name, email))').in('id', groupIds).order('created_at'))
    : [];

  // Monthly spend per user, only for people in a shared budget with me.
  const spendCache = {};
  const spendOf = async (userId, cat) => {
    if (!spendCache[userId]) spendCache[userId] = await monthSpendByCategory(userId);
    return spendCache[userId][cat] || 0;
  };
  const nameOf = {};
  contacts.forEach((c) => { nameOf[c.contact.id] = who(c.contact); });
  groups.forEach((g) => g.members.forEach((m) => { nameOf[m.user.id] = who(m.user); }));
  nameOf[uid] = 'Me';

  async function budgetView(b, memberIds) {
    const rows = [];
    for (const id of memberIds) {
      const lim = b.limits.find((l) => l.user_id === id);
      rows.push({ user_id: id, name: id === uid ? 'Me' : (nameOf[id] || 'Member'), isMe: id === uid,
        spent: await spendOf(id, b.category), limit: lim ? Number(lim.monthly_limit) : null });
    }
    return { id: b.id, name: b.name, category: b.category, rows };
  }

  const people = [];
  for (const c of contacts) {
    const them = c.contact.id;
    let iOwe = 0, theyOwe = 0;
    for (const s of splits) {
      if (s.status !== 'pending' || s.group_id) continue;
      if (s.from_user === them && s.to_user === uid) iOwe += Number(s.share_amount);
      if (s.from_user === uid && s.to_user === them) theyOwe += Number(s.share_amount);
    }
    const mine = sbs.filter((b) => (b.created_by === uid && b.partner_id === them) || (b.created_by === them && b.partner_id === uid));
    people.push({ kind: 'person', id: c.id, user_id: them, name: who(c.contact), email: c.contact.email, initials: initials(c.contact.full_name, c.contact.email),
      relation: c.relation, iOwe: round2(iOwe), theyOwe: round2(theyOwe),
      budgets: await Promise.all(mine.map((b) => budgetView(b, [uid, them]))) });
  }

  const groupViews = [];
  for (const g of groups) {
    const members = g.members.map((m) => ({ user_id: m.user.id, name: m.user.id === uid ? 'You' : who(m.user), initials: initials(m.user.full_name, m.user.email) }));
    const pending = splits.filter((s) => s.group_id === g.id && s.status === 'pending');
    const latest = pending[0];
    groupViews.push({ kind: 'group', id: g.id, name: g.name, owner: g.owner_id === uid, members,
      pending: latest ? { title: latest.title, share: Number(latest.share_amount) } : null,
      pendingCount: pending.length,
      budgets: await Promise.all(sbs.filter((b) => b.group_id === g.id).map((b) => budgetView(b, members.map((m) => m.user_id)))) });
  }

  const shape = (s) => ({ id: s.id, title: s.title, category: s.category, total: Number(s.total_amount), share: Number(s.share_amount), status: s.status,
    group_id: s.group_id, created_at: s.created_at, from: { id: s.from.id, name: who(s.from), initials: initials(s.from.full_name, s.from.email) },
    to: { id: s.to.id, name: who(s.to) } });

  res.json({
    people, groups: groupViews,
    incoming: splits.filter((s) => s.to_user === uid && s.status === 'pending').map(shape),
    outgoing: splits.filter((s) => s.from_user === uid).slice(0, 20).map(shape)
  });
}));

async function findByEmail(email) {
  const p = must(await db.from('profiles').select('id, full_name, email').ilike('email', email.trim()).maybeSingle());
  if (!p) throw new HttpError(404, `No SpendSmart account uses ${email} yet — ask them to sign up first.`);
  return p;
}

r.post('/contacts', ah(async (req, res) => {
  const body = parse(z.object({ email: z.string().email(), relation: z.string().trim().max(40).default('Friend') }), req.body);
  const p = await findByEmail(body.email);
  if (p.id === req.user.id) throw new HttpError(400, "That's you!");
  must(await db.from('contacts').upsert([
    { owner_id: req.user.id, contact_id: p.id, relation: body.relation },
    { owner_id: p.id, contact_id: req.user.id, relation: body.relation }
  ], { onConflict: 'owner_id,contact_id', ignoreDuplicates: true }));
  res.status(201).json({ ok: true });
}));

r.delete('/contacts/:id', ah(async (req, res) => {
  must(await db.from('contacts').delete().eq('id', req.params.id).eq('owner_id', req.user.id));
  res.status(204).end();
}));

r.post('/groups', ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(40), emails: z.array(z.string().email()).min(1).max(20) }), req.body);
  const members = [];
  for (const e of body.emails) members.push(await findByEmail(e));
  const g = must(await db.from('groups').insert({ owner_id: req.user.id, name: body.name }).select().single());
  const ids = [...new Set([req.user.id, ...members.map((m) => m.id)])];
  must(await db.from('group_members').insert(ids.map((user_id) => ({ group_id: g.id, user_id }))));
  res.status(201).json(g);
}));

r.delete('/groups/:id', ah(async (req, res) => {
  must(await db.from('groups').delete().eq('id', req.params.id).eq('owner_id', req.user.id));
  res.status(204).end();
}));

async function isMember(groupId, userId) {
  const m = must(await db.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', userId).maybeSingle());
  return !!m;
}

/** Log what I paid and ask the other person (or each group member) for their share. */
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
  const src = await getSource(uid, body.source_id);
  if (!src) throw new HttpError(404, 'Card or wallet not found');
  const total = round2(body.amount);

  let recipients, share, groupId = null;
  if (body.target.type === 'person') {
    const c = must(await db.from('contacts').select('id').eq('owner_id', uid).eq('contact_id', body.target.user_id).maybeSingle());
    if (!c) throw new HttpError(403, 'Add this person first');
    recipients = [body.target.user_id];
    share = round2(total * (100 - body.my_pct) / 100);
  } else {
    groupId = body.target.group_id;
    if (!(await isMember(groupId, uid))) throw new HttpError(403, 'Not in this group');
    const mem = must(await db.from('group_members').select('user_id').eq('group_id', groupId));
    recipients = mem.map((m) => m.user_id).filter((id) => id !== uid);
    if (!recipients.length) throw new HttpError(400, 'This group has no one else in it');
    share = round2(total / (recipients.length + 1));
  }

  must(await db.from('transactions').insert({ user_id: uid, source_id: src.id, kind: 'expense', name: body.title, category: body.category, amount: total, note: 'Shared expense' }));
  const rows = must(await db.from('split_requests').insert(recipients.map((to) => ({
    from_user: uid, to_user: to, group_id: groupId, title: body.title, category: body.category, total_amount: total, share_amount: share, from_source_id: src.id
  }))).select());

  const prefs = must(await db.from('profiles').select('id, notify_split, currency').in('id', recipients));
  for (const p of prefs) {
    if (!p.notify_split) continue;
    const row = rows.find((x) => x.to_user === p.id);
    await notify(p.id, { type: 'split', title: `${who(req.profile)} added ${body.title} – ${money(total, p.currency)}`,
      body: `Deduct your share (${money(share, p.currency)})?`, data: { split_id: row.id }, dedupe_key: `split:${row.id}` });
  }
  res.status(201).json({ share, count: rows.length });
}));

async function accept(split, userProfile, sourceId) {
  const src = await getSource(userProfile.id, sourceId);
  if (!src) throw new HttpError(404, 'Card or wallet not found');
  const share = Number(split.share_amount);
  const fromName = who(split.from);
  must(await db.from('transactions').insert({ user_id: userProfile.id, source_id: src.id, kind: 'expense', name: split.title, category: split.category,
    amount: share, note: `Your share · split with ${fromName}`, split_request_id: split.id }));
  if (split.from_source_id) {
    must(await db.from('transactions').insert({ user_id: split.from_user, source_id: split.from_source_id, kind: 'income', name: `${who(userProfile)} paid their share`,
      category: 'Income', amount: share, note: split.title, split_request_id: split.id }));
  }
  must(await db.from('split_requests').update({ status: 'accepted', to_source_id: src.id, responded_at: new Date().toISOString() }).eq('id', split.id));
  await notify(split.from_user, { type: 'split', title: `${who(userProfile)} accepted ${split.title}`, body: `${money(share)} sent back to you`, dedupe_key: `split-acc:${split.id}` });
  return { before: src.balance, after: round2(src.balance - share), source: src.name };
}

async function loadPending(id, uid) {
  const s = must(await db.from('split_requests').select('*, from:profiles!split_requests_from_user_fkey(id, full_name, email)').eq('id', id).eq('to_user', uid).maybeSingle());
  if (!s) throw new HttpError(404, 'Request not found');
  if (s.status !== 'pending') throw new HttpError(400, `Already ${s.status}`);
  return s;
}

r.post('/splits/:id/accept', ah(async (req, res) => {
  const body = parse(z.object({ source_id: z.string().uuid() }), req.body);
  const s = await loadPending(req.params.id, req.user.id);
  res.json(await accept(s, req.profile, body.source_id));
}));

r.post('/splits/:id/decline', ah(async (req, res) => {
  const s = await loadPending(req.params.id, req.user.id);
  must(await db.from('split_requests').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', s.id));
  await notify(s.from_user, { type: 'split', title: `${who(req.profile)} declined ${s.title}`, dedupe_key: `split-dec:${s.id}` });
  res.json({ ok: true });
}));

/** Pay every pending request this person sent me. */
r.post('/settle', ah(async (req, res) => {
  const body = parse(z.object({ user_id: z.string().uuid(), source_id: z.string().uuid() }), req.body);
  const pending = must(await db.from('split_requests').select('*, from:profiles!split_requests_from_user_fkey(id, full_name, email)')
    .eq('to_user', req.user.id).eq('from_user', body.user_id).eq('status', 'pending').is('group_id', null));
  for (const s of pending) await accept(s, req.profile, body.source_id);
  res.json({ settled: pending.length });
}));

r.post('/shared-budgets', ah(async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(1).max(60), category: z.enum(CATEGORIES), my_limit: z.coerce.number().positive().max(1e8),
    partner_id: z.string().uuid().optional(), group_id: z.string().uuid().optional()
  }).refine((b) => !!b.partner_id !== !!b.group_id, 'Pick a person or a group'), req.body);
  if (body.group_id && !(await isMember(body.group_id, req.user.id))) throw new HttpError(403, 'Not in this group');
  if (body.partner_id) {
    const c = must(await db.from('contacts').select('id').eq('owner_id', req.user.id).eq('contact_id', body.partner_id).maybeSingle());
    if (!c) throw new HttpError(403, 'Add this person first');
  }
  const b = must(await db.from('shared_budgets').insert({ created_by: req.user.id, name: body.name, category: body.category,
    partner_id: body.partner_id || null, group_id: body.group_id || null }).select().single());
  must(await db.from('shared_budget_limits').insert({ shared_budget_id: b.id, user_id: req.user.id, monthly_limit: body.my_limit }));
  res.status(201).json(b);
}));

r.put('/shared-budgets/:id/limit', ah(async (req, res) => {
  const body = parse(z.object({ monthly_limit: z.coerce.number().positive().max(1e8) }), req.body);
  const b = must(await db.from('shared_budgets').select('*').eq('id', req.params.id).maybeSingle());
  if (!b) throw new HttpError(404, 'Shared budget not found');
  const allowed = b.created_by === req.user.id || b.partner_id === req.user.id || (b.group_id && (await isMember(b.group_id, req.user.id)));
  if (!allowed) throw new HttpError(403, 'Not your shared budget');
  must(await db.from('shared_budget_limits').upsert({ shared_budget_id: b.id, user_id: req.user.id, monthly_limit: body.monthly_limit }));
  res.json({ ok: true });
}));

export default r;
