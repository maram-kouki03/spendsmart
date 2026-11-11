import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

const REMEMBER = 'ss-remember';
export function setRemember(on) {
  try { localStorage.setItem(REMEMBER, on ? '1' : '0'); } catch { /* storage blocked */ }
}
function remember() {
  try { return localStorage.getItem(REMEMBER) !== '0'; } catch { return true; }
}

// "Remember me" keeps the session in localStorage; otherwise it lives only for this tab.
const storage = {
  getItem: (k) => { try { return (remember() ? localStorage : sessionStorage).getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { (remember() ? localStorage : sessionStorage).setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } }
};

export const supabase = createClient(url || 'http://localhost', anon || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage }
});
