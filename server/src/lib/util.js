export class HttpError extends Error {
  /** `code` is an optional machine-readable reason the client can branch on; `extra` is merged into the JSON body. */
  constructor(status, message, code, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

/** Wraps an async route so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);


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

// ---- time zones ----
// Calendar logic ("this month", "today", renewal dates) runs in the user's IANA time zone
// (profiles.timezone). Instants are still stored and compared as UTC timestamps.

export const DEFAULT_TZ = 'Africa/Tunis';
const fmtCache = new Map();
function partsFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { partsFormatter(tz); return true; } catch { return false; }
}

const zone = (tz) => (isValidTimeZone(tz) ? tz : DEFAULT_TZ);

/** Wall-clock parts of instant `d` in `tz` (month is 0-based). */
export function zonedParts(d, tz) {
  const p = Object.fromEntries(partsFormatter(zone(tz)).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** How far `tz` is ahead of UTC at instant `d`, in ms. */
function offsetMs(d, tz) {
  const p = zonedParts(d, tz);
  return Date.UTC(p.y, p.m, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant when the wall clock in `tz` shows y-m-d hh:mm (month 0-based; overflow is fine). */
export function zonedTime(y, m, d, tz, h = 0, min = 0) {
  const wall = Date.UTC(y, m, d, h, min);
  let t = wall - offsetMs(new Date(wall), tz);
  const again = wall - offsetMs(new Date(t), tz); // second pass fixes guesses across a DST change
  if (again !== t) t = again;
  return new Date(t);
}

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' of instant `d` in `tz`. */
export function localYmd(d, tz) {
  const p = zonedParts(d, tz);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
}
/** 'YYYY-MM' of instant `d` in `tz`. */
export const localYm = (d, tz) => localYmd(d, tz).slice(0, 7);

/** Days from a 'YYYY-MM-DD' string, e.g. addDays('2026-01-31', 1) → '2026-02-01'. */
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Start (inclusive) and end (exclusive) of the calendar month containing `d`, in `tz`, as ISO strings. */
export function monthRange(d = new Date(), tz = DEFAULT_TZ) {
  const p = zonedParts(d, tz);
  return { start: zonedTime(p.y, p.m, 1, tz).toISOString(), end: zonedTime(p.y, p.m + 1, 1, tz).toISOString() };
}

const SYMBOL = { TND: 'DT', EUR: '€', USD: '$' };
export function money(n, currency = 'TND') {
  const s = Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${s} ${SYMBOL[currency] || 'DT'}`;
}

/** Whole days from today (in `tz`) to the 'YYYY-MM-DD' date `dateStr`; negative when it's past. */
export function daysUntil(dateStr, tz = DEFAULT_TZ, now = new Date()) {
  const today = new Date(localYmd(now, tz) + 'T00:00:00Z');
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.round((d - today) / 86400000);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

/** On router `r`, a malformed `:id` is answered like an unknown one: 404 `notFound`. */
export function uuidParam(r, notFound = 'Not found') {
  r.param('id', (_req, _res, next, id) => next(isUuid(id) ? undefined : new HttpError(404, notFound)));
}

export function initials(name = '', email = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email || '?').slice(0, 2).toUpperCase();
}

/** For PATCH: keep only the validated fields the client actually sent (schema defaults never overwrite data). */
export function provided(parsed, rawBody) {
  const sent = rawBody && typeof rawBody === 'object' ? rawBody : {};
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => Object.prototype.hasOwnProperty.call(sent, k)));
}
