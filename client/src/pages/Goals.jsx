import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { GOAL_ICON, I } from '../lib/icons.js';
import { monthYear } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { Coin, ErrorNote, Icon, Modal, Num, SkeletonRows } from '../components/ui.jsx';

const AMTS = [20, 50, 100];

export default function Goals() {
  const { fmtShort, sources, refresh, toast } = useApp();
  const { data, setData, loading, error } = useApi('/goals');
  const [gid, setGid] = useState('');
  const [amtIdx, setAmtIdx] = useState(1);
  const [custom, setCustom] = useState('');
  const [srcId, setSrcId] = useState('');
  const [msg, setMsg] = useState(null);
  const [drop, setDrop] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);

  const goals = data || [];
  const goal = goals.find((g) => g.id === gid) || goals[0];
  const src = sources.find((s) => s.id === srcId) || sources[0];
  const amount = amtIdx === 3 ? (parseFloat(String(custom).replace(',', '.')) || 0) : AMTS[amtIdx];
  const totalSaved = goals.reduce((a, g) => a + g.saved, 0);
  const totalTarget = goals.reduce((a, g) => a + g.target, 0);

  async function add() {
    if (!goal || !src || !amount) return;
    setBusy(true); setMsg(null);
    try {
      const list = await api.post(`/goals/${goal.id}/contribute`, { amount, source_id: src.id });
      setData(list); refresh();
      setDrop(goal.id);
      setMsg({ ok: true, text: `Added ${fmtShort(amount)} to ${goal.name} from ${src.name}.` });
      clearTimeout(t.current); t.current = setTimeout(() => setDrop(''), 950);
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar heading="Savings goals" sub="Put a little aside for the things you're dreaming of." tagline="Dream bigger, save more!" />
      <div className="enter split-layout">
        <div className="split-main" style={{ gap: 20 }}>
          <div className="toolbar">
            <div>
              <div className="small-muted">Saved across all goals</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}><Num value={totalSaved} decimals={0} /> <span style={{ fontSize: 15, fontWeight: 500, color: '#6B5A33' }}>of {fmtShort(totalTarget)}</span></div>
            </div>
            <button className="btn" onClick={() => setModal('new')}><Icon d={I.plus} />Add a goal</button>
          </div>

          <ErrorNote>{error}</ErrorNote>
          {loading && !data && <SkeletonRows n={2} />}
          {data && goals.length === 0 && (
            <div className="card empty-card">
              <div className="lid" style={{ '--h': '90px' }} /><div className="jar" style={{ '--h': '90px', marginTop: -12 }}><span className="glint" /></div>
              <b style={{ color: '#3B2F12' }}>No goals yet</b>A new laptop, a trip, a safety net — name it and watch the jar fill up.
            </div>
          )}

          <div className="stg row-wrap">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
              return (
                <div key={g.id} className="card goal">
                  <div style={{ position: 'relative', flex: 'none' }}>
                    {drop === g.id && <div className="dropin" style={{ position: 'absolute', left: 28, top: 0, '--to': '70px', zIndex: 2 }}><Coin size={22} style={{ fontSize: 10 }} /></div>}
                    <div className="lid" style={{ '--h': '104px' }} />
                    <div className="jar" style={{ '--h': '104px' }}><div className="lvl" style={{ height: `${pct}%` }} /><span className="glint" /></div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="gi"><Icon d={GOAL_ICON[g.icon] || GOAL_ICON.star} size={18} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</div><div style={{ fontSize: 12, color: '#6B5A33' }}>{g.target_date ? `Target: ${monthYear(g.target_date)}` : 'No deadline'}</div></div>
                      <button className="ed" aria-label={`Edit ${g.name}`} onClick={() => setModal(g)}><Icon d={I.edit} size={17} /></button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 24, fontWeight: 700 }}><Num value={g.saved} decimals={0} /></span><span style={{ fontSize: 14, color: '#6B5A33' }}>/ {fmtShort(g.target)}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="bar"><div className="fill" style={{ width: `${pct}%`, transition: 'width 1.2s var(--ease)' }} /></div><span style={{ fontWeight: 700, color: '#8A6406', minWidth: 42, textAlign: 'right' }}>{pct}%</span></div>
                    <div style={{ fontSize: 12.5, color: '#6B5A33' }}>{g.saved >= g.target ? 'Goal reached! 🎉' : `${fmtShort(Math.max(0, g.target - g.saved))} to go`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="split-aside">
          {goal && (
            <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Add money to a goal</span>
              <div><label className="lbl" htmlFor="gg">Goal</label>
                <select className="inp" id="gg" value={goal.id} onChange={(e) => { setGid(e.target.value); setMsg(null); }}>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
              </div>
              <div><span className="lbl">Amount</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {AMTS.map((v, k) => <button type="button" key={v} className={`opt ${k === amtIdx ? 'on' : ''}`} onClick={() => setAmtIdx(k)} aria-pressed={k === amtIdx}>{fmtShort(v)}</button>)}
                  <button type="button" className={`opt ${amtIdx === 3 ? 'on' : ''}`} onClick={() => setAmtIdx(3)} aria-pressed={amtIdx === 3}>Other</button>
                </div>
                {amtIdx === 3 && <input className="inp" style={{ marginTop: 8 }} inputMode="decimal" aria-label="Custom amount" placeholder="Amount" autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} />}
              </div>
              <div><span className="lbl">Take it from</span>
                <div className="row-wrap" style={{ gap: 8 }}>
                  {sources.map((s) => (
                    <button type="button" key={s.id} className={`mini-src ${s.id === src?.id ? 'on' : ''}`} onClick={() => setSrcId(s.id)} aria-pressed={s.id === src?.id}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</span><span style={{ fontSize: 14, fontWeight: 700 }}><Num value={s.balance} /></span>
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn full" onClick={add} disabled={busy || !amount}>{busy ? <span className="spin" /> : `Add ${fmtShort(amount)} to ${goal.name}`}</button>
              {msg && <div className="toast" style={{ background: msg.ok ? '#DCFCE7' : '#FEE2E2', color: msg.ok ? '#166534' : '#B91C1C', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>{msg.text}</div>}
            </div>
          )}
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Add a goal' : `Edit ${modal?.name || ''}`}>
        {modal && <GoalForm initial={modal === 'new' ? null : modal} onDone={(list, m) => { setData(list); setModal(null); toast(m); }} />}
      </Modal>
    </>
  );
}

function GoalForm({ initial, onDone }) {
  const [name, setName] = useState(initial?.name || '');
  const [target, setTarget] = useState(initial ? String(initial.target) : '');
  const [saved, setSaved] = useState(initial ? String(initial.initial_saved) : '');
  const [date, setDate] = useState(initial?.target_date || '');
  const [icon, setIcon] = useState(initial?.icon || 'star');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault(); setErr('');
    const tg = parseFloat(String(target).replace(',', '.'));
    if (!name.trim()) return setErr('Name your goal.');
    if (!tg) return setErr('How much do you need?');
    const body = { name: name.trim(), target: tg, initial_saved: parseFloat(String(saved).replace(',', '.')) || 0, target_date: date || null, icon };
    try { onDone(initial ? await api.patch(`/goals/${initial.id}`, body) : await api.post('/goals', body), initial ? 'Goal updated' : 'Goal added'); }
    catch (e2) { setErr(e2.message); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${initial.name}? Money you moved in stays logged in your transactions.`)) return;
    await api.del(`/goals/${initial.id}`);
    onDone(await api.get('/goals'), 'Goal deleted');
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><label className="lbl" htmlFor="gn">Goal</label><input className="inp" id="gn" value={name} onChange={(e) => setName(e.target.value)} placeholder="New Laptop" /></div>
      <div className="row-wrap" style={{ gap: 10 }}>
        <div style={{ flex: '1 1 120px' }}><label className="lbl" htmlFor="gt">Target</label><input className="inp" id="gt" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1200" /></div>
        <div style={{ flex: '1 1 120px' }}><label className="lbl" htmlFor="gs">Already saved</label><input className="inp" id="gs" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" /></div>
      </div>
      <div><label className="lbl" htmlFor="gd">Target date <span style={{ fontWeight: 400, color: '#6B5A33' }}>(optional)</span></label><input className="inp" id="gd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div><span className="lbl">Icon</span>
        <div className="row-wrap" style={{ gap: 8 }}>
          {Object.keys(GOAL_ICON).map((k) => <button type="button" key={k} className={`look ${icon === k ? 'on' : ''}`} style={{ background: '#FDF3D2', color: '#8A6406' }} aria-label={`Icon ${k}`} aria-pressed={icon === k} onClick={() => setIcon(k)}><Icon d={GOAL_ICON[k]} size={18} /></button>)}
        </div>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <div style={{ display: 'flex', gap: 10 }}>
        {initial && <button type="button" className="btn-o" style={{ color: '#B91C1C', borderColor: '#FECACA' }} onClick={remove}><Icon d={I.trash} size={18} />Delete</button>}
        <button className="btn" style={{ flex: 1 }}>Save goal</button>
      </div>
    </form>
  );
}
