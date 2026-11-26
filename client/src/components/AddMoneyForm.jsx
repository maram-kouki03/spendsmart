import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { ErrorNote, Num } from './ui.jsx';

const QUICK = [20, 50, 100];
const toAmount = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/**
 * "How much, from which card": quick amounts 20 / 50 / 100 or a custom one, and the user's cards
 * with their balances. `onSubmit(amount, source)` saves (throw to show an error); the modal
 * around it closes on success.
 */
export default function AddMoneyForm({ name, onSubmit }) {
  const { sources, fmtShort } = useApp();
  const [pick, setPick] = useState(1); // index in QUICK, or 'other'
  const [custom, setCustom] = useState('');
  const [srcId, setSrcId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const customRef = useRef(null);
  // Choosing "Other" shows the amount field: move the focus into it.
  useEffect(() => {
    if (pick === 'other') customRef.current?.focus();
  }, [pick]);
  const src = sources.find((s) => s.id === srcId) || sources[0];
  const amount = pick === 'other' ? toAmount(custom) : QUICK[pick];

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!amount) return setErr('Enter an amount above zero.');
    if (!src) return setErr('Add a card or wallet in Settings first.');
    if (amount > src.balance) return setErr(`Not enough in ${src.name} for that.`);
    setBusy(true);
    try {
      await onSubmit(amount, src);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="modal-body" noValidate>
      <div>
        <span className="lbl" id="am-amt">
          Amount
        </span>
        <div className="am-quick" role="radiogroup" aria-labelledby="am-amt">
          {QUICK.map((v, k) => (
            <button
              type="button"
              key={v}
              role="radio"
              aria-checked={pick === k}
              className={`opt ${pick === k ? 'on' : ''}`}
              onClick={() => setPick(k)}
            >
              {fmtShort(v)}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={pick === 'other'}
            className={`opt ${pick === 'other' ? 'on' : ''}`}
            onClick={() => setPick('other')}
          >
            Other
          </button>
        </div>
        {pick === 'other' && (
          <input
            className="inp"
            style={{ marginTop: 8 }}
            inputMode="decimal"
            aria-label="Custom amount"
            placeholder="Amount"
            ref={customRef}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        )}
      </div>
      <div>
        <span className="lbl" id="am-src">
          Take it from
        </span>
        <div className="row-wrap" style={{ gap: 8 }} role="radiogroup" aria-labelledby="am-src">
          {sources.map((s) => (
            <button
              type="button"
              key={s.id}
              role="radio"
              aria-checked={s.id === src?.id}
              className={`mini-src ${s.id === src?.id ? 'on' : ''}`}
              onClick={() => setSrcId(s.id)}
            >
              <span style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                <Num value={s.balance} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn full" disabled={busy || !amount}>
        {busy ? <span className="spin" /> : `Add ${amount ? fmtShort(amount) : ''} to ${name}`}
      </button>
    </form>
  );
}
