import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { CAT_ICON, CATEGORIES, I } from '../lib/icons.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { ErrorNote, Icon, Modal, SkeletonRows } from '../components/ui.jsx';

const LABEL = { over: 'Over budget', near: 'Near limit', under: 'Under budget' };

export default function Budgets() {
  const { fmtShort, refresh, toast } = useApp();
  const { data, setData, loading, error } = useApi('/budgets');
  const [closed, setClosed] = useState({});
  const [editing, setEditing] = useState(null);
  const budgets = data || [];

  const spent = budgets.reduce((a, b) => a + b.spent, 0);
  const limit = budgets.reduce((a, b) => a + b.monthly_limit, 0);
  const month = new Date().toLocaleDateString('en-US', { month: 'long' });
  const sections = CATEGORIES.map((c) => ({ cat: c, items: budgets.filter((b) => b.category === c) })).filter((s) => s.items.length);
  const alert = budgets.filter((b) => b.status !== 'under').sort((a, b) => b.pct - a.pct)[0];

  async function saved(list, msg) { setData(list); setEditing(null); refresh(); toast(msg); }
  async function remove(b) {
    if (!window.confirm(`Delete the ${b.name} budget?`)) return;
    try { await api.del(`/budgets/${b.id}`); setData(budgets.filter((x) => x.id !== b.id)); refresh(); toast('Budget deleted'); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <>
      <Topbar heading="Budget management" sub={`${month} · ${fmtShort(spent)} spent of ${fmtShort(limit)} budgeted`} tagline="Stick to your budget!" />
      <div className="enter split-layout">
        <div className="split-main">
          <div className="toolbar">
            <span className="small-muted" style={{ fontSize: 14 }}>{budgets.length} budget{budgets.length === 1 ? '' : 's'} in {sections.length} categor{sections.length === 1 ? 'y' : 'ies'}</span>
            <a className="btn" href="#add-budget" onClick={() => setTimeout(() => document.getElementById('bc')?.focus(), 300)}><Icon d={I.plus} />Add budget</a>
          </div>

          {alert && (
            <div className="toast warn-toast" role="alert" style={{ boxShadow: '0 12px 28px rgba(180,83,9,.12)' }}>
              <span className="warn-ic"><Icon d={I.warn} size={20} /></span>
              <span style={{ fontSize: 14, flex: 1 }}>
                {alert.status === 'over'
                  ? <><b>{alert.name}</b> is over budget ({fmtShort(alert.spent)} / {fmtShort(alert.monthly_limit)})</>
                  : <>⚠️ You've used <b>{alert.pct}%</b> of your {alert.name} budget ({fmtShort(alert.spent)} / {fmtShort(alert.monthly_limit)})</>}
              </span>
              <Link to={`/transactions?q=${encodeURIComponent(alert.category)}`} style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Review</Link>
            </div>
          )}

          <ErrorNote>{error}</ErrorNote>
          {loading && !data && <SkeletonRows n={3} />}
          {data && budgets.length === 0 && (
            <div className="card empty-card">
              <span className="gold" style={{ width: 54, height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d={CAT_ICON.Coffee} /></span>
              <b style={{ color: '#3B2F12' }}>No budgets yet</b>
              Set a monthly limit for a category and SpendSmart will warn you before you overspend.
            </div>
          )}

          {sections.map((s) => {
            const open = !closed[s.cat];
            const sp = s.items.reduce((a, b) => a + b.spent, 0);
            const lim = s.items.reduce((a, b) => a + b.monthly_limit, 0);
            return (
              <div key={s.cat} className="col" style={{ gap: 12 }}>
                <button className="sec-btn" onClick={() => setClosed({ ...closed, [s.cat]: open })} aria-expanded={open}>
                  <span className="gold sec-ic"><Icon d={CAT_ICON[s.cat]} size={20} /></span>
                  <span style={{ flex: 1 }}>{s.cat} <span className="sec-sum">· {fmtShort(sp)} / {fmtShort(lim)}</span></span>
                  <Icon d={I.chevron} style={{ color: '#6B5A33', transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform .4s var(--spring)' }} />
                </button>
                {open && (
                  <div className="stg row-wrap" style={{ gap: 14 }}>
                    {s.items.map((b) => {
                      const st = b.status;
                      return (
                        <div key={b.id} className="card bcard">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 16 }}>{b.name}</span>
                            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span className={`st ${st}`}>{LABEL[st]}</span>
                              <button className="ib2" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)}><Icon d={I.edit} size={16} /></button>
                              <button className="ib2 del" aria-label={`Delete ${b.name}`} onClick={() => remove(b)}><Icon d={I.trash} size={16} /></button>
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div className={`bar lg ${st === 'over' ? 'shake' : ''}`}>
                              <div className={`fill ${st === 'over' ? 'over' : ''}`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                              <span className={`thr ${b.pct >= b.alert_threshold - 10 && st !== 'over' ? 'pulse' : ''}`} style={{ left: `${b.alert_threshold}%` }} title="Alert threshold" />
                            </div>
                            <span className={`pct ${st}`}>{b.pct}%</span>
                          </div>
                          <div className="bcard-foot">
                            <span><b style={{ color: '#3B2F12' }}>{fmtShort(b.spent)}</b> / {fmtShort(b.monthly_limit)} · alert at {b.alert_threshold}%</span>
                            <Link to={`/transactions?q=${encodeURIComponent(b.category)}`} style={{ fontWeight: 600 }}>› Show transactions</Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="split-aside">
          <div className="card" id="add-budget" style={{ padding: 22 }}>
            <BudgetForm onSaved={(l) => saved(l, 'Budget saved')} />
          </div>
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name || ''}`}>
        {editing && <BudgetForm initial={editing} onSaved={(l) => saved(l, 'Budget updated')} />}
      </Modal>
    </>
  );
}

function BudgetForm({ initial, onSaved }) {
  const { fmt, fmtShort } = useApp();
  const [category, setCategory] = useState(initial?.category || 'Food');
  const [name, setName] = useState(initial?.name || '');
  const [limit, setLimit] = useState(initial ? String(initial.monthly_limit) : '');
  const [thr, setThr] = useState(initial?.alert_threshold || 80);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const lim = parseFloat(String(limit).replace(',', '.')) || 0;

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!lim) return setErr('Enter a monthly limit above zero.');
    setBusy(true);
    const body = { category, name: name.trim() || category, monthly_limit: lim, alert_threshold: thr };
    try {
      const list = initial ? await api.patch(`/budgets/${initial.id}`, body) : await api.post('/budgets', body);
      if (!initial) { setName(''); setLimit(''); setThr(80); }
      onSaved(list);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const id = initial ? 'e' : 'b';
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!initial && (
        <span style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="gold" style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon d={I.plus} size={16} /></span>Add a budget
        </span>
      )}
      <div><label className="lbl" htmlFor={`${id}c`}>Category</label>
        <select className="inp" id={`${id}c`} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div><label className="lbl" htmlFor={`${id}i`}>Item</label><input className="inp" id={`${id}i`} placeholder={`e.g. ${category === 'Coffee' ? 'Bubble tea' : category}`} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className="lbl" htmlFor={`${id}l`}>Monthly limit</label><input className="inp" id={`${id}l`} inputMode="decimal" placeholder={fmt(40)} value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><label className="lbl" htmlFor={`${id}t`}>Alert threshold</label><span style={{ fontSize: 20, fontWeight: 700, color: '#8A6406' }}>{thr}%</span></div>
        <input id={`${id}t`} className="range" type="range" min="50" max="100" step="5" value={thr} onChange={(e) => setThr(Number(e.target.value))} />
        <div className="bar" style={{ marginTop: 10 }}><div className="fill live" style={{ width: `${thr}%`, opacity: 0.5 }} /><span className="thr" style={{ left: `${thr}%`, transition: 'left .3s var(--ease)' }} /></div>
        <div className="small-muted" style={{ fontSize: 12.5, marginTop: 8 }}>{lim ? `Alert once you spend ${fmtShort(Math.round(lim * thr) / 100)} of ${fmtShort(lim)}` : 'Pick a limit to see when we\'ll nudge you'}</div>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn full" disabled={busy}>{busy ? <span className="spin" /> : 'Save budget'}</button>
    </form>
  );
}
