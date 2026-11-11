export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Wraps an async route so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Throws on a Supabase error and returns the data. */
export function must({ data, error }) {
  if (error) throw new HttpError(400, error.message);
  return data;
}

/** Parses a zod schema or throws a 400 with the first message. */
export function parse(schema, input) {
  const r = schema.safeParse(input);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HttpError(400, `${i.path.join('.') || 'input'}: ${i.message}`);
  }
  return r.data;
}

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function monthRange(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

const SYMBOL = { TND: 'DT', EUR: '€', USD: '$' };
export function money(n, currency = 'TND') {
  const s = Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${s} ${SYMBOL[currency] || 'DT'}`;
}

export function daysUntil(dateStr) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.round((d - today) / 86400000);
}

export function initials(name = '', email = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email || '?').slice(0, 2).toUpperCase();
}
