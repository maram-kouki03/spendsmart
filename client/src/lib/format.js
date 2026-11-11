export const SYMBOL = { TND: 'DT', EUR: '€', USD: '$' };

export function money(n, currency = 'TND', { decimals = 2, sign = '' } = {}) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const neg = v < 0 ? '−' : sign;
  return `${neg}${s} ${SYMBOL[currency] || 'DT'}`;
}

/** Short money: "98 DT", "1,250.4 DT". */
export function moneyShort(n, currency = 'TND') {
  const s = Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${s} ${SYMBOL[currency] || 'DT'}`;
}

export const pad2 = (n) => String(n).padStart(2, '0');
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function dayLabel(iso) {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  const long = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (diff === 0) return `Today · ${long}`;
  if (diff === 1) return `Yesterday · ${long}`;
  return long;
}

export function relDay(iso) {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const time = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
export const shortDate = (iso) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const monthYear = (iso) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export function initials(name = '', email = '') {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (email || '?').slice(0, 2).toUpperCase();
}
export const firstName = (name = '', email = '') => name.trim().split(/\s+/)[0] || (email || '').split('@')[0] || 'there';

export function renewText(days) {
  if (days <= 0) return 'Renews today';
  if (days === 1) return 'Renews tomorrow';
  return `Renews in ${days} days`;
}
