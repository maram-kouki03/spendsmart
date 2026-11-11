import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { CAT_ICON, CATEGORIES, I } from '../lib/icons.js';
import { todayISO } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import SourceCard from '../components/SourceCard.jsx';
import { ErrorNote, Icon } from '../components/ui.jsx';

export default function AddPurchase() {
  const { sources, fmt, fmtShort, refresh } = useApp();
  const nav = useNavigate();
  const { data: budgets } = useApi('/budgets');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('Food');
  const [srcId, setSrcId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const src = sources.find((s) => s.id === srcId) || sources[0];
  const amt = Math.max(0, parseFloat(String(amount).replace(',', '.')) || 0);
  const hits = (budgets || []).filter((b) => b.category === cat).map((b) => {
    const after = b.spent + amt;
    return { ...b, after, afterPct: Math.round((after / b.monthly_limit) * 100) };
  }).filter((b) => amt > 0 && b.afterPct >= b.alert_threshold);

  function pickFile(f) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|heic)$/.test(f.type)) { setErr('Receipts must be a JPG or PNG image.'); return; }
    if (f.size > 8 * 1024 * 1024) { setErr('That photo is over 8 MB.'); return; }
    setErr(''); setFile(f);
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('What did you buy?');
    if (!amt) return setErr('Enter an amount above zero.');
    if (!src) return setErr('Add a card or wallet in Settings first.');
    setBusy(true);
    try {
      const res = await api.post('/transactions', { kind: 'expense', name: name.trim(), amount: amt, category: cat, source_id: src.id, occurred_at: date, note: note.trim() || null });
      if (file) {
        const fd = new FormData(); fd.append('file', file);
        await api.post(`/transactions/${res.transaction.id}/receipt`, fd).catch(() => null);
      }
      refresh();
      nav('/add/saved', { state: res });
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <>
      <Topbar heading="Add a purchase" sub="Log it in seconds — your balance updates right away." tagline="Spend it wisely!" />
      <form className="stg col" style={{ gap: 20, maxWidth: 980 }} onSubmit={save}>
        <div className="card" style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="row-wrap">
            <div className="f" style={{ flexGrow: 2 }}><label className="lbl" htmlFor="item">Item name</label><input className="inp" id="item" placeholder="Coffee beans 500g" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="f"><label className="lbl" htmlFor="amt">Amount</label>
              <div className="inp inpw"><span style={{ fontSize: 18, fontWeight: 700 }}>{fmtShort(0).split(' ')[1]}</span><input id="amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontWeight: 700, fontSize: 20 }} /></div>
            </div>
          </div>

          <div>
            <span className="lbl" id="cat-l">Category</span>
            <div className="row-wrap" style={{ gap: 10 }} role="radiogroup" aria-labelledby="cat-l">
              {CATEGORIES.map((c) => (
                <button type="button" key={c} className={`cat-btn ${c === cat ? 'on' : ''}`} onClick={() => setCat(c)} role="radio" aria-checked={c === cat}>
                  <Icon d={CAT_ICON[c]} />{c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="lbl" id="src-l">Payment source</span>
            <div className="row-wrap" style={{ gap: 14 }} role="radiogroup" aria-labelledby="src-l">
              {sources.map((s) => {
                const on = s.id === src?.id;
                return (
                  <button type="button" key={s.id} className={`pick ${on ? 'on' : ''}`} onClick={() => setSrcId(s.id)} role="radio" aria-checked={on}>
                    <SourceCard compact source={s} value={on ? s.balance - amt : s.balance} from={s.balance} duration={700}
                      tail={<span style={{ fontSize: 12, opacity: 0.85 }}>{on && amt ? 'after this purchase' : s.last4 ? `•••• ${s.last4}` : s.kind === 'cash' ? 'Cash on hand' : 'Card'}</span>} />
                  </button>
                );
              })}
            </div>
            {src && (
              <div className="preview-line">
                <Icon d={I.arrow} size={18} style={{ color: '#8A6406' }} />{src.name}: {fmt(src.balance)} → {fmt(src.balance - amt)} after this purchase
              </div>
            )}
          </div>

          <div className="row-wrap">
            <div className="f"><label className="lbl" htmlFor="date">Date</label><input className="inp" id="date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="f" style={{ flexGrow: 2 }}><label className="lbl" htmlFor="note">Note <span style={{ fontWeight: 400, color: '#6B5A33' }}>(optional)</span></label><input className="inp" id="note" placeholder="For home brewing this month" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          <button type="button" className={`drop-zone ${drag ? 'drag' : ''}`} onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}>
            <Icon d={I.camera}><circle cx="12" cy="13" r="3.5" /></Icon>
            {file ? <>Receipt attached <span className="dz-sub">{file.name} · click to change</span></>
              : <>Add receipt photo <span className="dz-sub">Optional · drag a JPG or PNG here, or click to browse</span></>}
          </button>
        </div>

        {hits.map((b) => (
          <div key={b.id} className="toast heads-up">
            <Icon d={I.warn} style={{ color: '#B45309' }} />
            <span><b>Heads up:</b> this takes your {b.name} budget from {fmtShort(b.spent)} to {fmtShort(b.after)} of {fmtShort(b.monthly_limit)} ({b.afterPct}%) — {b.afterPct > 100 ? 'over your limit.' : `past your ${b.alert_threshold}% alert.`}</span>
          </div>
        ))}

        <ErrorNote>{err}</ErrorNote>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link className="btn-o" to="/dashboard">Cancel</Link>
          <button className="btn" type="submit" disabled={busy}>{busy ? <span className="spin" /> : 'Save purchase'}</button>
        </div>
      </form>
    </>
  );
}
