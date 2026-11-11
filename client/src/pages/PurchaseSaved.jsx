import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { I } from '../lib/icons.js';
import { relDay } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { Burst, Icon, Num } from '../components/ui.jsx';

export default function PurchaseSaved() {
  const { state } = useLocation();
  const { fmt, fmtShort } = useApp();
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLive(true), 900);
    const t2 = setTimeout(() => setToast(true), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!state?.transaction) return <Navigate to="/add" replace />;
  const { transaction: tx, source, budgets } = state;
  const b = budgets?.[0];
  const crossed = b && (b.pct >= b.threshold) && (b.beforePct < b.threshold || b.pct > 100);
  const w = b ? Math.min(100, live ? b.pct : b.beforePct) : 0;
  const status = (p) => (p > 100 ? ['over', 'Over budget'] : p >= b.threshold ? ['near', 'Near limit'] : ['under', 'Under budget']);
  const [st, stLabel] = b ? status(live ? b.pct : b.beforePct) : [];
  const left = b ? b.limit - b.after : 0;

  return (
    <>
      <Topbar heading="Add a purchase" sub="Saved — here's what changed." tagline="Nicely tracked!" />
      <div className="col" style={{ gap: 20, maxWidth: 980 }}>
        {crossed && toast && !hide && (
          <div className="toast warn-toast" role="alert" style={{ alignSelf: 'flex-end', width: '100%', maxWidth: 470, alignItems: 'flex-start', padding: 16, borderRadius: 20 }}>
            <span className="warn-ic" style={{ width: 40, height: 40 }}><Icon d={I.warn} /></span>
            <div style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>
              ⚠️ You've used <b>{b.pct}%</b> of your {b.name} budget ({fmtShort(b.after)} / {fmtShort(b.limit)})
              <div className="small-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{left >= 0 ? `${fmtShort(left)} left until the limit` : `${fmtShort(-left)} over the limit`} · <Link to="/budgets" style={{ fontWeight: 600 }}>View budget</Link></div>
            </div>
            <button className="x-btn" aria-label="Dismiss" onClick={() => setHide(true)}><Icon d={I.close} size={18} /></button>
          </div>
        )}

        <div className="card enter saved-card">
          <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 14 }}>
            <Burst />
            <svg className="checkpop" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Saved">
              <defs><radialGradient id="ck" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FFF6D0" /><stop offset=".35" stopColor="#FDEEB2" /><stop offset=".7" stopColor="#FBE38E" /><stop offset="1" stopColor="#F2D06B" /></radialGradient></defs>
              <circle cx="60" cy="60" r="58" fill="#FDF3D2" /><circle cx="60" cy="60" r="44" fill="url(#ck)" />
              <path className="draw" d="m42 61 12 12 24-26" fill="none" stroke="#3B2F12" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 60, strokeDashoffset: 60 }} />
            </svg>
          </div>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Purchase saved!</h2>
          <div style={{ fontSize: 15, color: '#6B5A33' }}>{tx.name} · {tx.category} · {source.name} · {relDay(tx.occurred_at)}</div>
        </div>

        <div className="stg row-wrap" style={{ gap: 18 }}>
          <div className={`bank ${source.style || 'g1'}`} style={{ flex: '1 1 280px', minHeight: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="emv" /><span style={{ fontWeight: 600 }}>{source.name} · new balance</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 34, fontWeight: 700 }}><Num value={live ? source.after : source.before} from={source.before} duration={900} /></span>
              <span style={{ fontSize: 14, textDecoration: 'line-through', opacity: 0.75 }}>{fmt(source.before)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="digits">{source.last4 ? `•••• ${source.last4}` : ''}</span><b style={{ color: source.style === 'g2' ? '#FECACA' : '#991B1B' }}>−{fmt(tx.amount)}</b></div>
          </div>
          {b ? (
            <div className="card" style={{ flex: '1 1 280px', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{b.name} budget</span><span className={`st ${st}`}>{stLabel}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="bar lg"><div className={`fill live ${b.pct > 100 && live ? 'over' : ''}`} style={{ width: `${w}%` }} /><span className={`thr ${live ? 'pulse' : ''}`} style={{ left: `${b.threshold}%` }} title={`Alert at ${b.threshold}%`} /></div>
                <span style={{ fontWeight: 700, color: '#B45309', minWidth: 46, textAlign: 'right' }}>{live ? b.pct : b.beforePct}%</span>
              </div>
              <div style={{ fontSize: 13, color: '#6B5A33' }}><b style={{ color: '#3B2F12' }}>{fmtShort(live ? b.after : b.before)}</b> / {fmtShort(b.limit)} · alert at {b.threshold}%</div>
            </div>
          ) : (
            <div className="card" style={{ flex: '1 1 280px', padding: 22, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
              <span style={{ fontWeight: 600 }}>No budget for {tx.category} yet</span>
              <span className="small-muted">Set a monthly limit and we'll nudge you before you overspend.</span>
              <Link to="/budgets" className="btn-o" style={{ alignSelf: 'flex-start', height: 44 }}>Create a budget</Link>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link className="btn-o" to="/add">Add another purchase</Link>
          <Link className="btn" to="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    </>
  );
}
