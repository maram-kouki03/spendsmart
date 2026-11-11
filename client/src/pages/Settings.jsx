import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { I } from '../lib/icons.js';
import { initials } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { ErrorNote, Icon, Modal, Seg, Switch } from '../components/ui.jsx';

const NOTE = { TND: 'Amounts will show in Tunisian dinar (TND).', EUR: 'Amounts will show in euro (€).', USD: 'Amounts will show in US dollars ($).' };
const TOGGLES = [['notify_budget', 'Budget alerts', 'When spending passes a budget’s alert threshold'], ['notify_split', 'Split requests', 'When someone asks you to share a cost'], ['notify_subs', 'Subscription reminders', '3 days before each renewal']];
const BG = { g1: 'linear-gradient(135deg,#FDEEB2,#FBE38E 50%,#F2D06B)', g2: 'linear-gradient(135deg,#6B5A33,#3B2F12)', g3: 'linear-gradient(135deg,#FFFBEF,#FFF0B3)', g4: 'linear-gradient(135deg,#FFF0B3,#F2D06B)' };

export default function Settings() {
  const { profile, sources, refresh, toast } = useApp();
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function patch(body) {
    try { await api.patch('/me', body); await refresh(); }
    catch (e) { toast(e.message, 'err'); }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await api.get('/export.csv', { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `spendsmart-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.message, 'err'); } finally { setExporting(false); }
  }

  async function logout() { await signOut(); nav('/login', { replace: true }); }

  const name = profile?.full_name || '';
  return (
    <>
      <Topbar heading="Settings" sub="Your profile, money sources and preferences." tagline="Make it yours!" />
      <div className="stg col" style={{ gap: 20, maxWidth: 900 }}>
        <section className="card sc" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="gold profile-av">{initials(name, user?.email)}</span>
          <div style={{ flex: '1 1 200px' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{name || 'Add your name'}</div><div style={{ fontSize: 14, color: '#6B5A33' }}>{user?.email}</div></div>
          <button className="btn-o" onClick={() => setEditing(true)}><Icon d={I.edit} size={18} />Edit profile</button>
        </section>

        <section className="card sc">
          <h2 className="h2">Currency</h2>
          <Seg role="radiogroup" label="Currency" style={{ maxWidth: 420 }} value={profile?.currency || 'TND'} onChange={(c) => patch({ currency: c })}
            options={['TND', 'EUR', 'USD'].map((c) => ({ value: c, label: c }))} />
          <span className="small-muted">{NOTE[profile?.currency || 'TND']}</span>
        </section>

        <SourcesSection sources={sources} onChange={refresh} />

        <section className="card sc">
          <h2 className="h2">Notifications</h2>
          <div>
            {TOGGLES.map(([k, l, d]) => (
              <div key={k} className="tg">
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14.5 }}>{l}</div><div style={{ fontSize: 12.5, color: '#6B5A33' }}>{d}</div></div>
                <Switch on={profile ? profile[k] : true} label={l} onChange={(v) => patch({ [k]: v })} />
              </div>
            ))}
          </div>
        </section>

        <section className="card sc" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 240px' }}><div style={{ fontWeight: 600 }}>Your data</div><div style={{ fontSize: 13, color: '#6B5A33' }}>Download every transaction, budget and goal as a CSV file.</div></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-o" onClick={exportCsv} disabled={exporting}>{exporting ? <span className="spin" /> : <Icon d={I.download} size={18} />}Export my data</button>
            <button className="btn-o" style={{ color: '#B91C1C', borderColor: '#FECACA' }} onClick={logout}><Icon d={I.logout} size={18} />Log out</button>
          </div>
        </section>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit profile">
        <ProfileForm initial={name} onSave={async (n) => { await patch({ full_name: n }); setEditing(false); toast('Profile saved'); }} />
      </Modal>
    </>
  );
}

function ProfileForm({ initial, onSave }) {
  const [n, setN] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim()); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><label className="lbl" htmlFor="fn">Full name</label><input className="inp" id="fn" autoComplete="name" value={n} onChange={(e) => setN(e.target.value)} /></div>
      <button className="btn full">Save</button>
    </form>
  );
}

function SourcesSection({ sources, onChange }) {
  const { toast } = useApp();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => { setRows(sources.map((s) => ({ ...s, _name: s.name, _start: String(s.starting_balance), _last4: s.last4 || '' }))); }, [sources]);

  const dirty = (r) => r._name !== r.name || Number(r._start) !== r.starting_balance || (r._last4 || null) !== (r.last4 || null);
  const set = (id, k, v) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  async function save(r) {
    setErr('');
    try {
      await api.patch(`/sources/${r.id}`, { name: r._name.trim(), starting_balance: Number(String(r._start).replace(',', '.')) || 0, last4: r._last4 || null });
      toast(`${r._name} saved`); onChange();
    } catch (e) { setErr(e.message); }
  }
  async function del(r) {
    if (!window.confirm(`Delete ${r.name}? Its transactions are deleted too.`)) return;
    try { await api.del(`/sources/${r.id}`); toast(`${r.name} deleted`); onChange(); } catch (e) { setErr(e.message); }
  }
  async function add() {
    try { await api.post('/sources', { name: 'New wallet', kind: 'cash', starting_balance: 0 }); onChange(); } catch (e) { setErr(e.message); }
  }

  return (
    <section className="card sc">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><h2 className="h2">My cards &amp; wallets</h2><button className="btn" onClick={add} style={{ height: 44, padding: '0 18px' }}><Icon d={I.plus} size={18} />Add a source</button></div>
      <div className="stg">
        {rows.map((r) => (
          <form key={r.id} className="srow" onSubmit={(e) => { e.preventDefault(); save(r); }}>
            <span className="minicard" style={{ background: BG[r.style] || BG.g1 }} />
            <label className="src-field" style={{ flex: '1 1 180px' }}>Name<input className="inp" value={r._name} onChange={(e) => set(r.id, '_name', e.target.value)} style={{ height: 44 }} /></label>
            <label className="src-field" style={{ flex: '0 1 160px' }}>Starting balance<input className="inp" inputMode="decimal" value={r._start} onChange={(e) => set(r.id, '_start', e.target.value)} style={{ height: 44 }} /></label>
            {r.kind !== 'cash' && <label className="src-field" style={{ flex: '0 1 90px' }}>Last 4<input className="inp" inputMode="numeric" maxLength={4} value={r._last4} onChange={(e) => set(r.id, '_last4', e.target.value.replace(/\D/g, ''))} style={{ height: 44 }} /></label>}
            <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
              <button className="ib2" style={{ width: 40, height: 40, ...(dirty(r) ? { background: 'var(--goldbg)', color: '#3B2F12' } : {}) }} aria-label={`Save ${r.name}`} disabled={!dirty(r)}><Icon d={dirty(r) ? I.check : I.edit} size={18} /></button>
              <button type="button" className="ib2 del" style={{ width: 40, height: 40 }} aria-label={`Delete ${r.name}`} onClick={() => del(r)}><Icon d={I.trash} size={18} /></button>
            </div>
          </form>
        ))}
      </div>
      <ErrorNote>{err}</ErrorNote>
    </section>
  );
}
