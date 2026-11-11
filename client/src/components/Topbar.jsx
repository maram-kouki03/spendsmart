import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { I } from '../lib/icons.js';
import { firstName, initials, timeAgo } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon } from './ui.jsx';

const KIND = {
  budget: { bg: '#FEF3C7', fg: '#B45309', d: I.warn },
  over: { bg: '#FEE2E2', fg: '#DC2626', circle: true },
  subscription: { bg: '#57400A', fg: '#FFF0B3', d: I.play, fill: true },
  split: { bg: '#FBCFE8', fg: '#9D174D', d: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5' },
  info: { bg: '#FDF3D2', fg: '#8A6406', d: I.bell }
};

export default function Topbar({ heading, sub, tagline }) {
  const { summary, refresh, toast, sources } = useApp();
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const wrap = useRef(null);

  const name = summary?.profile?.full_name || user?.user_metadata?.full_name || '';
  const email = user?.email || '';
  const unread = summary?.unread || 0;

  async function load() {
    try { setItems(await api.get('/notifications')); } catch (e) { toast(e.message, 'err'); }
  }
  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  async function markAll() {
    await api.post('/notifications/read-all');
    await Promise.all([load(), refresh()]);
  }
  async function respond(n, ok) {
    try {
      if (ok) {
        const src = sources[0];
        if (!src) throw new Error('Add a card or wallet first');
        await api.post(`/splits/${n.data.split_id}/accept`, { source_id: src.id });
        toast(`Accepted — paid from ${src.name}`);
      } else {
        await api.post(`/splits/${n.data.split_id}/decline`);
        toast('Declined');
      }
      await api.post(`/notifications/${n.id}/read`);
      await Promise.all([load(), refresh()]);
    } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <header className="topbar">
      <div className="enter topbar-title">
        {tagline && <div className="write tagline">{tagline}</div>}
        <h1>{heading}</h1>
        {sub && <p>{sub}</p>}
      </div>

      <form className="inp topbar-search" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/transactions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); }}>
        <svg viewBox="0 0 24 24" className="search-ic" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d={I.search} /></svg>
        <input aria-label="Search" placeholder="Search purchases, budgets, people…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      <div className="bell-wrap" ref={wrap}>
        <button type="button" className="bell-btn" aria-label={`Notifications, ${unread} new`} aria-expanded={open} onClick={() => setOpen(!open)} style={{ background: open ? '#FDF3D2' : '#fff' }}>
          <svg className="jiggle bell-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={I.bell} /></svg>
          {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <div role="dialog" aria-label="Notifications" aria-hidden={!open} className="notif-pop"
          style={{ opacity: open ? 1 : 0, transform: open ? 'scale(1) translateY(0)' : 'scale(.85) translateY(-8px)', visibility: open ? 'visible' : 'hidden' }}>
          <div className="notif-head">
            <span>Notifications</span>
            <button type="button" className="link-btn" onClick={markAll}>Mark all read</button>
          </div>
          {!items && <div className="notif-empty">Loading…</div>}
          {items && items.length === 0 && <div className="notif-empty">You're all caught up ✨</div>}
          <div className="notif-list">
            {items?.map((n, i) => {
              const k = KIND[n.type] || KIND.info;
              return (
                <div key={n.id} className="notif-item" style={{ background: !n.read ? '#FFFBEF' : 'transparent', borderTop: i ? '1px solid #FDF3D2' : 0 }}>
                  <span className="notif-ic" style={{ background: k.bg, color: k.fg }}>
                    {k.circle
                      ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d={I.alert} /></svg>
                      : <svg viewBox="0 0 24 24" aria-hidden="true" style={k.fill ? { fill: 'currentColor', stroke: 'none' } : undefined}><path d={k.d} /></svg>}
                  </span>
                  <div className="notif-body">
                    {n.type === 'budget' && '⚠️ '}<b>{n.title}</b>{n.body ? <> — {n.body}</> : null}
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                    {n.actionable && (
                      <div className="notif-actions">
                        <button type="button" className="btn sm" onClick={() => respond(n, true)}>Accept</button>
                        <button type="button" className="btn-o sm" onClick={() => respond(n, false)}>Decline</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Link to="/settings" className="me-chip">
        <span className="gold me-av">{initials(name, email)}</span>
        <span className="me-name">{firstName(name, email)}</span>
      </Link>
    </header>
  );
}
