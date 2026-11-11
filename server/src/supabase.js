import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

// Service-role client: bypasses RLS, so every query below must filter by the signed-in user.
export const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
