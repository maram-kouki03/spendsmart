import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { I, SUB_COLOR, SUB_ICON } from '../lib/icons.js';
import { renewText, shortDate, todayISO } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { ErrorNote, Icon, Modal, Num, SkeletonRows, Switch } from '../components/ui.jsx';

export default function Subscriptions() {
  const { fmt, refresh, toast } = useApp();
  const { data, setData, loading, error } = useApi('/subscriptions');
  const [modal, setModal] = useState(null); // null | 'new' | sub
  const subs = data || [];
  const active = subs.filter((s) => s.active);
  const total = Math.round(active.reduce((a, s) => a + s.price, 0) * 100) / 100;
  const next = active.slice().sort((a, b) => a.days - b.days)[0];

  async function toggle(s) {
    setData(subs.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
    try { setData(await api.patch(`/subscriptions/${s.id}`, { active: !s.active })); refresh(); }
    catch (e) { toast(e.message, 'err'); setData(subs); }
  }

  return (
    <>
      <Topbar heading="Subscription tracker" sub="All your recurring payments in one place." tagline="Never miss a renewal!" />
      <div className="stg col" style={{ gap: 20, maxWidth: 1060 }}>
        <div className="row-wrap">
          <div className="gold sheen sub-stat" style={{ flex: '2 1 280px', borderRadius: 26, boxShadow: '0 18px 38px rgba(232,201,100,.34)' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Total per month</span>
            <span style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1 }}><Num value={total} duration={700} /></span>
            <span style={{ fontSize: 13, color: '#57400A' }}>{active.length} active · {subs.length - active.length} paused</span>
          </div>
          <div className="card sub-stat">
            <span className="small-muted">Next renewal</span>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{next ? next.name : '—'}</span>
            {next && <span className={`st ${next.days <= 3 ? 'near' : 'pend'}`} style={{ alignSelf: 'flex-start' }}>{next.days <= 7 ? renewText(next.days) : shortDate(next.next_renewal)}</span>}
          </div>
          <div className="card sub-stat">
            <span className="small-muted">Per year</span>
            <span style={{ fontSize: 22, fontWeight: 700 }}><Num value={Math.round(total * 1200) / 100} duration={700} /></span>
            <span style={{ fontSize: 12.5, color: '#6B5A33' }}>at today's prices</span>
          </div>
        </div>

        <ErrorNote>{error}</ErrorNote>
        {loading && !data && <SkeletonRows n={3} />}
        <div className="stg row-wrap" style={{ gap: 14 }}>
          {subs.map((s) => {
            const [bg, fg] = SUB_COLOR[s.color] || SUB_COLOR.cocoa;
            return (
              <div key={s.id} className={`card sub ${s.active ? '' : 'dim'}`}>
                <span className="logo" style={{ background: bg, color: fg }}><Icon d={SUB_ICON[s.icon] || SUB_ICON.play} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 16 }}>{s.name}</span>
                    {s.active && s.days <= 3 && <span className="st near">{renewText(s.days)}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#6B5A33' }}>{s.active ? `Next renewal ${shortDate(s.next_renewal)}${s.source ? ` · ${s.source.name}` : ''}` : 'Paused · no charges'}</div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{fmt(s.price)} / month</div>
                </div>
                <button className="ib2" aria-label={`Edit ${s.name}`} onClick={() => setModal(s)}><Icon d={I.edit} size={16} /></button>
                <Switch on={s.active} onChange={() => toggle(s)} label={`${s.name} active`} />
              </div>
            );
          })}
          <button className="add-dashed" onClick={() => setModal('new')}><Icon d={I.plus} />Add a subscription</button>
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Add a subscription' : `Edit ${modal?.name || ''}`}>
        {modal && <SubForm initial={modal === 'new' ? null : modal} onDone={(list, msg) => { setData(list); setModal(null); refresh(); toast(msg); }} />}
      </Modal>
    </>
  );
}

function SubForm({ initial, onDone }) {
  const { sources } = useApp();
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [date, setDate] = useState(initial?.next_renewal || todayISO());
  const [src, setSrc] = useState(initial?.source_id || sources[0]?.id || '');
  const [icon, setIcon] = useState(initial?.icon || 'play');
  const [color, setColor] = useState(initial?.color || 'cocoa');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr('');
    const p = parseFloat(String(price).replace(',', '.'));
    if (!name.trim()) return setErr('Name it — e.g. StreamBox.');
    if (!p) return setErr('Enter the monthly price.');
    setBusy(true);
    const body = { name: name.trim(), price: p, next_renewal: date, source_id: src || null, icon, color };
    try {
      const list = initial ? await api.patch(`/subscriptions/${initial.id}`, body) : await api.post('/subscriptions', body);
      onDone(list, initial ? 'Subscription updated' : 'Subscription added');
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${initial.name}?`)) return;
    await api.del(`/subscriptions/${initial.id}`);
    onDone(await api.get('/subscriptions'), 'Subscription deleted');
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><label className="lbl" htmlFor="sn">Name</label><input className="inp" id="sn" value={name} onChange={(e) => setName(e.target.value)} placeholder="StreamBox" /></div>
      <div className="row-wrap" style={{ gap: 10 }}>
        <div style={{ flex: '1 1 120px' }}><label className="lbl" htmlFor="sp">Price / month</label><input className="inp" id="sp" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12.99" /></div>
        <div style={{ flex: '1 1 150px' }}><label className="lbl" htmlFor="sd">Next renewal</label><input className="inp" id="sd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div><label className="lbl" htmlFor="ss">Charged to</label>
        <select className="inp" id="ss" value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Don't log charges</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <div><span className="lbl">Look</span>
        <div className="row-wrap" style={{ gap: 8 }}>
          {Object.keys(SUB_ICON).map((k) => (
            <button type="button" key={k} className={`look ${icon === k ? 'on' : ''}`} aria-label={`Icon ${k}`} aria-pressed={icon === k} onClick={() => setIcon(k)}
              style={{ background: SUB_COLOR[color][0], color: SUB_COLOR[color][1] }}><Icon d={SUB_ICON[k]} size={18} /></button>
          ))}
        </div>
        <div className="row-wrap" style={{ gap: 8, marginTop: 8 }}>
          {Object.entries(SUB_COLOR).map(([k, [bg]]) => (
            <button type="button" key={k} className={`swatch ${color === k ? 'on' : ''}`} aria-label={`Color ${k}`} aria-pressed={color === k} onClick={() => setColor(k)} style={{ background: bg }} />
          ))}
        </div>
      </div>
      <span className="small-muted" style={{ fontSize: 12.5 }}>We'll remind you 3 days before it renews, and log the charge on renewal day.</span>
      <ErrorNote>{err}</ErrorNote>
      <div style={{ display: 'flex', gap: 10 }}>
        {initial && <button type="button" className="btn-o" style={{ color: '#B91C1C', borderColor: '#FECACA' }} onClick={remove}><Icon d={I.trash} size={18} />Delete</button>}
        <button className="btn" style={{ flex: 1 }} disabled={busy}>{busy ? <span className="spin" /> : 'Save'}</button>
      </div>
    </form>
  );
}
