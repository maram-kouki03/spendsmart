import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { CATEGORIES, I, avatarFor } from '../lib/icons.js';
import { timeAgo } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import { Avatar, Coin, ErrorNote, Icon, Modal, Num, Seg, SkeletonRows } from '../components/ui.jsx';

const SPLITS = [{ value: 50, label: '50 / 50' }, { value: 60, label: '60 / 40' }, { value: 70, label: '70 / 30' }];

export default function Shared() {
  const { fmt, fmtShort, sources, refresh, toast } = useApp();
  const { data, loading, error, reload } = useApi('/shared');
  const invites = useApi('/invites');
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [inviteTo, setInviteTo] = useState(null); // a group to invite more people to
  const [newBudget, setNewBudget] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, text, action, run }

  const entries = data ? [...data.people, ...data.groups] : [];
  const cur = entries.find((e) => `${e.kind}:${e.id}` === sel) || entries[0];
  const after = () => { reload(); invites.reload(); refresh(); };
  // An invitation or request answered from the notification bell.
  useEffect(() => {
    const on = () => { reload(); invites.reload(); };
    window.addEventListener('spendsmart:shared-changed', on);
    return () => window.removeEventListener('spendsmart:shared-changed', on);
  }, [reload, invites.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = (title, text, action, fn, okMsg) => setConfirm({ title, text, action, run: async () => {
    try { await fn(); toast(okMsg); setConfirm(null); setSel(null); after(); } catch (e) { toast(e.message, 'err'); }
  } });
  const removeContact = (p) => ask(`Remove ${p.name}?`,
    `You'll stop seeing each other in Shared expenses, pending requests between you are cancelled and your shared budgets are hidden. Past splits stay in your history.`,
    'Remove', () => api.del(`/contacts/${p.id}`), `${p.name.split(' ')[0]} removed`);
  const leaveGroup = (g) => ask(`Leave ${g.name}?`,
    `Your pending requests in this group are cancelled and the group stops seeing your shared-budget spending.${g.owner ? ' Ownership passes to the next member.' : ''}`,
    'Leave group', () => api.post(`/groups/${g.id}/leave`), `You left ${g.name}`);
  const removeMember = (g, m) => ask(`Remove ${m.name} from ${g.name}?`, 'Their pending requests in this group are cancelled.',
    'Remove', () => api.del(`/groups/${g.id}/members/${m.user_id}`), `${m.name.split(' ')[0]} removed`);
  async function cancelGroupInvite(g, x) {
    try { await api.del(`/groups/${g.id}/invites?email=${encodeURIComponent(x.email)}`); toast('Invitation cancelled'); reload(); }
    catch (e) { toast(e.message, 'err'); }
  }

  async function settle() {
    const src = sources[0];
    if (!src) return toast('Add a card or wallet first', 'err');
    try {
      const r = await api.post('/settle', { user_id: cur.user_id, source_id: src.id });
      toast(r.settled ? `Settled ${r.settled} request${r.settled === 1 ? '' : 's'} from ${src.name}` : 'Nothing to settle');
      after();
    } catch (e) { toast(e.message, 'err'); }
  }

  let balance = '', balColor = '#3B2F12', role = '';
  if (cur?.kind === 'person') {
    role = cur.relation;
    const net = cur.theyOwe - cur.iOwe;
    if (cur.iOwe > 0 && cur.theyOwe > 0) balance = `You owe ${cur.name} ${fmtShort(cur.iOwe)} · they owe you ${fmtShort(cur.theyOwe)}`;
    else if (net < 0) { balance = `You owe ${cur.name} ${fmtShort(-net)}`; balColor = '#991B1B'; }
    else if (net > 0) { balance = `${cur.name} owes you ${fmtShort(net)}`; balColor = '#14532D'; }
    else balance = `You and ${cur.name} are settled up`;
  } else if (cur?.kind === 'group') {
    const others = cur.members.filter((m) => m.name !== 'You').map((m) => m.name.split(' ')[0]);
    role = `Group · ${others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others.at(-1)}` : others[0] || 'just you'}${others.length ? ' and you' : ''}`
      + (cur.invited.length ? ` · ${cur.invited.length} invited` : '');
    balance = cur.pending ? `${cur.pending.title} pending — ${fmtShort(cur.pending.share)} each`
      : others.length ? 'Nothing shared yet' : 'Waiting for people to accept';
  }

  return (
    <>
      <Topbar heading="Shared expenses" sub="Split costs with roommates, your partner and friends." tagline="Split it, don't sweat it!" />
      <ErrorNote>{error}</ErrorNote>
      <div className="enter split-layout">
        <div className="split-main" style={{ gap: 22 }}>
          <div className="card people-strip">
            {entries.map((p) => {
              const on = cur && p.kind === cur.kind && p.id === cur.id;
              const [bg, fg] = avatarFor(p.user_id || p.id);
              return (
                <button key={`${p.kind}:${p.id}`} className={`person ${on ? 'on' : ''}`} onClick={() => setSel(`${p.kind}:${p.id}`)} aria-pressed={on}>
                  {p.kind === 'person'
                    ? <span className="av" style={{ background: bg, color: fg }}>{p.initials}</span>
                    : <span className="av" style={{ background: '#FFFBEF' }}>
                        {p.members.slice(0, 3).map((m, k) => {
                          const [mb] = avatarFor(m.user_id);
                          return <span key={m.user_id} className="mini-av" style={{ background: m.name === 'You' ? '#FFF0B3' : mb, ...[{ left: 2, top: 6 }, { left: 25, top: 2 }, { left: 14, top: 27 }][k] }}>{m.initials}</span>;
                        })}
                      </span>}
                  <span className="person-name">{p.kind === 'person' ? p.name.split(' ')[0] : p.name}</span>
                </button>
              );
            })}
            <button className="person" aria-label="Invite a person or group" onClick={() => setAdding(true)}>
              <span className="av" style={{ background: 'transparent', border: '2px dashed #F2D06B', boxShadow: 'none', color: '#8A6406' }}><Icon d={I.plus} /></span>Invite
            </button>
          </div>

          {loading && !data && <SkeletonRows n={2} />}
          {data && !cur && (
            <div className="card empty-card">
              <b style={{ color: '#3B2F12' }}>Share your first bill</b>
              Invite a roommate, partner or friend by email — or start a group for the apartment. Once they accept, you can split costs and share budgets.
              <button className="btn" onClick={() => setAdding(true)}><Icon d={I.plus} />Invite a person or group</button>
            </div>
          )}

          {cur && (
            <>
              <div className="gold sheen balance-card">
                <div style={{ flex: '1 1 240px' }}>
                  <div style={{ fontSize: 13, color: '#57400A' }}>{role}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: balColor }}>{balance}</div>
                </div>
                {cur.kind === 'person' && cur.iOwe > 0 && <button className="settle-btn" onClick={settle}>Settle up</button>}
              </div>

              {cur.kind === 'group' ? (
                <div className="card member-list">
                  {cur.members.map((m) => (
                    <span key={m.user_id} className="member-chip">
                      {m.name}{m.owner && <span className="small-muted"> · owner</span>}
                      {cur.owner && m.name !== 'You' && <button className="chip-x" aria-label={`Remove ${m.name}`} onClick={() => removeMember(cur, m)}>×</button>}
                    </span>
                  ))}
                  {cur.invited.map((x) => (
                    <span key={x.email} className="member-chip invited">
                      {x.email} <span className="st pend">Invited</span>
                      {x.canCancel && <button className="chip-x" aria-label={`Cancel the invitation to ${x.email}`} onClick={() => cancelGroupInvite(cur, x)}>×</button>}
                    </span>
                  ))}
                  <span className="member-actions">
                    {cur.owner && <button className="link-btn" onClick={() => setInviteTo(cur)}>+ Invite</button>}
                    <button className="link-btn danger-link" onClick={() => leaveGroup(cur)}>Leave group</button>
                  </span>
                </div>
              ) : (
                <div className="member-actions" style={{ marginTop: -10 }}>
                  <button className="link-btn danger-link" onClick={() => removeContact(cur)}>Remove {cur.name.split(' ')[0]}</button>
                </div>
              )}

              <div className="row-wrap" style={{ gap: 18, alignItems: 'flex-start' }}>
                <SplitForm key={`${cur.kind}:${cur.id}`} target={cur} onSent={after} />
                <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
                    <h2 className="h2">Shared budgets</h2>
                    <button className="link-btn" onClick={() => setNewBudget(true)}>+ New shared budget</button>
                  </div>
                  <span className="small-muted" style={{ fontSize: 12, marginTop: -6 }}>each sets their own limit</span>
                  {cur.budgets.map((b) => <SharedBudget key={b.id} b={b} onChange={after} />)}
                  {cur.budgets.length === 0 && <div className="card" style={{ padding: 18, fontSize: 13, color: '#6B5A33' }}>No shared budgets yet.</div>}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="split-aside" style={{ gap: 10 }}>
          <PendingInvites data={invites.data} onDone={after} />
          <span className="req-head"><span className="req-pill">For you</span>Requests waiting on you</span>
          {data && data.incoming.length === 0 && <div className="card" style={{ padding: 18, fontSize: 13, color: '#6B5A33' }}>No split requests right now. When someone shares a cost with you, it shows up here.</div>}
          {data?.incoming.map((r, k) => <IncomingRequest key={r.id} r={r} delay={k * 0.08} onDone={after} />)}
          {data?.outgoing.length > 0 && (
            <>
              <span className="req-head" style={{ marginTop: 10 }}>Sent by you</span>
              <div className="card" style={{ overflow: 'hidden' }}>
                {data.outgoing.slice(0, 6).map((r) => (
                  <div key={r.id} className="tx-row" style={{ padding: '12px 16px', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{r.title} · {r.to.name.split(' ')[0]}</div><div style={{ fontSize: 12, color: '#6B5A33' }}>their share {fmt(r.share)} · {timeAgo(r.created_at)}</div></div>
                    <span className={`st ${r.status === 'accepted' ? 'ok' : r.status === 'declined' || r.status === 'cancelled' ? 'no' : 'pend'}`}>{r.status[0].toUpperCase() + r.status.slice(1)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <AddPeopleModal open={adding} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); after(); }} />
      <AddPeopleModal open={!!inviteTo} group={inviteTo} onClose={() => setInviteTo(null)} onAdded={() => { setInviteTo(null); reload(); }} />
      <SharedBudgetModal open={newBudget} target={cur} onClose={() => setNewBudget(false)} onSaved={() => { setNewBudget(false); reload(); }} />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title || ''}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#57400A' }}>{confirm?.text}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-o" style={{ flex: 1, height: 46 }} onClick={() => setConfirm(null)}>Keep</button>
          <button className="btn" style={{ flex: 1, height: 46 }} onClick={() => confirm?.run()}>{confirm?.action}</button>
        </div>
      </Modal>
    </>
  );
}

/** Invitations waiting on me (Accept / Decline) and the ones I sent (Cancel). */
function PendingInvites({ data, onDone }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(null);
  if (!data || (!data.incoming.length && !data.outgoing.length)) return null;
  async function act(key, fn, msg) {
    setBusy(key);
    try { await fn(); toast(msg); onDone(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(null); }
  }
  const answer = (i, ok) => act(`${i.kind}:${i.id}`,
    () => api.post(i.kind === 'group' ? `/groups/${i.id}/${ok ? 'accept' : 'decline'}` : `/invites/${i.id}/${ok ? 'accept' : 'decline'}`),
    ok ? (i.kind === 'group' ? `You joined ${i.group.name}` : `You and ${i.from.name.split(' ')[0]} are connected`) : 'Invitation declined');

  return (
    <>
      <span className="req-head"><span className="req-pill">Invites</span>Pending invitations</span>
      <div className="card" style={{ overflow: 'hidden' }}>
        {data.incoming.map((i) => {
          const [bg, fg] = avatarFor(i.from.email || i.id);
          return (
            <div key={`${i.kind}:${i.id}`} className="tx-row invite-row">
              <Avatar initials={i.from.initials} bg={bg} fg={fg} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {i.kind === 'group' ? <>{i.from.name} invited you to <b>{i.group.name}</b></> : <>{i.from.name} wants to share expenses</>}
                </div>
                <div style={{ fontSize: 12, color: '#6B5A33', overflowWrap: 'anywhere' }}>
                  {i.kind === 'group' ? `${i.group.members} member${i.group.members === 1 ? '' : 's'}` : i.from.email} · {timeAgo(i.created_at)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn sm" disabled={busy === `${i.kind}:${i.id}`} onClick={() => answer(i, true)}>Accept</button>
                  <button className="btn-o sm" disabled={busy === `${i.kind}:${i.id}`} onClick={() => answer(i, false)}>Decline</button>
                </div>
              </div>
            </div>
          );
        })}
        {data.outgoing.map((i) => (
          <div key={i.id} className="tx-row invite-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{i.email}</div>
              <div style={{ fontSize: 12, color: '#6B5A33' }}>Sent · {i.relation} · {timeAgo(i.created_at)}</div>
            </div>
            <button className="btn-o sm" disabled={busy === i.id} onClick={() => act(i.id, () => api.del(`/invites/${i.id}`), 'Invitation cancelled')}>Cancel</button>
          </div>
        ))}
      </div>
    </>
  );
}

function SplitForm({ target, onSent }) {
  const { sources, fmt, toast } = useApp();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('Groceries');
  const [srcId, setSrcId] = useState('');
  const [pct, setPct] = useState(50);
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = parseFloat(String(amount).replace(',', '.')) || 0;
  const isGroup = target.kind === 'group';
  const n = isGroup ? target.members.length : 2;
  const mine = isGroup ? amt / n : (amt * pct) / 100;
  const theirs = isGroup ? amt / n : amt - mine;
  const short = isGroup ? target.name : target.name.split(' ')[0];
  const src = sources.find((s) => s.id === srcId) || sources[0];

  async function send(e) {
    e.preventDefault(); setErr('');
    if (!title.trim()) return setErr('What did you buy?');
    if (!amt) return setErr('Enter the total amount.');
    if (!src) return setErr('Add a card or wallet first.');
    setBusy(true);
    try {
      const t = isGroup ? { type: 'group', group_id: target.id } : { type: 'person', user_id: target.user_id };
      const r = await api.post('/splits', { target: t, title: title.trim(), category: cat, amount: amt, my_pct: pct, source_id: src.id });
      setSent({ title: title.trim(), total: amt, share: r.share });
      setTitle(''); setAmount('');
      toast('Split request sent');
      onSent();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <form className="card" style={{ flex: '1 1 300px', minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={send}>
      <span style={{ fontWeight: 600, fontSize: 15 }}>New split with {short}</span>
      <div><label className="lbl" htmlFor="w">What did you buy?</label><input className="inp" id="w" placeholder="Groceries" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="row-wrap" style={{ gap: 10 }}>
        <div style={{ flex: '1 1 110px' }}><label className="lbl" htmlFor="a">Amount</label><input className="inp" id="a" inputMode="decimal" placeholder={fmt(60)} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div style={{ flex: '1 1 150px' }}><label className="lbl" htmlFor="pf">Paid from</label>
          <select className="inp" id="pf" value={src?.id || ''} onChange={(e) => setSrcId(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
      </div>
      <div><label className="lbl" htmlFor="sc">Category</label>
        <select className="inp" id="sc" value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div>
        <span className="lbl">Split</span>
        {isGroup
          ? <div className="seg" style={{ padding: '10px 14px', fontSize: 14, color: '#57400A', fontWeight: 600 }}>Equal · {n} people</div>
          : <Seg role="radiogroup" label="Split" value={pct} onChange={setPct} options={SPLITS} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: '#6B5A33' }}>
          <span>You <b style={{ color: '#3B2F12' }}>{fmt(mine)}</b></span><span>{isGroup ? 'Each other member' : short} <b style={{ color: '#3B2F12' }}>{fmt(theirs)}</b></span>
        </div>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn full" disabled={busy}>{busy ? <span className="spin" /> : <><Icon d={I.send} size={18} />Send split request</>}</button>
      {sent && (
        <div className="msgin sent-bubble">
          Sent to {short}: <b>{sent.title} – {fmt(sent.total)}</b>, {isGroup ? 'each share' : 'their share'} {fmt(sent.share)}
          <div style={{ marginTop: 6 }}><span className="st pend">Pending</span></div>
        </div>
      )}
    </form>
  );
}

function IncomingRequest({ r, delay, onDone }) {
  const { sources, fmt, toast } = useApp();
  const [srcId, setSrcId] = useState('');
  const [state, setState] = useState('pending');
  const [flying, setFlying] = useState(false);
  const [bal, setBal] = useState(null);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  const src = sources.find((s) => s.id === srcId) || sources[0];
  const [bg, fg] = avatarFor(r.from.id);

  async function accept() {
    try {
      const res = await api.post(`/splits/${r.id}/accept`, { source_id: src.id });
      setBal(res.after); setState('accepted'); setFlying(true);
      t.current = setTimeout(() => { setFlying(false); onDone(); }, 1600);
    } catch (e) { toast(e.message, 'err'); }
  }
  async function decline() {
    try { await api.post(`/splits/${r.id}/decline`); setState('declined'); t.current = setTimeout(onDone, 1600); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card msgin req-card" style={{ animationDelay: `${0.4 + delay}s` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar initials={r.from.initials} bg={bg} fg={fg} size={46} />
        <div><div style={{ fontSize: 12, color: '#6B5A33' }}>Split request · {timeAgo(r.created_at)}</div><div style={{ fontWeight: 600, fontSize: 14 }}>From {r.from.name}</div></div>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{r.from.name.split(' ')[0]} added <b>{r.title} – {fmt(r.total)}</b>. Deduct your share (<b style={{ color: '#8A6406' }}>{fmt(r.share)}</b>) from your balance?</p>
      {src && (
        <div className="req-src">
          {state === 'pending' && sources.length > 1
            ? <select aria-label="Pay from" value={src.id} onChange={(e) => setSrcId(e.target.value)} className="req-sel">{sources.map((s) => <option key={s.id} value={s.id}>Your {s.name}</option>)}</select>
            : <span style={{ color: '#6B5A33' }}>Your {src.name}</span>}
          <b style={{ fontSize: 16 }}><Num value={bal ?? src.balance} from={src.balance} duration={800} /></b>
          {flying && <span className="flyc" style={{ right: 30, top: -70, '--fx': '0px', '--fy': '64px' }}><Coin size={28} style={{ fontSize: 12 }} /></span>}
        </div>
      )}
      {state === 'pending' && <div style={{ display: 'flex', gap: 10 }}><button className="btn-o" onClick={decline} style={{ flex: 1, height: 46 }}>Decline</button><button className="btn" onClick={accept} style={{ flex: 1, height: 46 }}>Accept</button></div>}
      {state === 'accepted' && (
        <div className="pop accepted">
          <svg viewBox="0 0 24 24" style={{ width: 26, height: 26, flex: 'none' }} aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#15803D" /><path className="draw" d="m7 12.5 3.5 3.5L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Accepted · {fmt(r.share)} deducted
        </div>
      )}
      {state === 'declined' && <span className="st no pop" style={{ alignSelf: 'flex-start' }}>Declined · {r.from.name.split(' ')[0]} will be notified</span>}
    </div>
  );
}

function SharedBudget({ b, onChange }) {
  const { fmtShort, toast } = useApp();
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState('');
  async function save(e) {
    e.preventDefault();
    const v = parseFloat(String(val).replace(',', '.'));
    if (!v) return;
    try { await api.put(`/shared-budgets/${b.id}/limit`, { monthly_limit: v }); setEdit(false); onChange(); }
    catch (e2) { toast(e2.message, 'err'); }
  }
  return (
    <div className="stg col" style={{ gap: 6 }}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{b.name} <span style={{ fontWeight: 400, color: '#6B5A33', fontSize: 12 }}>· {b.category}</span></span>
      <div className="row-wrap" style={{ gap: 10 }}>
        {b.rows.map((row) => {
          if (row.waiting) {
            return (
              <div key={row.user_id} className="card mt waiting">
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{row.name.split(' ')[0]}</div>
                <span style={{ fontSize: 12.5, color: '#6B5A33' }}>Waiting for {row.name.split(' ')[0]} to join — their spending shows once they set their own limit.</span>
              </div>
            );
          }
          const p = row.limit ? Math.round((row.spent / row.limit) * 100) : 0;
          return (
            <div key={row.user_id} className="card mt">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600 }}><span>{row.isMe ? 'Me' : row.name.split(' ')[0]}</span><span style={{ color: row.isMe ? '#8A6406' : '#57400A' }}>{row.limit ? `${p}%` : '—'}</span></div>
              <div className="bar"><div className={`fill ${row.isMe ? '' : 'cocoa'} ${p > 100 ? 'over' : ''}`} style={{ width: `${Math.min(p, 100)}%` }} /></div>
              {row.isMe && edit ? (
                <form onSubmit={save} style={{ display: 'flex', gap: 6 }}>
                  <input className="inp" style={{ height: 34, fontSize: 13 }} aria-label="My monthly limit" inputMode="decimal" autoFocus value={val} onChange={(e) => setVal(e.target.value)} />
                  <button className="btn sm">Save</button>
                </form>
              ) : (
                <span style={{ fontSize: 12.5, color: '#6B5A33' }}>
                  <b style={{ color: '#3B2F12' }}>{fmtShort(row.spent)}</b> / {row.limit ? fmtShort(row.limit) : 'no limit'}
                  {row.isMe && <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => { setVal(row.limit || ''); setEdit(true); }}>{row.limit ? 'Edit' : 'Set my limit'}</button>}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddPeopleModal({ open, onClose, onAdded, group = null }) {
  const { toast } = useApp();
  const [pick, setTab] = useState('person');
  const tab = group ? 'group' : pick; // inviting more people to an existing group
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('Roommate');
  const [gname, setGname] = useState('');
  const [emails, setEmails] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const list = emails.split(/[\s,;]+/).filter(Boolean);
      const r = tab === 'person' ? await api.post('/contacts', { email: email.trim(), relation })
        : group ? await api.post(`/groups/${group.id}/invite`, { emails: list })
          : await api.post('/groups', { name: gname.trim(), emails: list });
      toast(r?.message || 'Invitation sent');
      setEmail(''); setGname(''); setEmails('');
      onAdded();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={group ? `Invite people to ${group.name}` : 'Invite a person or group'}>
      {!group && <Seg label="Type" value={tab} onChange={setTab} options={[{ value: 'person', label: 'Person' }, { value: 'group', label: 'Group' }]} />}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'person' ? (
          <>
            <div><label className="lbl" htmlFor="pe">Their email</label><input className="inp" id="pe" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@email.com" /></div>
            <div><label className="lbl" htmlFor="pr">They are your…</label>
              <select className="inp" id="pr" value={relation} onChange={(e) => setRelation(e.target.value)}>{['Roommate', 'Partner', 'Friend', 'Family', 'Colleague'].map((r) => <option key={r}>{r}</option>)}</select>
            </div>
          </>
        ) : (
          <>
            {!group && <div><label className="lbl" htmlFor="gn">Group name</label><input className="inp" id="gn" required value={gname} onChange={(e) => setGname(e.target.value)} placeholder="Apartment 4B" /></div>}
            <div><label className="lbl" htmlFor="ge">{group ? 'Emails' : "Members' emails"}</label><textarea className="inp" id="ge" required rows={3} style={{ height: 'auto', padding: 12 }} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="sarah@email.com, lina@email.com" /></div>
          </>
        )}
        <span className="small-muted" style={{ fontSize: 12.5 }}>They'll get an invitation and have to accept it before you can split costs or see each other's shared budgets. Up to 20 invitations a day.</span>
        <ErrorNote>{err}</ErrorNote>
        <button className="btn full" disabled={busy}>{busy ? <span className="spin" /> : tab === 'person' ? 'Send invitation' : group ? 'Send invitations' : 'Create group & invite'}</button>
      </form>
    </Modal>
  );
}

function SharedBudgetModal({ open, target, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('Groceries');
  const [lim, setLim] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr('');
    const v = parseFloat(String(lim).replace(',', '.'));
    if (!v) return setErr('Enter your monthly limit.');
    try {
      await api.post('/shared-budgets', { name: name.trim() || cat, category: cat, my_limit: v, ...(target.kind === 'group' ? { group_id: target.id } : { partner_id: target.user_id }) });
      setName(''); setLim(''); onSaved();
    } catch (e2) { setErr(e2.message); }
  }
  if (!target) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Shared budget with ${target.name}`}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label className="lbl" htmlFor="sbn">Name</label><input className="inp" id="sbn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Household supplies" /></div>
        <div><label className="lbl" htmlFor="sbc">Tracks category</label><select className="inp" id="sbc" value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="lbl" htmlFor="sbl">My monthly limit</label><input className="inp" id="sbl" inputMode="decimal" value={lim} onChange={(e) => setLim(e.target.value)} /></div>
        <span className="small-muted" style={{ fontSize: 12.5 }}>Everyone sets their own limit. Someone's spending is only shown once they've set theirs.</span>
        <ErrorNote>{err}</ErrorNote>
        <button className="btn full">Create shared budget</button>
      </form>
    </Modal>
  );
}
