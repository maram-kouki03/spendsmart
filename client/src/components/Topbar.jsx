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
  invite: { bg: '#E0E7FF', fg: '#3730A3', d: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M19 8v6M16 11h6' },
  info: { bg: '#FDF3D2', fg: '#8A6406', d: I.bell }
};

export default function Topbar({ heading, sub, tagline }) {
  const { summary, refresh, toast, sources } = useApp();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const meWrap = useRef(null);
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const wrap = useRef(null);

  const name = summary?.profile?.full_name || user?.full_name || '';
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

  useEffect(() => {
    if (!meOpen) return undefined;
    const onDoc = (e) => { if (!meWrap.current?.contains(e.target)) setMeOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMeOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [meOpen]);

  async function logOut() {
    setLeaving(true);
    try {
      await logout();
      nav('/login', { replace: true });
    } catch (e) {
      setLeaving(false);
      toast(e.message || 'Could not log out', 'err');
    }
  }

  async function markAll() {
    await api.post('/notifications/read-all');
    await Promise.all([load(), refresh()]);
  }
  async function respond(n, ok) {
    try {
      if (n.action === 'contact') {
        await api.post(`/invites/${n.data.invite_id}/${ok ? 'accept' : 'decline'}`);
        toast(ok ? 'Invitation accepted' : 'Invitation declined');
      } else if (n.action === 'group') {
        await api.post(`/groups/${n.data.group_id}/${ok ? 'accept' : 'decline'}`);
        toast(ok ? 'You joined the group' : 'Invitation declined');
      } else if (ok) {
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
      window.dispatchEvent(new CustomEvent('spendsmart:shared-changed'));
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

      <div className="me-wrap" ref={meWrap}>
        <button type="button" className="me-chip" aria-haspopup="menu" aria-expanded={meOpen} onClick={() => setMeOpen(!meOpen)}>
          <span className="gold me-av">{initials(name, email)}</span>
          <span className="me-name">{firstName(name, email)}</span>
          <svg viewBox="0 0 24 24" className="me-caret" aria-hidden="true" style={{ transform: meOpen ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div role="menu" aria-label="Account" aria-hidden={!meOpen} className="me-menu"
          style={{ opacity: meOpen ? 1 : 0, transform: meOpen ? 'scale(1) translateY(0)' : 'scale(.9) translateY(-6px)', visibility: meOpen ? 'visible' : 'hidden' }}>
          {email && <div className="me-menu-email" title={email}>{email}</div>}
          <Link role="menuitem" to="/settings" className="me-menu-item" tabIndex={meOpen ? 0 : -1} onClick={() => setMeOpen(false)}>Settings</Link>
          <button role="menuitem" type="button" className="me-menu-item danger" tabIndex={meOpen ? 0 : -1} onClick={logOut} disabled={leaving}>
            {leaving ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </div>
    </header>
  );
}
