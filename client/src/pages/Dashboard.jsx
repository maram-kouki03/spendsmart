import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { I, SUB_COLOR, SUB_ICON } from '../lib/icons.js';
import { firstName, relDay, renewText, shortDate } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Topbar from '../components/Topbar.jsx';
import SourceCard from '../components/SourceCard.jsx';
import { Coin, ErrorNote, Icon, Num } from '../components/ui.jsx';

export default function Dashboard() {
  const { summary, error, refresh, fmt, toast } = useApp();
  const { user } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const name = firstName(summary?.profile?.full_name || user?.user_metadata?.full_name || '', user?.email);

  const s = summary;
  const noActivity = s && s.sources.every((x) => !x.last);
  const monthStart = s ? new Date(s.monthStart) : new Date();
  const range = `${monthStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().getDate()}`;
  const srcNames = s?.sources.map((x) => x.name) || [];
  const across = srcNames.length > 1 ? `${srcNames.slice(0, -1).join(', ')} and ${srcNames.at(-1)}` : srcNames[0] || 'your sources';

  async function seed() {
    setSeeding(true);
    try { await api.post('/demo/seed'); await refresh(); toast('Sample month loaded — have a look around!'); }
    catch (e) { toast(e.message, 'err'); }
    finally { setSeeding(false); }
  }

  return (
    <>
      <Topbar heading={`Hello ${name}! 👋`} sub="Here's where your money stands." tagline="Every coin counts!" />
      <ErrorNote>{error}</ErrorNote>

      {noActivity && (
        <div className="card enter onboard">
          <Coin size={44} spin />
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontWeight: 600 }}>Your wallet is ready</div>
            <div className="small-muted">Log your first purchase, set starting balances in Settings — or load a sample month to explore.</div>
          </div>
          <Link className="btn-o" to="/settings">Set balances</Link>
          <button className="btn" onClick={seed} disabled={seeding}>{seeding ? <span className="spin" /> : 'Load sample month'}</button>
        </div>
      )}

      <div className="stg col" style={{ gap: 24 }}>
        <div className="row-wrap">
          <div className="gold sheen hero3d total-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 14, fontWeight: 600 }}>Total available</span><Coin size={34} spin style={{ fontSize: 14 }} /></div>
            <span className="total-n">{s ? <Num value={s.totals.available} duration={1300} /> : <span className="skel" style={{ display: 'block', height: 54, width: 260 }} />}</span>
            <span style={{ fontSize: 13, color: '#57400A' }}>across {across}</span>
          </div>
          <div className="card sum">
            <span className="sum-l"><span className="sum-ic" style={{ background: '#FEE2E2', color: '#DC2626' }}><Icon d={I.down} size={16} /></span>Spent this month</span>
            <span style={{ fontSize: 30, fontWeight: 700 }}>{s ? <Num value={s.totals.spent} /> : '—'}</span>
            <span style={{ fontSize: 12, color: '#6B5A33' }}>{range}</span>
          </div>
          <div className="card sum">
            <span className="sum-l"><span className="sum-ic" style={{ background: '#DCFCE7', color: '#15803D' }}><Icon d={I.up} size={16} /></span>Income this month</span>
            <span style={{ fontSize: 30, fontWeight: 700, color: '#15803D' }}>{s ? <Num value={s.totals.income} /> : '—'}</span>
            <span style={{ fontSize: 12, color: '#6B5A33' }}>{s?.totals.incomeFrom.length ? s.totals.incomeFrom.join(', ') : 'Nothing yet this month'}</span>
          </div>
        </div>

        <h2 className="h2">My money</h2>
        <div className="row-wrap" style={{ gap: 18, marginTop: -10 }}>
          {s?.sources.map((src) => (
            <Link key={src.id} className="src-tile" to={`/transactions?source=${src.id}`}>
              <SourceCard source={src} />
              <div className="last">
                {src.last
                  ? <><span>{src.last.name} · {relDay(src.last.occurred_at)}</span><span style={{ color: src.last.kind === 'income' ? '#15803D' : '#DC2626', fontWeight: 600 }}>{src.last.kind === 'income' ? '+' : '−'}{fmt(src.last.amount)}</span></>
                  : <span>No activity yet</span>}
              </div>
            </Link>
          ))}
          {!s && [1, 2, 3].map((k) => <div key={k} className="src-tile"><span className="skel" style={{ height: 178, borderRadius: 22 }} /></div>)}
        </div>

        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><h2 className="h2">Upcoming</h2><span className="small-muted">Next 7 days</span></div>
          {s && s.upcoming.length === 0 && <div className="small-muted">Nothing due this week. Enjoy it ✨</div>}
          <div className="stg row-wrap" style={{ gap: 12 }}>
            {s?.upcoming.map((u) => u.type === 'subscription' ? (
              <Link key={`s${u.id}`} className="up" to="/subscriptions">
                <span className="up-ic" style={{ background: (SUB_COLOR[u.color] || SUB_COLOR.cocoa)[0], color: (SUB_COLOR[u.color] || SUB_COLOR.cocoa)[1] }}>
                  <svg className="ic" viewBox="0 0 24 24" style={u.icon === 'play' ? { width: 18, height: 18, fill: 'currentColor', stroke: 'none' } : { width: 18, height: 18 }} aria-hidden="true"><path d={SUB_ICON[u.icon] || SUB_ICON.play} /></svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="up-t">{u.title} · {fmt(u.amount)}</div>
                  {u.days <= 3 ? <span className="st near" style={{ marginTop: 4 }}>{renewText(u.days)}</span> : <span className="st date-pill" style={{ marginTop: 4 }}>{shortDate(u.date)}</span>}
                </div>
              </Link>
            ) : (
              <Link key={`p${u.id}`} className="up" to="/shared">
                <span className="up-ic" style={{ borderRadius: u.group ? 13 : '50%', background: u.group ? '#DDD6FE' : '#FBCFE8', color: u.group ? '#4C1D95' : '#9D174D', fontWeight: 700, fontSize: 13 }}>{u.initials}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="up-t">{u.from} · {u.title}</div>
                  <span className="st pend" style={{ marginTop: 4 }}>Split request · your share {fmt(u.amount)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
