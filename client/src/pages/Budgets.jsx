import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { CAT_ICON, CATEGORIES, I } from '../lib/icons.js';
import { periodText, todayISO } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { ErrorNote, Icon, Modal, SkeletonRows } from '../components/ui.jsx';

const LABEL = { over: 'Over limit', near: 'Near limit', under: 'Under limit' };
const PERIODS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom dates' },
];

export default function Budgets() {
  const { fmtShort, refresh, toast } = useApp();
  const { data, setData, loading, error } = useApi('/budgets');
  const [closed, setClosed] = useState({});
  const [modal, setModal] = useState(null); // 'new' | budget (edit)
  const budgets = data || [];

  // The subtitle only adds up budgets whose period is running now.
  const live = budgets.filter((b) => b.current);
  const spent = live.reduce((a, b) => a + b.spent, 0);
  const limit = live.reduce((a, b) => a + b.limit_amount, 0);
  const sections = CATEGORIES.map((c) => ({ cat: c, items: budgets.filter((b) => b.category === c) })).filter(
    (s) => s.items.length
  );
  const alert = live.filter((b) => b.status !== 'under').sort((a, b) => b.pct - a.pct)[0];

  function saved(list, msg) {
    setData(list);
    setModal(null);
    refresh();
    toast(msg);
  }
  async function remove(b) {
    if (!window.confirm(`Delete the ${b.name} budget?`)) return;
    try {
      await api.del(`/budgets/${b.id}`);
      setData(budgets.filter((x) => x.id !== b.id));
      refresh();
      toast('Budget deleted');
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <>
      <Topbar
        heading="Budget management"
        sub={`${fmtShort(spent)} spent of ${fmtShort(limit)} budgeted in the current periods`}
        tagline="Stick to your budget!"
      />
      <div className="enter col" style={{ gap: 18 }}>
        <div className="toolbar">
          <span className="small-muted" style={{ fontSize: 14 }}>
            {budgets.length} budget{budgets.length === 1 ? '' : 's'} in {sections.length} categor
            {sections.length === 1 ? 'y' : 'ies'}
          </span>
          <button className="btn" onClick={() => setModal('new')}>
            <Icon d={I.plus} />
            Add budget
          </button>
        </div>

        {alert && (
          <div className="toast warn-toast" role="alert" style={{ boxShadow: '0 12px 28px rgba(180,83,9,.12)' }}>
            <span className="warn-ic">
              <Icon d={I.warn} size={20} />
            </span>
            <span style={{ fontSize: 14, flex: 1 }}>
              {alert.status === 'over' ? (
                <>
                  <b>{alert.name}</b> is over its limit ({fmtShort(alert.spent)} / {fmtShort(alert.limit_amount)})
                </>
              ) : (
                <>
                  ⚠️ You've used <b>{alert.pct}%</b> of your {alert.name} limit ({fmtShort(alert.spent)} /{' '}
                  {fmtShort(alert.limit_amount)})
                </>
              )}
            </span>
            <Link
              to={`/transactions?q=${encodeURIComponent(alert.category)}`}
              style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Review
            </Link>
          </div>
        )}

        <ErrorNote>{error}</ErrorNote>
        {loading && !data && <SkeletonRows n={3} />}
        {data && budgets.length === 0 && (
          <div className="card empty-card">
            <span
              className="gold"
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon d={CAT_ICON.Coffee} />
            </span>
            <b style={{ color: '#3B2F12' }}>No budgets yet</b>
            Set a limit for a category — per week, month, year or your own dates — and SpendSmart will warn you before
            you overspend.
            <button className="btn" onClick={() => setModal('new')}>
              <Icon d={I.plus} />
              Add budget
            </button>
          </div>
        )}

        {sections.map((s) => {
          const open = !closed[s.cat];
          const sp = s.items.reduce((a, b) => a + b.spent, 0);
          const lim = s.items.reduce((a, b) => a + b.limit_amount, 0);
          return (
            <div key={s.cat} className="col" style={{ gap: 12 }}>
              <button className="sec-btn" onClick={() => setClosed({ ...closed, [s.cat]: open })} aria-expanded={open}>
                <span className="gold sec-ic">
                  <Icon d={CAT_ICON[s.cat]} size={20} />
                </span>
                <span style={{ flex: 1 }}>
                  {s.cat}{' '}
                  <span className="sec-sum">
                    · {fmtShort(sp)} / {fmtShort(lim)}
                  </span>
                </span>
                <Icon
                  d={I.chevron}
                  style={{
                    color: '#6B5A33',
                    transform: `rotate(${open ? 180 : 0}deg)`,
                    transition: 'transform .4s var(--spring)',
                  }}
                />
              </button>
              {open && (
                <div className="stg row-wrap" style={{ gap: 14 }}>
                  {s.items.map((b) => {
                    const st = b.status;
                    return (
                      <div key={b.id} className={`card bcard ${b.current ? '' : 'dim'}`}>
                        <div
                          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 16 }}>{b.name}</div>
                            <div className="bcard-period">{periodText(b)}</div>
                          </div>
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
                            <span className={`st ${st}`}>{LABEL[st]}</span>
                            <button className="ib2" aria-label={`Edit ${b.name}`} onClick={() => setModal(b)}>
                              <Icon d={I.edit} size={16} />
                            </button>
                            <button className="ib2 del" aria-label={`Delete ${b.name}`} onClick={() => remove(b)}>
                              <Icon d={I.trash} size={16} />
                            </button>
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div className={`bar lg ${st === 'over' ? 'shake' : ''}`}>
                            <div
                              className={`fill ${st === 'over' ? 'over' : ''}`}
                              style={{ width: `${Math.min(b.pct, 100)}%` }}
                            />
                            <span
                              className={`thr ${b.pct >= b.alert_threshold - 10 && st !== 'over' ? 'pulse' : ''}`}
                              style={{ left: `${b.alert_threshold}%` }}
                              title="Alert threshold"
                            />
                          </div>
                          <span className={`pct ${st}`}>{b.pct}%</span>
                        </div>
                        <div className="bcard-foot">
                          <span>
                            <b style={{ color: '#3B2F12' }}>{fmtShort(b.spent)}</b> / {fmtShort(b.limit_amount)} limit ·
                            alert at {b.alert_threshold}%
                          </span>
                          <Link to={`/transactions?q=${encodeURIComponent(b.category)}`} style={{ fontWeight: 600 }}>
                            › Show transactions
                          </Link>
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

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'new' ? 'Add a budget' : `Edit ${modal?.name || ''}`}
      >
        {modal && (
          <BudgetForm
            initial={modal === 'new' ? null : modal}
            onSaved={(l) => saved(l, modal === 'new' ? 'Budget saved' : 'Budget updated')}
          />
        )}
      </Modal>
    </>
  );
}

const firstOfMonth = () => `${todayISO().slice(0, 7)}-01`;

function BudgetForm({ initial, onSaved }) {
  const { fmt, fmtShort } = useApp();
  const [category, setCategory] = useState(initial?.category || 'Food');
  const [name, setName] = useState(initial?.name || '');
  const [limit, setLimit] = useState(initial ? String(initial.limit_amount) : '');
  const [thr, setThr] = useState(initial?.alert_threshold || 80);
  const [period, setPeriod] = useState(initial?.period || 'month');
  const [start, setStart] = useState(initial?.start_date || '');
  const [end, setEnd] = useState(initial?.end_date || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const lim = parseFloat(String(limit).replace(',', '.')) || 0;

  function pickPeriod(p) {
    setPeriod(p);
    if (p === 'quarter' && !start) setStart(firstOfMonth());
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!lim) return setErr('Enter a limit above zero.');
    if (period === 'custom') {
      if (!start || !end) return setErr('Pick a start date and an end date.');
      if (end <= start) return setErr('The end date must be after the start date.');
    }
    if (period === 'quarter' && !start) return setErr('Pick the day the first 3 months start.');
    setBusy(true);
    const body = {
      category,
      name: name.trim() || category,
      limit_amount: lim,
      alert_threshold: thr,
      period,
      start_date: period === 'custom' || period === 'quarter' ? start : null,
      end_date: period === 'custom' ? end : null,
    };
    try {
      onSaved(initial ? await api.patch(`/budgets/${initial.id}`, body) : await api.post('/budgets', body));
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="modal-body" noValidate>
      <div>
        <label className="lbl" htmlFor="bf-c">
          Category
        </label>
        <select className="inp" id="bf-c" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="lbl" htmlFor="bf-i">
          Item
        </label>
        <input
          className="inp"
          id="bf-i"
          placeholder={`e.g. ${category === 'Coffee' ? 'Bubble tea' : category}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="lbl" htmlFor="bf-l">
          Limit
        </label>
        <input
          className="inp"
          id="bf-l"
          inputMode="decimal"
          placeholder={fmt(40)}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </div>
      <div>
        <span className="lbl" id="bf-p">
          Period
        </span>
        <div className="period-opts" role="radiogroup" aria-labelledby="bf-p">
          {PERIODS.map((p) => (
            <button
              type="button"
              key={p.value}
              role="radio"
              aria-checked={period === p.value}
              className={`opt ${period === p.value ? 'on' : ''}`}
              onClick={() => pickPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {period === 'custom' && (
        <div className="row-wrap" style={{ gap: 10 }}>
          <div style={{ flex: '1 1 150px' }}>
            <label className="lbl" htmlFor="bf-s">
              Start date
            </label>
            <input className="inp" id="bf-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label className="lbl" htmlFor="bf-e">
              End date
            </label>
            <input
              className="inp"
              id="bf-e"
              type="date"
              min={start || undefined}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
      )}
      {period === 'quarter' && (
        <div>
          <label className="lbl" htmlFor="bf-q">
            First 3 months start on
          </label>
          <input className="inp" id="bf-q" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      )}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label className="lbl" htmlFor="bf-t">
            Alert threshold
          </label>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#8A6406' }}>{thr}%</span>
        </div>
        <input
          id="bf-t"
          className="range"
          type="range"
          min="50"
          max="100"
          step="5"
          value={thr}
          onChange={(e) => setThr(Number(e.target.value))}
        />
        <div className="bar" style={{ marginTop: 10 }}>
          <div className="fill live" style={{ width: `${thr}%`, opacity: 0.5 }} />
          <span className="thr" style={{ left: `${thr}%`, transition: 'left .3s var(--ease)' }} />
        </div>
        <div className="small-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          {lim
            ? `Alert once you spend ${fmtShort(Math.round(lim * thr) / 100)} of ${fmtShort(lim)}`
            : "Pick a limit to see when we'll nudge you"}
        </div>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn full" disabled={busy}>
        {busy ? <span className="spin" /> : 'Save budget'}
      </button>
    </form>
  );
}
