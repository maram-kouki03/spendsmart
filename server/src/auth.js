import { db } from './supabase.js';

/** Verifies the Supabase access token and loads the caller's profile. */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Session expired — please log in again' });

  const user = data.user;
  let { data: profile } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) {
    // Profile trigger missed (e.g. user created before the migration ran): create it now.
    const { data: created, error: e2 } = await db
      .from('profiles')
      .insert({ id: user.id, email: user.email, full_name: user.user_metadata?.full_name || user.user_metadata?.name || '' })
      .select()
      .single();
    if (e2) return next(e2);
    await db.from('sources').insert([
      { user_id: user.id, name: 'Card 1', kind: 'debit', style: 'g1', position: 0 },
      { user_id: user.id, name: 'Card 2', kind: 'credit', style: 'g2', position: 1 },
      { user_id: user.id, name: 'Cash Wallet', kind: 'cash', style: 'g3', position: 2 }
    ]);
    profile = created;
  }
  req.user = user;
  req.profile = profile;
  next();
}
