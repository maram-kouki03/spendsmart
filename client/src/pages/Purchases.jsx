import { useMemo, useState } from 'react';
import { qs } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { CAT_ICON, CATEGORIES } from '../lib/icons.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { ErrorNote, Icon, Num, Seg } from '../components/ui.jsx';

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; };
const fmtD = (d, o) => d.toLocaleDateString('en-US', o);

function rangeFor(period) {
  const now = new Date();
  if (period === 'daily') { const s = startOfDay(now); s.setDate(s.getDate() - 2); return { from: s, label: 'Last 3 days' }; }
  if (period === 'weekly') { const s = startOfWeek(now); s.setDate(s.getDate() - 7); return { from: s, label: 'Last 2 weeks' }; }
  const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from: s, label: `${fmtD(s, { month: 'long' })} + ${fmtD(now, { month: 'long' })}` };
}

export default function Purchases() {
  const { sources, fmt } = useApp();
  const [period, setPeriod] = useState('daily');
  const [cat, setCat] = useState('');
  const [src, setSrc] = useState('');
  const { from, label } = rangeFor(period);
  const { data, loading, error } = useApi(`/transactions${qs({ kind: 'expense', from: from.toISOString(), category: cat, source: src })}`, { minDelay: 300 });

  const groups = useMemo(() => {
    const rows = data || [];
    const now = new Date();
    const map = new Map();
    const add = (key, title, item) => { if (!map.has(key)) map.set(key, { d: title, items: [] }); map.get(key).items.push(item); };
    if (period === 'daily') {
      for (const t of rows) {
        const d = startOfDay(t.occurred_at);
        const today = +d === +startOfDay(now);
        add(+d, `${today ? 'Today · ' : ''}${fmtD(d, { weekday: 'short', month: 'short', day: 'numeric' })}`, t);
      }
    } else if (period === 'weekly') {
      const thisWeek = +startOfWeek(now);
      for (const t of rows) {
        const w = startOfWeek(t.occurred_at); const end = new Date(w); end.setDate(end.getDate() + 6);
        const range = `${fmtD(w, { month: 'short', day: 'numeric' })} – ${fmtD(end, w.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
        add(+w, `${+w === thisWeek ? 'This week' : 'Last week'} · ${range}`, t);
      }
    } else {
      // Monthly: one line per category with the number of purchases.
      const byMonth = new Map();
      for (const t of rows) {
        const d = new Date(t.occurred_at); const key = d.getFullYear() * 12 + d.getMonth();
        if (!byMonth.has(key)) byMonth.set(key, { date: d, cats: {} });
        const m = byMonth.get(key).cats;
        m[t.category] = m[t.category] || { id: `${key}-${t.category}`, name: '', category: t.category, n: 0, amount: 0, sources: new Set() };
        m[t.category].n++; m[t.category].amount += t.amount; m[t.category].sources.add(t.source?.name);
      }
      const cur = now.getFullYear() * 12 + now.getMonth();
      return [...byMonth.entries()].sort((a, b) => b[0] - a[0]).map(([key, v]) => ({
        d: `${fmtD(v.date, { month: 'long', year: 'numeric' })}${key === cur ? ' · so far' : ''}`,
        items: Object.values(v.cats).sort((a, b) => b.amount - a.amount).map((c) => ({
          ...c, name: `${c.category} (${c.n})`, source: { name: c.sources.size === 1 ? [...c.sources][0] : 'Mixed' }
        }))
      }));
    }
    return [...map.values()];
  }, [data, period]);

  const all = groups.reduce((a, g) => a + g.items.reduce((s, t) => s + t.amount, 0), 0);
  const count = (data || []).length;

  return (
    <>
      <Topbar heading="My purchases" sub="Your shopping history by day, week or month." tagline="Little things add up!" />
      <div className="enter col" style={{ gap: 18, maxWidth: 1000 }}>
        <div className="toolbar">
          <Seg label="Period" value={period} onChange={setPeriod} style={{ width: 330, maxWidth: '100%' }}
            options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select className="sel" aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="sel" aria-label="Filter by source" value={src} onChange={(e) => setSrc(e.target.value)}>
              <option value="">All sources</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="gold sheen purch-total">
          <span style={{ fontSize: 14, color: '#57400A' }}>{label}</span>
          <span style={{ fontSize: 34, fontWeight: 700 }}><Num value={Math.round(all * 100) / 100} duration={700} /></span>
          <span style={{ fontSize: 14, color: '#57400A' }}>{count} purchase{count === 1 ? '' : 's'}</span>
        </div>

        <ErrorNote>{error}</ErrorNote>
        {loading ? (
          <div className="card skel-card" aria-busy="true" aria-label="Loading purchases">
            <span className="skel" style={{ height: 14, width: '30%' }} />
            {[1, 2, 3, 4].map((k) => <div key={k} className="skel-row"><span className="skel" style={{ width: 42, height: 42, borderRadius: 13 }} /><span className="skel" style={{ flex: 1, height: 14 }} /><span className="skel" style={{ width: 70, height: 16 }} /></div>)}
          </div>
        ) : (
          <div className="stg col" style={{ gap: 18 }}>
            {groups.length === 0 && <div className="card empty-card">No purchases match these filters.</div>}
            {groups.map((g) => {
              const sum = g.items.reduce((s, t) => s + t.amount, 0);
              return (
                <div key={g.d} className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px 6px', fontSize: 14, fontWeight: 600, color: '#6B5A33' }}>{g.d}</div>
                  {g.items.map((t) => (
                    <div key={t.id} className="tx-row" style={{ padding: '13px 20px' }}>
                      <span className="cat-ic" style={{ width: 42, height: 42, borderRadius: 13 }}><Icon d={CAT_ICON[t.category] || CAT_ICON.More} /></span>
                      <div style={{ flex: '1 1 180px', minWidth: 0, fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                      <span className="tag2">{t.category}</span><span className="tag2">{t.source?.name}</span>
                      <span className="tx-amt" style={{ color: '#DC2626', minWidth: 90, fontSize: 15 }}>−{fmt(t.amount)}</span>
                    </div>
                  ))}
                  <div className="tot"><span>{g.items.length} item{g.items.length === 1 ? '' : 's'}</span><span>Total {fmt(sum)}</span></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
