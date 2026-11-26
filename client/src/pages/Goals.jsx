import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { GOAL_ICON, I } from '../lib/icons.js';
import { monthYear } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import AddMoneyForm from '../components/AddMoneyForm.jsx';
import { Coin, ErrorNote, Icon, Modal, Num, SkeletonRows } from '../components/ui.jsx';

export default function Goals() {
  const { fmtShort, refresh, toast } = useApp();
  const { data, setData, loading, error } = useApi('/goals');
  const [drop, setDrop] = useState('');
  const [modal, setModal] = useState(null); // 'new' | goal (edit)
  const [adding, setAdding] = useState(null); // goal getting money
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);

  const goals = data || [];
  const totalSaved = goals.reduce((a, g) => a + g.saved, 0);
  const totalTarget = goals.reduce((a, g) => a + g.target, 0);

  async function addMoney(goal, amount, src) {
    const list = await api.post(`/goals/${goal.id}/contribute`, { amount, source_id: src.id });
    setData(list);
    setAdding(null);
    refresh();
    toast(`Added ${fmtShort(amount)} to ${goal.name} from ${src.name}`);
    setDrop(goal.id);
    clearTimeout(t.current);
    t.current = setTimeout(() => setDrop(''), 950);
  }

  return (
    <>
      <Topbar
        heading="Savings goals"
        sub="Put a little aside for the things you're dreaming of."
        tagline="Dream bigger, save more!"
      />
      <div className="enter col" style={{ gap: 20 }}>
        <div className="toolbar">
          <div>
            <div className="small-muted">Saved across all goals</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              <Num value={totalSaved} decimals={0} />{' '}
              <span style={{ fontSize: 15, fontWeight: 500, color: '#6B5A33' }}>of {fmtShort(totalTarget)}</span>
            </div>
          </div>
          <button className="btn" onClick={() => setModal('new')}>
            <Icon d={I.plus} />
            Add a goal
          </button>
        </div>

        <ErrorNote>{error}</ErrorNote>
        {loading && !data && <SkeletonRows n={2} />}
        {data && goals.length === 0 && (
          <div className="card empty-card">
            <div className="lid" style={{ '--h': '90px' }} />
            <div className="jar" style={{ '--h': '90px', marginTop: -12 }}>
              <span className="glint" />
            </div>
            <b style={{ color: '#3B2F12' }}>No goals yet</b>A new laptop, a trip, a safety net — name it and watch the
            jar fill up.
          </div>
        )}

        <div className="stg row-wrap">
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
            const reached = g.saved >= g.target;
            return (
              <div key={g.id} className="card goal">
                <div style={{ position: 'relative', flex: 'none' }}>
                  {drop === g.id && (
                    <div
                      className="dropin"
                      style={{ position: 'absolute', left: 28, top: 0, '--to': '70px', zIndex: 2 }}
                    >
                      <Coin size={22} style={{ fontSize: 10 }} />
                    </div>
                  )}
                  <div className="lid" style={{ '--h': '104px' }} />
                  <div className="jar" style={{ '--h': '104px' }}>
                    <div className="lvl" style={{ height: `${pct}%` }} />
                    <span className="glint" />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="gi">
                      <Icon d={GOAL_ICON[g.icon] || GOAL_ICON.star} size={18} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: '#6B5A33' }}>
                        {g.target_date ? `Target: ${monthYear(g.target_date)}` : 'No deadline'}
                      </div>
                    </div>
                    <button className="ed" aria-label={`Edit ${g.name}`} onClick={() => setModal(g)}>
                      <Icon d={I.edit} size={17} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 700 }}>
                      <Num value={g.saved} decimals={0} />
                    </span>
                    <span style={{ fontSize: 14, color: '#6B5A33' }}>/ {fmtShort(g.target)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="bar">
                      <div className="fill" style={{ width: `${pct}%`, transition: 'width 1.2s var(--ease)' }} />
                    </div>
                    <span style={{ fontWeight: 700, color: '#8A6406', minWidth: 42, textAlign: 'right' }}>{pct}%</span>
                  </div>
                  <div className="goal-foot">
                    <span>{reached ? 'Goal reached! 🎉' : `${fmtShort(Math.max(0, g.target - g.saved))} to go`}</span>
                    {!reached && (
                      <button type="button" className="btn sm" onClick={() => setAdding(g)}>
                        <Icon d={I.plus} size={16} />
                        Add money
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'new' ? 'Add a goal' : `Edit ${modal?.name || ''}`}
      >
        {modal && (
          <GoalForm
            initial={modal === 'new' ? null : modal}
            onDone={(list, m) => {
              setData(list);
              setModal(null);
              toast(m);
            }}
          />
        )}
      </Modal>
      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Add money to ${adding?.name || ''}`}>
        {adding && <AddMoneyForm name={adding.name} onSubmit={(amount, src) => addMoney(adding, amount, src)} />}
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
  const { sources, fmt, refresh } = useApp();
  const deposited = initial?.deposited || 0; // money moved in from cards; a delete gives it back
  const [returnTo, setReturnTo] = useState(null); // source id while "Return … to which card?" shows
  const [deleting, setDeleting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const tg = parseFloat(String(target).replace(',', '.'));
    if (!name.trim()) return setErr('Name your goal.');
    if (!tg) return setErr('How much do you need?');
    const body = {
      name: name.trim(),
      target: tg,
      initial_saved: parseFloat(String(saved).replace(',', '.')) || 0,
      target_date: date || null,
      icon,
    };
    try {
      onDone(
        initial ? await api.patch(`/goals/${initial.id}`, body) : await api.post('/goals', body),
        initial ? 'Goal updated' : 'Goal added'
      );
    } catch (e2) {
      setErr(e2.message);
    }
  }
  function remove() {
    setErr('');
    if (deposited > 0) {
      setReturnTo(sources[0]?.id || '');
      return;
    } // ask where the money goes first
    if (window.confirm(`Delete ${initial.name}?`)) destroy(null);
  }
  async function destroy(sourceId) {
    setDeleting(true);
    setErr('');
    try {
      await api.del(`/goals/${initial.id}`, sourceId ? { return_to_source_id: sourceId } : undefined);
      const src = sources.find((s) => s.id === sourceId);
      refresh();
      onDone(
        await api.get('/goals'),
        src ? `Goal deleted — ${fmt(deposited)} returned to ${src.name}` : 'Goal deleted'
      );
    } catch (e2) {
      if (e2.code === 'return_source_required') setReturnTo(sources[0]?.id || '');
      setErr(e2.message);
    } finally {
      setDeleting(false);
    }
  }

  if (returnTo !== null) {
    return (
      <div className="modal-body">
        <div style={{ fontWeight: 600, fontSize: 16 }}>Return {fmt(deposited)} to which card?</div>
        <span className="small-muted">
          Deleting {initial.name} gives back the money you moved into it from your cards.
          {initial.initial_saved > 0 &&
            ` The ${fmt(initial.initial_saved)} you had saved before isn't on a card, so it isn't moved.`}
        </span>
        <div>
          <label className="lbl" htmlFor="gr">
            Card or wallet
          </label>
          <select className="inp" id="gr" value={returnTo} onChange={(e) => setReturnTo(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {fmt(s.balance)}
              </option>
            ))}
          </select>
        </div>
        <ErrorNote>{err}</ErrorNote>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn-o"
            onClick={() => {
              setReturnTo(null);
              setErr('');
            }}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{ flex: 1, background: '#B91C1C', color: '#fff' }}
            disabled={deleting || !returnTo}
            onClick={() => destroy(returnTo)}
          >
            {deleting ? <span className="spin" /> : `Return ${fmt(deposited)} & delete goal`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="modal-body">
      <div>
        <label className="lbl" htmlFor="gn">
          Goal
        </label>
        <input
          className="inp"
          id="gn"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New Laptop"
        />
      </div>
      <div className="row-wrap" style={{ gap: 10 }}>
        <div style={{ flex: '1 1 120px' }}>
          <label className="lbl" htmlFor="gt">
            Target
          </label>
          <input
            className="inp"
            id="gt"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="1200"
          />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label className="lbl" htmlFor="gs">
            Already saved
          </label>
          <input
            className="inp"
            id="gs"
            inputMode="decimal"
            value={saved}
            onChange={(e) => setSaved(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
      <div>
        <label className="lbl" htmlFor="gd">
          Target date <span style={{ fontWeight: 400, color: '#6B5A33' }}>(optional)</span>
        </label>
        <input className="inp" id="gd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <span className="lbl">Icon</span>
        <div className="row-wrap" style={{ gap: 8 }}>
          {Object.keys(GOAL_ICON).map((k) => (
            <button
              type="button"
              key={k}
              className={`look ${icon === k ? 'on' : ''}`}
              style={{ background: '#FDF3D2', color: '#8A6406' }}
              aria-label={`Icon ${k}`}
              aria-pressed={icon === k}
              onClick={() => setIcon(k)}
            >
              <Icon d={GOAL_ICON[k]} size={18} />
            </button>
          ))}
        </div>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <div style={{ display: 'flex', gap: 10 }}>
        {initial && (
          <button type="button" className="btn-o" style={{ color: '#B91C1C', borderColor: '#FECACA' }} onClick={remove}>
            <Icon d={I.trash} size={18} />
            Delete
          </button>
        )}
        <button className="btn" style={{ flex: 1 }}>
          Save goal
        </button>
      </div>
    </form>
  );
}
