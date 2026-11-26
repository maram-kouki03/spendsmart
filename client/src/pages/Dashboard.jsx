import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { I, SUB_COLOR, SUB_ICON } from '../lib/icons.js';
import { firstName, relDay, renewText, shortDate } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Topbar from '../components/Topbar.jsx';
import Insights from '../components/Insights.jsx';
import { BankCard, Coin, ErrorNote, Icon, Num } from '../components/ui.jsx';

/** One card or wallet: name, big balance, and its last movement just underneath. */
function MoneyCard({ src, fmt }) {
  const dark = src.style === 'g2';
  const last = src.last;
  const income = last?.kind === 'income';
  const amtColor = income ? (dark ? '#86EFAC' : '#15803D') : dark ? '#FCA5A5' : '#B91C1C';
  return (
    <Link className="src-tile" to={`/transactions?source=${src.id}`} aria-label={`${src.name} — view transactions`}>
      <BankCard source={src}>
        <div className="money-top">
          {src.kind === 'cash' ? (
            <Icon d={I.wallet} style={{ color: dark ? '#FFF0B3' : '#8A6406' }}>
              <circle cx="16" cy="14" r="1.3" />
            </Icon>
          ) : (
            <span className="emv" />
          )}
          <span className="money-name">{src.name}</span>
        </div>
        <div>
          <div className="money-bal">
            <Num value={src.balance} />
          </div>
          <div className={`money-last${dark ? ' dark' : ''}`}>
            {last ? (
              <>
                <b className="num" style={{ color: amtColor }}>
                  {fmt(last.amount, { sign: income ? '+' : '−' })}
                </b>
                <span className="money-meta">
                  {' '}
                  · {last.name} · {relDay(last.occurred_at)}
                </span>
              </>
            ) : (
              <span className="money-meta">No activity yet</span>
            )}
          </div>
        </div>
      </BankCard>
    </Link>
  );
}

export default function Dashboard() {
  const { summary, error, refresh, fmt, toast } = useApp();
  const { user } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [chartErr, setChartErr] = useState('');
  const name = firstName(summary?.profile?.full_name || user?.full_name || '', user?.email);

  const s = summary;
  const noActivity = s && s.sources.every((x) => !x.last);

  // Re-pull chart data whenever the summary refreshes (new purchase, seed, etc.).
  useEffect(() => {
    if (!summary) return undefined;
    let live = true;
    api
      .get('/analytics')
      .then((d) => {
        if (live) {
          setAnalytics(d);
          setChartErr('');
        }
      })
      .catch((e) => {
        if (live) setChartErr(e.message);
      });
    return () => {
      live = false;
    };
  }, [summary]);

  async function seed() {
    setSeeding(true);
    try {
      await api.post('/demo/seed');
      await refresh();
      toast('Sample month loaded — have a look around!');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSeeding(false);
    }
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
            <div className="small-muted">
              Log your first purchase, set starting balances in Settings — or load a sample month to explore.
            </div>
          </div>
          <Link className="btn-o" to="/settings">
            Set balances
          </Link>
          <button className="btn" onClick={seed} disabled={seeding}>
            {seeding ? <span className="spin" /> : 'Load sample month'}
          </button>
        </div>
      )}

      <div className="stg col" style={{ gap: 24 }}>
        <h2 className="h2">My money</h2>
        <div className="row-wrap" style={{ gap: 18, marginTop: -10 }}>
          {s?.sources.map((src) => (
            <MoneyCard key={src.id} src={src} fmt={fmt} />
          ))}
          {!s &&
            [1, 2, 3].map((k) => (
              <div key={k} className="src-tile">
                <span className="skel" style={{ height: 178, borderRadius: 22 }} />
              </div>
            ))}
        </div>

        <h2 className="h2">Insights</h2>
        {chartErr && <ErrorNote>{chartErr}</ErrorNote>}
        <div style={{ marginTop: -10 }}>
          <Insights data={analytics} />
        </div>

        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="h2">Upcoming</h2>
            <span className="small-muted">Next 7 days</span>
          </div>
          {s && s.upcoming.length === 0 && <div className="small-muted">Nothing due this week. Enjoy it ✨</div>}
          <div className="stg row-wrap" style={{ gap: 12 }}>
            {s?.upcoming.map((u) =>
              u.type === 'subscription' ? (
                <Link key={`s${u.id}`} className="up" to="/subscriptions">
                  <span
                    className="up-ic"
                    style={{
                      background: (SUB_COLOR[u.color] || SUB_COLOR.cocoa)[0],
                      color: (SUB_COLOR[u.color] || SUB_COLOR.cocoa)[1],
                    }}
                  >
                    <svg
                      className="ic"
                      viewBox="0 0 24 24"
                      style={
                        u.icon === 'play'
                          ? { width: 18, height: 18, fill: 'currentColor', stroke: 'none' }
                          : { width: 18, height: 18 }
                      }
                      aria-hidden="true"
                    >
                      <path d={SUB_ICON[u.icon] || SUB_ICON.play} />
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="up-t">
                      {u.title} · {fmt(u.amount)}
                    </div>
                    {u.days <= 3 ? (
                      <span className="st near" style={{ marginTop: 4 }}>
                        {renewText(u.days)}
                      </span>
                    ) : (
                      <span className="st date-pill" style={{ marginTop: 4 }}>
                        {shortDate(u.date)}
                      </span>
                    )}
                  </div>
                </Link>
              ) : (
                <Link key={`p${u.id}`} className="up" to="/shared">
                  <span
                    className="up-ic"
                    style={{
                      borderRadius: u.group ? 13 : '50%',
                      background: u.group ? '#DDD6FE' : '#FBCFE8',
                      color: u.group ? '#4C1D95' : '#9D174D',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {u.initials}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="up-t">
                      {u.from} · {u.title}
                    </div>
                    <span className="st pend" style={{ marginTop: 4 }}>
                      Split request · your share {fmt(u.amount)}
                    </span>
                  </div>
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
