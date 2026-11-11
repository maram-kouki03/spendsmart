import { Router } from 'express';
import { db } from '../supabase.js';
import { ah, must } from '../lib/util.js';
import { syncSubscriptions } from '../lib/finance.js';

const r = Router();

r.get('/notifications', ah(async (req, res) => {
  await syncSubscriptions(req.profile);
  const rows = must(await db.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30));
  // A split request that has since been answered no longer needs Accept/Decline.
  const splitIds = rows.filter((n) => n.type === 'split' && n.data?.split_id).map((n) => n.data.split_id);
  let open = new Set();
  if (splitIds.length) {
    const pending = must(await db.from('split_requests').select('id').in('id', splitIds).eq('status', 'pending').eq('to_user', req.user.id));
    open = new Set(pending.map((p) => p.id));
  }
  res.json(rows.map((n) => ({ ...n, actionable: n.type === 'split' && open.has(n.data?.split_id) })));
}));

r.post('/notifications/read-all', ah(async (req, res) => {
  must(await db.from('notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false));
  res.json({ ok: true });
}));

r.post('/notifications/:id/read', ah(async (req, res) => {
  must(await db.from('notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id));
  res.json({ ok: true });
}));

export default r;
