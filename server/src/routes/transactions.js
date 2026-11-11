import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../supabase.js';
import { ah, must, parse, HttpError, round2 } from '../lib/util.js';
import { CATEGORIES, getSource, checkBudgetAlerts } from '../lib/finance.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

r.get('/transactions', ah(async (req, res) => {
  const q = parse(z.object({
    kind: z.enum(['expense', 'income', 'goal']).optional(),
    source: z.string().uuid().optional(),
    category: z.string().max(40).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    q: z.string().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(300)
  }), req.query);

  let query = db.from('transactions').select('*, source:sources(id, name)').eq('user_id', req.user.id)
    .order('occurred_at', { ascending: false }).limit(q.limit);
  if (q.kind) query = query.eq('kind', q.kind);
  if (q.source) query = query.eq('source_id', q.source);
  if (q.category) query = query.eq('category', q.category);
  if (q.from) query = query.gte('occurred_at', q.from);
  if (q.to) query = query.lt('occurred_at', q.to);
  if (q.q) {
    const term = q.q.replace(/[%,()]/g, ' ').trim();
    if (term) query = query.or(`name.ilike.%${term}%,note.ilike.%${term}%,category.ilike.%${term}%`);
  }
  const rows = must(await query);
  res.json(rows.map((t) => ({ ...t, amount: Number(t.amount) })));
}));

const txSchema = z.object({
  kind: z.enum(['expense', 'income']),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).optional(),
  amount: z.coerce.number().positive().max(1e8),
  source_id: z.string().uuid(),
  occurred_at: z.string().optional(),
  note: z.string().max(240).optional().nullable()
});

r.post('/transactions', ah(async (req, res) => {
  const body = parse(txSchema, req.body);
  const category = body.kind === 'income' ? 'Income' : (body.category || 'More');
  if (body.kind === 'expense' && !CATEGORIES.includes(category)) throw new HttpError(400, 'Unknown category');

  const before = await getSource(req.user.id, body.source_id);
  if (!before) throw new HttpError(404, 'Card or wallet not found');

  let occurred = new Date();
  if (body.occurred_at) {
    // A plain date (YYYY-MM-DD) keeps today's time so ordering within the day is natural.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(body.occurred_at)
      ? new Date(`${body.occurred_at}T${new Date().toISOString().slice(11)}`)
      : new Date(body.occurred_at);
    if (!isNaN(d)) occurred = d;
  }

  const amount = round2(body.amount);
  const tx = must(await db.from('transactions').insert({
    user_id: req.user.id, source_id: body.source_id, kind: body.kind, name: body.name, category,
    amount, occurred_at: occurred.toISOString(), note: body.note || null
  }).select().single());

  const budgets = body.kind === 'expense' ? await checkBudgetAlerts(req.profile, category, amount) : [];
  const after = round2(before.balance + (body.kind === 'income' ? amount : -amount));
  res.status(201).json({ transaction: { ...tx, amount }, source: { id: before.id, name: before.name, style: before.style, last4: before.last4, before: before.balance, after }, budgets });
}));

r.delete('/transactions/:id', ah(async (req, res) => {
  const tx = must(await db.from('transactions').select('id, receipt_path').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle());
  if (!tx) throw new HttpError(404, 'Transaction not found');
  if (tx.receipt_path) await db.storage.from('receipts').remove([tx.receipt_path]);
  must(await db.from('transactions').delete().eq('id', tx.id));
  res.status(204).end();
}));

r.post('/transactions/:id/receipt', upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  if (!/^image\/(jpeg|png|webp|heic)$/.test(req.file.mimetype)) throw new HttpError(400, 'Use a JPG or PNG image');
  const tx = must(await db.from('transactions').select('id').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle());
  if (!tx) throw new HttpError(404, 'Transaction not found');
  const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
  const path = `${req.user.id}/${tx.id}.${ext}`;
  const { error } = await db.storage.from('receipts').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (error) throw new HttpError(400, error.message);
  must(await db.from('transactions').update({ receipt_path: path }).eq('id', tx.id));
  res.json({ receipt_path: path });
}));

r.get('/transactions/:id/receipt', ah(async (req, res) => {
  const tx = must(await db.from('transactions').select('receipt_path').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle());
  if (!tx?.receipt_path) throw new HttpError(404, 'No receipt');
  const { data, error } = await db.storage.from('receipts').createSignedUrl(tx.receipt_path, 300);
  if (error) throw new HttpError(400, error.message);
  res.json({ url: data.signedUrl });
}));

export default r;
