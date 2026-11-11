import { supabase } from './supabase.js';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

async function request(method, path, body, { raw = false } = {}) {
  const headers = {};
  const t = await token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
  if (raw) {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (p, opts) => request('GET', p, undefined, opts),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p)
};

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'all') s.set(k, v); });
  const str = s.toString();
  return str ? `?${str}` : '';
}
