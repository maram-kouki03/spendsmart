import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV } from '../lib/icons.js';
import { useApp } from '../context/AppContext.jsx';
import { LogoMark, Mascot } from './ui.jsx';

const TABS = [['dashboard', 'Home'], ['transactions', 'Activity'], ['add', 'Add'], ['budgets', 'Budgets'], ['shared', 'Shared']];
const KEY = 'ss-nav-prev';

export function activeKey(pathname) {
  if (pathname.startsWith('/add')) return 'add';
  const hit = NAV.find((n) => pathname.startsWith(n[2]));
  return hit ? hit[0] : 'dashboard';
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const { summary } = useApp();
  const active = activeKey(pathname);
  const a = Math.max(0, NAV.findIndex((n) => n[0] === active));
  const [pill, setPill] = useState(() => {
    try { const p = sessionStorage.getItem(KEY); return p !== null && !isNaN(+p) ? +p : a; } catch { return a; }
  });
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    try { sessionStorage.setItem(KEY, String(a)); } catch { /* ignore */ }
    const t = setTimeout(() => setPill(a), 60);
    return () => clearTimeout(t);
  }, [a]);

  const b = summary?.budgets;
  const onTrack = !b || b.total === 0 || b.under === b.total;
  const mascotLine = !b ? 'Loading your month…'
    : b.total === 0 ? 'Add a budget to get friendly nudges'
    : `${b.under} of ${b.total} budgets are under their limit`;

  return (
    <div className="side-root">
      <aside className="ss-side">
        <Link to="/dashboard" className="brand">
          <LogoMark /><span>SpendSmart</span>
        </Link>

        <nav aria-label="Main" className="side-nav">
          <span aria-hidden="true" className="side-pill" style={{ transform: `translateY(${pill * 50}px)` }} />
          {NAV.map((n, i) => {
            const on = i === pill;
            return (
              <Link key={n[0]} to={n[2]} aria-current={i === a ? 'page' : undefined}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
                className="side-link"
                style={{ color: on ? '#3B2F12' : '#6B5A33', fontWeight: i === a ? 600 : 500, background: !on && hover === i ? '#FFFBEF' : 'transparent' }}>
                <svg viewBox="0 0 24 24" className="side-ic" style={{ transform: hover === i ? 'translateY(-3px) rotate(-6deg)' : 'none' }} aria-hidden="true"><path d={n[3]} /></svg>
                {n[1]}
              </Link>
            );
          })}
        </nav>

        <div className="side-mascot">
          <div className="side-bubble">{onTrack ? "You're on track! 🙂" : 'Careful this week!'}</div>
          <Mascot />
          <span className="side-mascot-line">{mascotLine}</span>
        </div>
      </aside>

      <nav className="ss-tabs" aria-label="Main">
        {TABS.map(([k, short]) => {
          const n = NAV.find((x) => x[0] === k);
          const on = k === active, add = k === 'add';
          return (
            <Link key={k} to={n[2]} aria-current={on ? 'page' : undefined} aria-label={n[1]} className="tab-link"
              style={{ fontWeight: on ? 600 : 500, color: on || add ? '#3B2F12' : '#6B5A33', background: on && !add ? '#FDF3D2' : 'transparent', transform: add ? 'translateY(-14px)' : 'none' }}>
              <span className="tab-dot" style={{ width: add ? 52 : 26, height: add ? 52 : 26, background: add ? 'linear-gradient(135deg,#FDEEB2,#FBE38E 50%,#F2D06B)' : 'transparent', boxShadow: add ? '0 10px 20px rgba(232,201,100,.45)' : 'none' }}>
                <svg viewBox="0 0 24 24" className="tab-ic" aria-hidden="true"><path d={n[3]} /></svg>
              </span>{short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
