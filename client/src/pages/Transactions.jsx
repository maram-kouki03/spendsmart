import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { CAT_ICON, I } from '../lib/icons.js';
import { dayLabel, time, todayISO } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { ErrorNote, Icon, Seg, SkeletonRows } from '../components/ui.jsx';

export default function Transactions() {
  const { sources, fmt, refresh, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const src = params.get('source') || 'all';
  const q = params.get('q') || '';
  const [kind, setKind] = useState('expense');
  const [form, setForm] = useState(true);
  const path = `/transactions${qs({ kind, source: src, q })}`;
  const { data, loading, error, reload } = useApi(path, { minDelay: 350 });

  const set = (k, v) => { const p = new URLSearchParams(params); if (v && v !== 'all') p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const exp = kind === 'expense';
  const sign = exp ? '−' : '+';
  const color = exp ? '#DC2626' : '#15803D';
  const groups = useMemo(() => {
    const out = [];
    for (const t of data || []) {
      const d = dayLabel(t.occurred_at);
      let g = out.find((x) => x.d === d);
      if (!g) { g = { d, items: [], sum: 0 }; out.push(g); }
      g.items.push(t); g.sum += t.amount;
    }
    return out;
  }, [data]);
  const total = (data || []).reduce((a, t) => a + t.amount, 0);

  async function remove(t) {
    if (!window.confirm(`Delete “${t.name}”? Its amount goes back to ${t.source?.name || 'the source'}.`)) return;
    try { await api.del(`/transactions/${t.id}`); toast('Deleted'); reload(); refresh(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <>
      <Topbar heading="Transactions" sub="Everything that came in and went out." tagline="Every coin has a story!" />
      <div className="enter split-layout">
        <div className="split-main">
          <div className="toolbar">
            <div className="row-wrap" style={{ gap: 8 }} role="group" aria-label="Filter by source">
              {[{ id: 'all', name: 'All' }, ...sources].map((c) => (
                <button key={c.id} className={`chip ${c.id === src ? 'on' : ''}`} onClick={() => set('source', c.id)} aria-pressed={c.id === src}>{c.name}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Seg label="Type" value={kind} onChange={setKind} style={{ width: 240 }} options={[{ value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
              <button className="btn" onClick={() => setForm(!form)} style={{ height: 48, padding: '0 18px' }}><Icon d={I.plus} size={18} />Add income</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14, color: '#6B5A33', alignItems: 'center' }}>
            <span>Showing <b style={{ color: '#3B2F12' }}>{(data || []).length} {exp ? 'expenses' : 'income entries'}</b></span>
            <span>Total <b style={{ color }}>{sign}{fmt(total)}</b></span>
            {q && <button className="chip on" onClick={() => set('q', '')} aria-label={`Clear search ${q}`}>“{q}” <Icon d={I.close} size={14} /></button>}
          </div>

          <ErrorNote>{error}</ErrorNote>
          {loading && <SkeletonRows n={5} />}
          {!loading && (
            <div className="stg col" style={{ gap: 18 }}>
              {groups.length === 0 && <div className="card empty-card">{q ? `Nothing matches “${q}”.` : 'Nothing here yet for this source.'}</div>}
              {groups.map((g) => (
                <div key={g.d} className="col" style={{ gap: 8 }}>
                  <div className="day-head"><span>{g.d}</span><span>{sign}{fmt(g.sum)}</span></div>
                  <div className="card" style={{ overflow: 'hidden' }}>
                    {g.items.map((t) => (
                      <div key={t.id} className="tx-row">
                        <span className="cat-ic"><Icon d={CAT_ICON[t.category] || CAT_ICON.More} /></span>
                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                          <div style={{ fontSize: 12.5, color: '#6B5A33' }}>{t.category} · {time(t.occurred_at)}{t.note ? ` · ${t.note}` : ''}</div>
                        </div>
                        <span className="srcp">{t.source?.name}</span>
                        <span className="tx-amt" style={{ color }}>{sign}{fmt(t.amount)}</span>
                        <button className="row-del" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}><Icon d={I.trash} size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="split-aside">
          {form && <IncomeForm onClose={() => setForm(false)} onSaved={() => { setKind('income'); reload(); refresh(); }} />}
        </div>
      </div>
    </>
  );
}

function IncomeForm({ onClose, onSaved }) {
  const { sources, fmt, toast } = useApp();
  const [amount, setAmount] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const src = sources.find((s) => s.id === sourceId) || sources[0];
  const amt = parseFloat(String(amount).replace(',', '.')) || 0;

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (!amt || amt <= 0) return setErr('Enter an amount above zero.');
    if (!src) return setErr('Add a card or wallet in Settings first.');
    setBusy(true);
    try {
      await api.post('/transactions', { kind: 'income', name: note.trim() || 'Income', amount: amt, source_id: src.id, occurred_at: date, note: null });
      toast(`${fmt(amt)} added to ${src.name}`);
      setAmount(''); setNote('');
      onSaved();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <form className="card msgin" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={save}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 600, fontSize: 16 }}>Add income</span><button type="button" className="x-btn" onClick={onClose} aria-label="Close"><Icon d={I.close} size={18} /></button></div>
      <div><label className="lbl" htmlFor="ia">Amount</label><input className="inp" id="ia" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontWeight: 700, color: '#15803D', fontSize: 18 }} /></div>
      <div><label className="lbl" htmlFor="is">Source receiving it</label>
        <select className="inp" id="is" value={src?.id || ''} onChange={(e) => setSourceId(e.target.value)}>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmt(s.balance)}</option>)}
        </select>
      </div>
      <div><label className="lbl" htmlFor="in">Note</label><input className="inp" id="in" placeholder="Freelance project, stipend, gift…" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div><label className="lbl" htmlFor="id">Date</label><input className="inp" id="id" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {src && amt > 0 && <div className="note-ok">{src.name}: {fmt(src.balance)} → {fmt(src.balance + amt)} after this income</div>}
      <ErrorNote>{err}</ErrorNote>
      <button className="btn full" disabled={busy}>{busy ? <span className="spin" /> : 'Save income'}</button>
    </form>
  );
}
