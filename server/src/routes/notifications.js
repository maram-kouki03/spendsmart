import { Router } from 'express';
import { many, one, query } from '../db.js';
import { ah, HttpError, isUuid, uuidParam } from '../lib/util.js';

const r = Router();
uuidParam(r, 'Notification not found');

r.get('/notifications', ah(async (req, res) => {
  const rows = await many('select * from public.notifications where user_id = $1 order by created_at desc limit 30', [req.user.id]);
  // Requests and invitations that have since been answered no longer need Accept/Decline.
  const ids = (key, type) => rows.filter((n) => n.type === type && isUuid(n.data?.[key])).map((n) => n.data[key]);
  const splitIds = ids('split_id', 'split'), inviteIds = ids('invite_id', 'invite'), groupIds = ids('group_id', 'invite');
  const [splits, invites, groups] = await Promise.all([
    splitIds.length ? many("select id from public.split_requests where id = any($1::uuid[]) and status = 'pending' and to_user = $2", [splitIds, req.user.id]) : [],
    inviteIds.length ? many("select id from public.contact_invites where id = any($1::uuid[]) and status = 'pending' and to_user = $2", [inviteIds, req.user.id]) : [],
    groupIds.length ? many("select group_id as id from public.group_members where group_id = any($1::uuid[]) and user_id = $2 and status = 'invited'", [groupIds, req.user.id]) : []
  ]);
  const open = new Set([...splits, ...invites, ...groups].map((x) => x.id));
  res.json(rows.map((n) => {
    // action tells the client which endpoint answers it: split → /splits/:id, contact → /invites/:id, group → /groups/:id
    const action = n.type === 'split' && open.has(n.data?.split_id) ? 'split'
      : n.type === 'invite' && open.has(n.data?.invite_id) ? 'contact'
        : n.type === 'invite' && open.has(n.data?.group_id) ? 'group' : null;
    return { ...n, actionable: !!action, action };
  }));
}));

r.post('/notifications/read-all', ah(async (req, res) => {
  await query('update public.notifications set read = true where user_id = $1 and not read', [req.user.id]);
  res.json({ ok: true });
}));

r.post('/notifications/:id/read', ah(async (req, res) => {
  const row = await one('update public.notifications set read = true where id = $1 and user_id = $2 returning id', [req.params.id, req.user.id]);
  if (!row) throw new HttpError(404, 'Notification not found');
  res.json({ ok: true });
}));

export default r;
