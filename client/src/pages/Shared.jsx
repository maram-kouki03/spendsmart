import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { CATEGORIES, I, avatarFor } from '../lib/icons.js';
import { monthYear, timeAgo } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';
import Topbar from '../components/Topbar.jsx';
import AddMoneyForm from '../components/AddMoneyForm.jsx';
import { Avatar, Coin, ErrorNote, Icon, Modal, Num, Seg, SkeletonRows } from '../components/ui.jsx';
import './Shared.css';

const SPLITS = [{ value: 50, label: '50 / 50' }, { value: 60, label: '60 / 40' }, { value: 70, label: '70 / 30' }];
const STATUS = { pending: ['pend', 'Pending'], accepted: ['ok', 'Accepted'], declined: ['no', 'Declined'], cancelled: ['no', 'Cancelled'] };
const first = (name = '') => name.split(' ')[0];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const toNum = (v) => parseFloat(String(v).replace(',', '.'));
const keyOf = (e) => `${e.kind}:${e.id}`;

/** True below the mobile breakpoint, where panels open as full-width modals. */
function useNarrow(query = '(max-width: 820px)') {
  const get = () => { try { return window.matchMedia(query).matches; } catch { return false; } };
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return narrow;
}

/** Escape anywhere on the page (but not inside a modal, which handles its own) runs `fn`. */
function useEscape(active, fn) {
  useEffect(() => {
    if (!active) return undefined;
    const on = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('.modal-back')) return;
      fn();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [active, fn]);
}

/**
 * Splits with one person (1:1 only) or one group, newest first. A group split I sent is stored once
 * per recipient, so those rows are folded into one entry.
 */
function splitsWith(history = [], cur) {
  if (!cur) return [];
  if (cur.kind === 'person') {
    return history.filter((s) => !s.group_id && (s.from.id === cur.user_id || s.to.id === cur.user_id))
      .map((s) => ({ ...s, fromMe: s.from.id !== cur.user_id }));
  }
  const me = cur.members.find((m) => m.name === 'You')?.user_id;
  const out = new Map();
  for (const s of history) {
    if (s.group_id !== cur.id) continue;
    const k = `${s.from.id}|${s.created_at}|${s.title}`;
    const prev = out.get(k);
    if (!prev) { out.set(k, { ...s, fromMe: s.from.id === me, statuses: [s.status] }); continue; }
    prev.statuses.push(s.status);
  }
  return [...out.values()].map((s) => {
    const st = s.statuses;
    const status = st.includes('pending') ? 'pending' : st.includes('accepted') ? 'accepted' : st[0];
    return { ...s, status };
  });
}

function StatusBadge({ status }) {
  const [cls, label] = STATUS[status] || ['pend', status];
  return <span className={`st ${cls}`}>{label}</span>;
}

function DotsIcon() {
  return <Icon><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></Icon>;
}

/** "⋯" button with a small menu. Escape or a click outside closes it; arrow keys move between items. */
function MoreMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const node = wrap.current;
    node?.querySelector('[role="menuitem"]')?.focus();
    const onDown = (e) => { if (!node?.contains(e.target)) setOpen(false); };
    // Native, so Escape closes only the menu — not a modal or panel around it.
    const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    node?.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); node?.removeEventListener('keydown', onEsc); };
  }, [open]);
  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'Tab') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = [...wrap.current.querySelectorAll('[role="menuitem"]')];
      const i = list.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next]?.focus();
    }
  };
  if (!items.length) return null;
  return (
    <div className="sh-more" ref={wrap} onKeyDown={onKey}>
      <button ref={btn} type="button" className="sh-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <DotsIcon />
      </button>
      {open && (
        <div className="sh-menu" role="menu" aria-label={label}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={`sh-menu-item ${it.danger ? 'danger' : ''}`}
              onClick={() => { setOpen(false); btn.current?.focus(); it.onClick(); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A person's initials, or a little cluster of a group's members. */
function EntryAvatar({ p }) {
  if (p.kind === 'person') {
    const [bg, fg] = avatarFor(p.user_id || p.id);
    return <span className="av" style={{ background: bg, color: fg }}>{p.initials}</span>;
  }
  return (
    <span className="av" style={{ background: '#FFFBEF' }}>
      {p.members.slice(0, 3).map((m, k) => {
        const [mb] = avatarFor(m.user_id);
        return <span key={m.user_id} className="mini-av" style={{ background: m.name === 'You' ? '#FFF0B3' : mb, ...[{ left: 1, top: 5 }, { left: 20, top: 1 }, { left: 11, top: 21 }][k] }}>{m.initials}</span>;
      })}
    </span>
  );
}

/** Opens below the tiles on desktop, as a full-width modal on mobile. */
function Panel({ id, title, narrow, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (narrow) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [narrow]);
  if (narrow) return <Modal open onClose={onClose} title={title} width={720}>{children}</Modal>;
  return (
    <section id={id} ref={ref} tabIndex={-1} className="card sh-panel" aria-label={title}>
      <div className="sh-panel-head">
        <h2 className="h2">{title}</h2>
        <button type="button" className="x-btn" aria-label={`Close ${title}`} onClick={onClose}><Icon d={I.close} size={18} /></button>
      </div>
      {children}
    </section>
  );
}

export default function Shared() {
  const { fmt, fmtShort, sources, refresh, toast } = useApp();
  const { data, loading, error, reload } = useApi('/shared');
  const invites = useApi('/invites');
  const narrow = useNarrow();
  const [sel, setSel] = useState(null);
  const [panel, setPanel] = useState(null); // 'plans' | 'history'
  const [splitOpen, setSplitOpen] = useState(false);
  const [planAdd, setPlanAdd] = useState(null); // plan getting money
  const [reqOpen, setReqOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [inviteTo, setInviteTo] = useState(null); // a group to invite more people to
  const [planEdit, setPlanEdit] = useState(null); // { plan?: existing plan } while the plan form is open
  const [planDel, setPlanDel] = useState(null); // plan being deleted
  const [confirm, setConfirm] = useState(null); // { title, text, action, run }

  const entries = data ? [...data.people, ...data.groups] : [];
  const cur = entries.find((e) => keyOf(e) === sel) || entries[0];
  const after = () => { reload(); invites.reload(); refresh(); };
  // An invitation or request answered from the notification bell.
  useEffect(() => {
    const on = () => { reload(); invites.reload(); };
    window.addEventListener('spendsmart:shared-changed', on);
    return () => window.removeEventListener('spendsmart:shared-changed', on);
  }, [reload, invites.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable callbacks: Modal re-runs its focus effect whenever onClose changes.
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const closePanel = useCallback(() => {
    const p = panelRef.current;
    setPanel(null);
    // Give focus back to the tile that opened the panel.
    if (p) setTimeout(() => document.getElementById(`sh-tile-${p}`)?.focus(), 0);
  }, []);
  const closeReq = useCallback(() => setReqOpen(false), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const closeAdding = useCallback(() => setAdding(false), []);
  const closeInviteTo = useCallback(() => setInviteTo(null), []);
  const closePlanEdit = useCallback(() => setPlanEdit(null), []);
  const closePlanDel = useCallback(() => setPlanDel(null), []);
  const closeSplit = useCallback(() => setSplitOpen(false), []);
  const closePlanAdd = useCallback(() => setPlanAdd(null), []);
  useEscape(!!panel && !narrow, closePanel);

  const ask = (title, text, action, fn, okMsg, { resetSel = true } = {}) => setConfirm({ title, text, action, run: async () => {
    try { await fn(); toast(okMsg); setConfirm(null); if (resetSel) { setSel(null); setPanel(null); } after(); } catch (e) { toast(e.message, 'err'); }
  } });
  const removeContact = (p) => ask(`Remove ${p.name}?`,
    `You'll stop seeing each other in Shared expenses, pending requests between you are cancelled and your savings plans together end — everyone's savings go back to the card they came from. Past splits stay in your history.`,
    'Remove', () => api.del(`/contacts/${p.id}`), `${first(p.name)} removed`);
  const leaveGroup = (g) => ask(`Leave ${g.name}?`,
    `Your pending requests in this group are cancelled and your savings in the group's plans go back to the cards they came from.${g.owner ? ' Ownership passes to the next member.' : ''}`,
    'Leave group', () => api.post(`/groups/${g.id}/leave`), `You left ${g.name}`);
  const removeMember = (g, m) => ask(`Remove ${m.name} from ${g.name}?`, 'Their pending requests in this group are cancelled.',
    'Remove', () => api.del(`/groups/${g.id}/members/${m.user_id}`), `${first(m.name)} removed`, { resetSel: false });
  async function cancelGroupInvite(g, x) {
    try { await api.del(`/groups/${g.id}/invites?email=${encodeURIComponent(x.email)}`); toast('Invitation cancelled'); reload(); }
    catch (e) { toast(e.message, 'err'); }
  }

  async function settle() {
    const src = sources[0];
    if (!src) return toast('Add a card or wallet first', 'err');
    try {
      const r = await api.post('/settle', { user_id: cur.user_id, source_id: src.id });
      toast(r.settled ? `Settled ${plural(r.settled, 'request')} from ${src.name}` : 'Nothing to settle');
      after();
    } catch (e) { toast(e.message, 'err'); }
  }

  // ----- header text -----
  let balance = '', balTone = 'even', role = '', balSub = '';
  if (cur?.kind === 'person') {
    const name = first(cur.name);
    const iOwe = Number(cur.iOwe) || 0, theyOwe = Number(cur.theyOwe) || 0;
    const net = Math.round((theyOwe - iOwe) * 100) / 100;
    role = cur.relation;
    if (net < 0) { balance = `You owe ${name} ${fmtShort(-net)}`; balTone = 'owe'; }
    else if (net > 0) { balance = `${name} owes you ${fmtShort(net)}`; balTone = 'owed'; }
    else balance = 'All settled';
    if (iOwe > 0 && theyOwe > 0) balSub = `You owe ${fmtShort(iOwe)} · ${name} owes you ${fmtShort(theyOwe)}`;
    if (balTone === 'even') balance = 'All settled ✓';
  } else if (cur?.kind === 'group') {
    const others = cur.members.filter((m) => m.name !== 'You').map((m) => first(m.name));
    role = `Group · ${others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others.at(-1)}` : others[0] || 'just you'}${others.length ? ' and you' : ''}`
      + (cur.invited.length ? ` · ${cur.invited.length} invited` : '');
    balance = cur.pending ? `${cur.pending.title} pending — ${fmtShort(cur.pending.share)} each`
      : others.length ? 'Nothing shared yet' : 'Waiting for people to accept';
  }

  const short = cur ? (cur.kind === 'group' ? cur.name : first(cur.name)) : '';
  const splits = splitsWith(data?.history, cur);
  const plans = cur ? (cur.plans || []).filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i) : [];
  const waiting = (data?.incoming.length || 0) + (invites.data?.incoming.length || 0);
  const menuItems = !cur ? [] : cur.kind === 'person'
    ? [{ label: `Remove ${short}`, danger: true, onClick: () => removeContact(cur) }]
    : [...(cur.owner ? [{ label: 'Invite people', onClick: () => setInviteTo(cur) }] : []), { label: 'Leave group', danger: true, onClick: () => leaveGroup(cur) }];

  const tiles = [
    { id: 'split', title: 'New split', sub: `Split a bill with ${short}`, dialog: true,
      icon: <Icon d={I.plus} /> },
    { id: 'plans', title: 'Saving together', sub: plans.length ? plural(plans.length, 'plan') : 'Save up for something together',
      icon: <Icon d={I.wallet}><circle cx="16" cy="14" r="1.3" /></Icon> },
    { id: 'history', title: 'History', sub: splits.length ? plural(splits.length, 'split') : 'No splits yet',
      icon: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon> }
  ];
  const panelTitle = { plans: `Saving together with ${short}`, history: `History with ${short}` }[panel];

  return (
    <>
      <Topbar heading="Shared expenses" sub="Split costs with roommates, your partner and friends." tagline="Split it, don't sweat it!" />
      <ErrorNote>{error}</ErrorNote>
      <div className="enter sh-page">
        {/* 1. People / groups + requests pill */}
        <div className="card sh-top">
          <div className="sh-people" role="group" aria-label="People and groups">
            {entries.map((p) => {
              const on = cur && keyOf(p) === keyOf(cur);
              return (
                <button key={keyOf(p)} type="button" className={`person ${on ? 'on' : ''}`} aria-pressed={on}
                  onClick={() => setSel(keyOf(p))}>
                  <EntryAvatar p={p} />
                  <span className="person-name">{p.kind === 'person' ? first(p.name) : p.name}</span>
                </button>
              );
            })}
            <button type="button" className="person" aria-label="Invite a person or group" onClick={() => setAdding(true)}>
              <span className="av av-add"><Icon d={I.plus} /></span>Invite
            </button>
          </div>
          {waiting > 0 && (
            <button type="button" className="sh-req-pill" aria-haspopup="dialog" onClick={() => setReqOpen(true)}>
              <span className="sh-req-dot"><Icon d={I.bell} size={16} /></span>
              <span><b>{plural(waiting, 'request')} waiting</b> · Review</span>
            </button>
          )}
        </div>

        {loading && !data && <SkeletonRows n={2} />}
        {data && !cur && (
          <div className="card empty-card">
            <b style={{ color: '#3B2F12' }}>Share your first bill</b>
            Invite a roommate, partner or friend by email — or start a group for the apartment. Once they accept, you can split costs and save up together.
            <button className="btn" onClick={() => setAdding(true)}><Icon d={I.plus} />Invite a person or group</button>
          </div>
        )}

        {cur && (
          <>
            {/* 2. Selected person / group: one compact row + a small balance pill */}
            <div className="sh-who">
              <span className="sh-head-av"><EntryAvatar p={cur} /></span>
              <div className="sh-who-txt">
                <div className="sh-who-line">
                  <span className="sh-who-name">{cur.name}</span>
                  <span className="sh-head-role">{role}</span>
                  <MoreMenu label={`More options for ${cur.name}`} items={menuItems} />
                </div>
                <div className={`sh-bal ${balTone}`} aria-live="polite" title={balSub || undefined}>
                  <span className="sh-bal-txt">{balance}</span>
                  {cur.kind === 'person' && cur.iOwe > 0 && (
                    <><span aria-hidden="true">·</span><button type="button" className="sh-bal-btn" onClick={settle}>Settle up</button></>
                  )}
                </div>
              </div>
              {cur.kind === 'group' && (
                <div className="sh-members">
                  {cur.members.map((m) => (
                    <span key={m.user_id} className="member-chip">
                      {m.name}{m.owner && <span className="small-muted"> · owner</span>}
                      {cur.owner && m.name !== 'You' && <button type="button" className="chip-x" aria-label={`Remove ${m.name}`} onClick={() => removeMember(cur, m)}>×</button>}
                    </span>
                  ))}
                  {cur.invited.map((x) => (
                    <span key={x.email} className="member-chip invited">
                      {x.email} <span className="st pend">Invited</span>
                      {x.canCancel && <button type="button" className="chip-x" aria-label={`Cancel the invitation to ${x.email}`} onClick={() => cancelGroupInvite(cur, x)}>×</button>}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Action tiles */}
            <div className="sh-tiles">
              {tiles.map((t) => (
                <button key={t.id} id={`sh-tile-${t.id}`} type="button" className={`card sh-tile ${panel === t.id ? 'on' : ''}`}
                  {...(t.dialog
                    ? { 'aria-haspopup': 'dialog', onClick: () => setSplitOpen(true) }
                    : { 'aria-pressed': panel === t.id, 'aria-controls': !narrow && panel === t.id ? 'sh-panel' : undefined, onClick: () => setPanel((p) => (p === t.id ? null : t.id)) })}>
                  <span className="gold sh-tile-ic">{t.icon}</span>
                  <span className="sh-tile-txt"><span className="sh-tile-title">{t.title}</span><span className="sh-tile-sub">{t.sub}</span></span>
                </button>
              ))}
            </div>

            {/* 4. Panels */}
            {panel && (
              <Panel key={`${panel}:${keyOf(cur)}`} id="sh-panel" title={panelTitle} narrow={narrow} onClose={closePanel}>
                {panel === 'plans' && (
                  <PlansPanel plans={plans} onNew={() => setPlanEdit({})} onEdit={(pl) => setPlanEdit({ plan: pl })}
                    onDelete={setPlanDel} onAdd={setPlanAdd} />
                )}
                {panel === 'history' && <SplitList splits={splits} who={short} empty={`No splits with ${short} yet.`} />}
              </Panel>
            )}

            {(!panel || narrow) && (
              <section className="card sh-recent" aria-labelledby="sh-recent-h">
                <div className="sh-recent-head">
                  <h2 className="h2" id="sh-recent-h">Recent activity</h2>
                  {splits.length > 3 && <button type="button" className="link-btn" onClick={() => setPanel('history')}>See all</button>}
                </div>
                <SplitList splits={splits.slice(0, 3)} who={short} empty={`Nothing yet — split your first bill with ${short}.`} />
              </section>
            )}
          </>
        )}
      </div>

      {/* 5. Requests */}
      <Modal open={reqOpen} onClose={closeReq} title="Waiting on you" width={560}>
        <RequestsPanel invites={invites.data} incoming={data?.incoming || []} onDone={after} />
      </Modal>

      <AddPeopleModal open={adding} onClose={closeAdding} sent={invites.data?.outgoing || []}
        onCancelled={() => invites.reload()} onAdded={() => { setAdding(false); after(); }} />
      <AddPeopleModal open={!!inviteTo} group={inviteTo} onClose={closeInviteTo} onAdded={() => { setInviteTo(null); reload(); }} />
      <PlanModal open={!!planEdit} plan={planEdit?.plan} target={cur} onClose={closePlanEdit}
        onSaved={(msg) => { setPlanEdit(null); toast(msg); reload(); }} />
      <DeletePlanModal plan={planDel} onClose={closePlanDel} onDone={() => { setPlanDel(null); after(); }} />
      <Modal open={splitOpen && !!cur} onClose={closeSplit} title={`New split with ${short}`}>
        {cur && <SplitForm target={cur} onSent={() => { setSplitOpen(false); after(); }} />}
      </Modal>
      <Modal open={!!planAdd} onClose={closePlanAdd} title={`Add money to ${planAdd?.item_name || ''}`}>
        {planAdd && (
          <AddMoneyForm name={planAdd.item_name} onSubmit={async (amount, src) => {
            await api.post(`/shared-plans/${planAdd.id}/contribute`, { amount, source_id: src.id });
            setPlanAdd(null);
            toast(`${fmt(amount)} put aside for ${planAdd.item_name}`);
            reload(); refresh();
          }} />
        )}
      </Modal>
      <Modal open={!!confirm} onClose={closeConfirm} title={confirm?.title || ''}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#57400A' }}>{confirm?.text}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-o" style={{ flex: 1, height: 46 }} onClick={closeConfirm}>Keep</button>
          <button type="button" className="btn" style={{ flex: 1, height: 46 }} onClick={() => confirm?.run()}>{confirm?.action}</button>
        </div>
      </Modal>
    </>
  );
}

/** Splits with a person or group: title, who paid, total, status, time. */
function SplitList({ splits, who, empty }) {
  const { fmt } = useApp();
  if (!splits.length) return <p className="sh-muted-line">{empty}</p>;
  return (
    <ul className="sh-list">
      {splits.map((s) => (
        <li key={s.id} className="sh-list-row">
          <span className={`sh-dir ${s.fromMe ? 'out' : 'in'}`} aria-hidden="true"><Icon d={s.fromMe ? I.up : I.down} size={16} /></span>
          <div className="sh-list-main">
            <div className="sh-list-title">{s.title}</div>
            <div className="sh-list-sub">
              {s.fromMe ? `You paid · ${s.group_id ? 'each share' : `${who}'s share`} ${fmt(s.share)}` : `${first(s.from.name)} paid · your share ${fmt(s.share)}`}
              {' · '}{timeAgo(s.created_at)}
            </div>
          </div>
          <div className="sh-list-end">
            <b className="num">{fmt(s.total)}</b>
            <StatusBadge status={s.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SplitForm({ target, onSent }) {
  const { sources, fmt, toast } = useApp();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('Groceries');
  const [srcId, setSrcId] = useState('');
  const [pct, setPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const parsed = toNum(amount);
  const amt = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const isGroup = target.kind === 'group';
  const n = isGroup ? Math.max(1, target.members.length) : 2;
  const mine = isGroup ? amt / n : (amt * pct) / 100;
  const theirs = isGroup ? amt / n : amt - mine;
  const short = isGroup ? target.name : first(target.name);
  const src = sources.find((s) => s.id === srcId) || sources[0];

  async function send(e) {
    e.preventDefault(); setErr('');
    if (!title.trim()) return setErr('What did you buy?');
    if (!amt) return setErr('Enter the total amount.');
    if (!src) return setErr('Add a card or wallet first.');
    setBusy(true);
    try {
      const t = isGroup ? { type: 'group', group_id: target.id } : { type: 'person', user_id: target.user_id };
      await api.post('/splits', { target: t, title: title.trim(), category: cat, amount: amt, my_pct: pct, source_id: src.id });
      toast(`Split request sent to ${short}`);
      onSent();
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <form className="modal-body" onSubmit={send} noValidate>
      <div className="sh-form-row">
        <div className="sh-field grow2"><label className="lbl" htmlFor="sp-w">What did you buy?</label><input className="inp" id="sp-w" placeholder="Groceries" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="sh-field"><label className="lbl" htmlFor="sp-a">Amount</label><input className="inp" id="sp-a" inputMode="decimal" placeholder={fmt(60)} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      <div className="sh-form-row">
        <div className="sh-field"><label className="lbl" htmlFor="sp-pf">Paid from</label>
          <select className="inp" id="sp-pf" value={src?.id || ''} onChange={(e) => setSrcId(e.target.value)} disabled={!sources.length}>
            {sources.length ? sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : <option value="">No card or wallet yet</option>}
          </select>
        </div>
        <div className="sh-field"><label className="lbl" htmlFor="sp-c">Category</label>
          <select className="inp" id="sp-c" value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>
      <div>
        <span className="lbl">{isGroup ? 'Split' : 'Your share / theirs'}</span>
        {isGroup
          ? <div className="seg sh-equal">Equal · {n} people</div>
          : <Seg role="radiogroup" label="How to split" value={pct} onChange={setPct} options={SPLITS} />}
      </div>
      <div className="sh-summary" aria-live="polite">
        You pay <b className="num">{fmt(mine)}</b>
        <span className="sh-summary-sep" aria-hidden="true">·</span>
        {isGroup ? 'Each other member pays' : `${short} pays`} <b className="num">{fmt(theirs)}</b>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn full" disabled={busy}>{busy ? <span className="spin" /> : <><Icon d={I.send} size={18} />Send split request</>}</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Saving together (shared savings plans)
// ---------------------------------------------------------------------------
const MONTHS = [1, 3, 6, 12];
const NEW_CAT = '__new__';
const PLAN_STATUS = { done: ['ok', 'Done ✓'], on_track: ['ok', 'On track'], behind: ['sh-behind', 'Behind'] };

function PlansPanel({ plans, onNew, onEdit, onDelete, onAdd }) {
  if (!plans.length) {
    return (
      <div className="sh-empty">
        <span>Save up for something together, each from your own cards.</span>
        <button type="button" className="btn" onClick={onNew}><Icon d={I.plus} />Create a plan</button>
      </div>
    );
  }
  return (
    <>
      <div className="sh-panel-tools">
        <span className="small-muted">Each of you saves from your own cards.</span>
        <button type="button" className="btn-o sm" onClick={onNew}><Icon d={I.plus} size={16} />New plan</button>
      </div>
      <div className="sh-plans">
        {plans.map((p) => <PlanCard key={p.id} plan={p} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd} />)}
      </div>
    </>
  );
}

/**
 * One compact card: name + deadline + menu, one bar for the total, then my monthly amount, my
 * status and "Add money". Everyone's numbers and the category sit behind "Details".
 */
function PlanCard({ plan, onEdit, onDelete, onAdd }) {
  const { fmtShort } = useApp();
  const [open, setOpen] = useState(false);
  const detailsId = `plan-details-${plan.id}`;
  const items = [
    ...(plan.isMember ? [{ label: 'Edit', onClick: () => onEdit(plan) }] : []),
    ...(plan.mine ? [{ label: 'Delete', danger: true, onClick: () => onDelete(plan) }] : [])
  ];
  const pct = Math.max(0, Number(plan.pct) || 0);
  const me = plan.members.find((m) => m.isMe);
  const [cls, label] = PLAN_STATUS[me?.status] || PLAN_STATUS.on_track;
  const bare = (n) => fmtShort(n).replace(/\s\S+$/, ''); // "120": the unit is shown once, after the target
  const members = [...plan.members].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  return (
    <article className="sh-plan" aria-label={`Saving for ${plan.item_name}`}>
      <div className="sh-plan-top">
        <span className="sh-plan-name">{plan.item_name}</span>
        <span className="sh-plan-date">by {monthYear(plan.end_date)}</span>
        <span className="grow" />
        <MoreMenu label={`Options for ${plan.item_name}`} items={items} />
      </div>
      <div className="sh-plan-total">
        <div className="bar" role="progressbar" aria-label={`Saved for ${plan.item_name}`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.min(pct, 100)} aria-valuetext={`${fmtShort(plan.saved)} of ${fmtShort(plan.target)} (${pct}%)`}>
          <div className="fill live" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className="sh-plan-sum num">{bare(plan.saved)} / {fmtShort(plan.target)} · {pct}%</span>
      </div>
      <div className="sh-plan-me">
        {me
          ? <span>You: <b className="num">{me.remaining > 0 ? `${fmtShort(me.per_month)}/month` : 'share complete'}</b></span>
          : <span className="small-muted">You're not part of this plan</span>}
        {me && <span className={`st ${cls}`}>{label}</span>}
        <span className="grow" />
        <button type="button" className="link-btn" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((o) => !o)}>{open ? 'Hide details' : 'Details'}</button>
        {me && me.remaining > 0 && <button type="button" className="btn sm" aria-haspopup="dialog" onClick={() => onAdd(plan)}><Icon d={I.plus} size={16} />Add money</button>}
      </div>
      {open && (
        <div className="sh-plan-details" id={detailsId}>
          <span className="sh-chip">{plan.category}</span>
          <ul className="sh-plan-people">
            {members.map((m) => (
              <li key={m.user_id}>
                <span className="sh-plan-who">{m.isMe ? 'You' : first(m.name)} <span className="small-muted">· {Number(m.share_pct)}%</span></span>
                <span className="num">{bare(m.saved)} / {fmtShort(m.target_share)}</span>
                <span className="small-muted num">{m.remaining > 0 ? `${fmtShort(m.per_month)}/month` : 'Done'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/** Built-in categories + mine + "+ New category" (inline input). */
function CategoryField({ id, value, onChange, open }) {
  const { toast } = useApp();
  const cats = useApi(open ? '/categories' : null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const wrap = useRef(null);
  // Native, so Escape cancels the new-category input without closing the modal around it.
  useEffect(() => {
    if (!adding) return undefined;
    const node = wrap.current;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAdding(false); } };
    node?.addEventListener('keydown', onKey);
    return () => node?.removeEventListener('keydown', onKey);
  }, [adding]);
  const builtIn = cats.data?.builtIn || CATEGORIES;
  const custom = cats.data?.custom || [];
  const known = [...builtIn, ...custom.map((c) => c.name)];

  async function add() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const r = await api.post('/categories', { name: n });
      cats.setData({ builtIn: r.builtIn, custom: r.custom });
      onChange(r.category.name);
      setAdding(false); setName('');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }

  if (adding) {
    return (
      <div className="sh-newcat" ref={wrap}>
        <input className="inp" id={id} autoFocus maxLength={30} placeholder="e.g. Kitchen" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn-o sm" disabled={busy || !name.trim()} onClick={add}>Add</button>
        <button type="button" className="x-btn" aria-label="Cancel new category" onClick={() => setAdding(false)}><Icon d={I.close} size={16} /></button>
      </div>
    );
  }
  return (
    <select className="inp" id={id} value={value} onChange={(e) => (e.target.value === NEW_CAT ? setAdding(true) : onChange(e.target.value))}>
      <optgroup label="Categories">{builtIn.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
      {custom.length > 0 && <optgroup label="Your categories">{custom.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>}
      {value && !known.includes(value) && <option value={value}>{value}</option>}
      <option value={NEW_CAT}>+ New category…</option>
    </select>
  );
}

/** Create or edit a plan. */
function PlanModal({ open, plan, target, onClose, onSaved }) {
  const { fmtShort } = useApp();
  const editing = !!plan;
  const isGroup = editing ? !!plan.group_id : target?.kind === 'group';
  const meRow = plan?.members.find((m) => m.isMe);
  const other = plan?.members.find((m) => !m.isMe);
  const [item, setItem] = useState('');
  const [cat, setCat] = useState('More');
  const [price, setPrice] = useState('');
  const [months, setMonths] = useState(3);
  const [customMonths, setCustomMonths] = useState('');
  const [pct, setPct] = useState(50);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(''); setBusy(false);
    setItem(plan?.item_name || ''); setCat(plan?.category || 'More'); setPrice(plan ? String(plan.target) : '');
    const m = plan?.months || 3;
    setMonths(m); setCustomMonths(MONTHS.includes(m) ? '' : String(m));
    setPct(meRow ? Number(meRow.share_pct) : 50);
  }, [open, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target && !plan) return null;
  const otherName = isGroup ? null : first(other?.name || target?.name || '');
  const count = isGroup ? (plan ? plan.members.length : target.members.length) : 2;
  const p = toNum(price);
  const amt = Number.isFinite(p) && p > 0 ? p : 0;
  const m = Number(months) || 0;
  const splitOptions = SPLITS.some((o) => o.value === pct) ? SPLITS : [...SPLITS, { value: pct, label: `${pct} / ${Math.round((100 - pct) * 100) / 100}` }];
  const mineMonthly = m ? (isGroup ? amt / count : (amt * pct) / 100) / m : 0;
  const theirsMonthly = m ? (isGroup ? amt / count : amt - (amt * pct) / 100) / m : 0;

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!item.trim()) return setErr('What are you saving for?');
    if (!amt) return setErr('Enter the price.');
    if (!Number.isInteger(m) || m < 1 || m > 60) return setErr('Pick between 1 and 60 months.');
    setBusy(true);
    const fields = { item_name: item.trim(), category: cat, target_amount: amt, months: m };
    try {
      if (editing) {
        const shares = !isGroup && meRow && other
          ? [{ user_id: meRow.user_id, share_pct: pct }, { user_id: other.user_id, share_pct: Math.round((100 - pct) * 100) / 100 }]
          : undefined;
        await api.patch(`/shared-plans/${plan.id}`, { ...fields, ...(shares ? { shares } : {}) });
        onSaved('Plan updated');
      } else {
        await api.post('/shared-plans', { ...fields, ...(isGroup ? { group_id: target.id } : { partner_id: target.user_id, my_pct: pct }) });
        onSaved(`Plan created — ${isGroup ? target.name : otherName} will be notified`);
      }
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  const title = editing ? `Edit ${plan.item_name}` : `Save together with ${isGroup ? target.name : otherName}`;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className="modal-body" onSubmit={submit} noValidate>
        <div><label className="lbl" htmlFor="pl-item">What are you saving for?</label>
          <input className="inp" id="pl-item" maxLength={60} placeholder="Oven" value={item} onChange={(e) => setItem(e.target.value)} />
        </div>
        <div className="sh-form-row">
          <div className="sh-field"><label className="lbl" htmlFor="pl-cat">Category</label><CategoryField id="pl-cat" open={open} value={cat} onChange={setCat} /></div>
          <div className="sh-field"><label className="lbl" htmlFor="pl-price">Price</label>
            <input className="inp" id="pl-price" inputMode="decimal" placeholder={fmtShort(900)} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <div>
          <span className="lbl" id="pl-months-l">In how many months?</span>
          <div className="sh-quick" role="group" aria-labelledby="pl-months-l">
            {MONTHS.map((n) => (
              <button key={n} type="button" className={`opt ${m === n && !customMonths ? 'on' : ''}`} aria-pressed={m === n && !customMonths}
                onClick={() => { setMonths(n); setCustomMonths(''); }}>{n}</button>
            ))}
            <input className="inp sh-months-inp" inputMode="numeric" aria-label="Other number of months" placeholder="Other"
              value={customMonths} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 2); setCustomMonths(d); setMonths(d ? Number(d) : 3); }} />
          </div>
        </div>
        <div>
          <span className="lbl">{isGroup ? 'Split' : 'Your share / theirs'}</span>
          {isGroup
            ? <div className="seg sh-equal">Equal · {count} people</div>
            : <Seg role="radiogroup" label="How to split" value={pct} onChange={setPct} options={splitOptions} />}
        </div>
        <div className="sh-summary" aria-live="polite">
          {amt && m ? (
            <span>
              <b className="num">{fmtShort(amt)}</b> in {plural(m, 'month')} → you put aside <b className="num">{fmtShort(Math.round(mineMonthly * 100) / 100)}</b>/month
              {isGroup ? ', and so does everyone else' : <>, {otherName} <b className="num">{fmtShort(Math.round(theirsMonthly * 100) / 100)}</b>/month</>}
            </span>
          ) : <span>Enter a price to see how much each of you puts aside per month.</span>}
        </div>
        <ErrorNote>{err}</ErrorNote>
        <button className="btn full" disabled={busy}>{busy ? <span className="spin" /> : editing ? 'Save changes' : 'Create plan'}</button>
      </form>
    </Modal>
  );
}

/** Deleting gives my savings back to a card I pick; the others' go back to the cards they came from. */
function DeletePlanModal({ plan, onClose, onDone }) {
  const { sources, fmt, toast } = useApp();
  const [srcId, setSrcId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setErr(''); setBusy(false); setSrcId(''); }, [plan]);
  if (!plan) return null;
  const mine = Number(plan.members.find((m) => m.isMe)?.saved) || 0;
  const others = plan.members.filter((m) => !m.isMe && m.saved > 0);
  const src = sources.find((s) => s.id === srcId) || sources[0];

  async function run() {
    setErr('');
    if (mine > 0 && !src) return setErr('Add a card or wallet to return your savings to.');
    setBusy(true);
    try {
      const r = await api.del(`/shared-plans/${plan.id}`, mine > 0 ? { return_to_source_id: src.id } : undefined);
      toast(r?.returned ? `Plan deleted · ${fmt(r.returned.amount)} back on ${r.returned.source}` : 'Plan deleted');
      onDone();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Delete “${plan.item_name}”?`}>
      <p className="sh-del-p">
        {mine > 0 ? <>You put <b>{fmt(mine)}</b> into this plan. Choose where it goes back:</> : 'You haven\'t put money into this plan yet.'}
      </p>
      {mine > 0 && (
        <select className="inp" aria-label="Return my savings to" value={src?.id || ''} onChange={(e) => setSrcId(e.target.value)}>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmt(s.balance)}</option>)}
        </select>
      )}
      {others.length > 0 && (
        <p className="sh-del-p small-muted">
          {others.map((m) => `${first(m.name)}'s ${fmt(m.saved)}`).join(', ')} go{others.length === 1 ? 'es' : ''} back to the card{others.length === 1 ? '' : 's'} they saved from. They'll be notified.
        </p>
      )}
      <ErrorNote>{err}</ErrorNote>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn-o" style={{ flex: 1, height: 46 }} onClick={onClose}>Keep</button>
        <button type="button" className="btn" style={{ flex: 1, height: 46 }} disabled={busy} onClick={run}>{busy ? <span className="spin" /> : 'Delete plan'}</button>
      </div>
    </Modal>
  );
}

/** Everything waiting on me: invitations and split requests. */
function RequestsPanel({ invites, incoming, onDone }) {
  const inv = invites?.incoming || [];
  if (!inv.length && !incoming.length) return <p className="sh-muted-line" role="status">You're all caught up — nothing is waiting on you.</p>;
  return (
    <div className="sh-reqs">
      {inv.length > 0 && <><span className="req-head">Invitations</span><PendingInvites list={inv} onDone={onDone} /></>}
      {incoming.length > 0 && (
        <>
          <span className="req-head">Split requests</span>
          {incoming.map((r, k) => <IncomingRequest key={r.id} r={r} delay={k * 0.06} onDone={onDone} />)}
        </>
      )}
    </div>
  );
}

/** Invitations waiting on me (Accept / Decline). */
function PendingInvites({ list, onDone }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(null);
  async function answer(i, ok) {
    setBusy(`${i.kind}:${i.id}`);
    try {
      await api.post(i.kind === 'group' ? `/groups/${i.id}/${ok ? 'accept' : 'decline'}` : `/invites/${i.id}/${ok ? 'accept' : 'decline'}`);
      toast(ok ? (i.kind === 'group' ? `You joined ${i.group.name}` : `You and ${first(i.from.name)} are connected`) : 'Invitation declined');
      onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(null); }
  }
  return (
    <div className="card sh-inv-list">
      {list.map((i) => {
        const [bg, fg] = avatarFor(i.from.email || i.id);
        const b = busy === `${i.kind}:${i.id}`;
        return (
          <div key={`${i.kind}:${i.id}`} className="sh-inv">
            <Avatar initials={i.from.initials} bg={bg} fg={fg} size={40} />
            <div className="grow">
              <div className="sh-list-title">{i.kind === 'group' ? <>{i.from.name} invited you to <b>{i.group.name}</b></> : <>{i.from.name} wants to share expenses</>}</div>
              <div className="sh-list-sub" style={{ overflowWrap: 'anywhere' }}>
                {i.kind === 'group' ? plural(Number(i.group.members) || 0, 'member') : i.from.email} · {timeAgo(i.created_at)}
              </div>
            </div>
            <div className="sh-inv-actions">
              <button type="button" className="btn-o sm" disabled={b} onClick={() => answer(i, false)}>Decline</button>
              <button type="button" className="btn sm" disabled={b} onClick={() => answer(i, true)}>Accept</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncomingRequest({ r, delay, onDone }) {
  const { sources, fmt, toast } = useApp();
  const [srcId, setSrcId] = useState('');
  const [state, setState] = useState('pending');
  const [busy, setBusy] = useState(false);
  const [flying, setFlying] = useState(false);
  const [bal, setBal] = useState(null);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  const src = sources.find((s) => s.id === srcId) || sources[0];
  const [bg, fg] = avatarFor(r.from.id);
  const name = first(r.from.name);

  async function accept() {
    if (!src) return toast('Add a card or wallet first', 'err');
    setBusy(true);
    try {
      const res = await api.post(`/splits/${r.id}/accept`, { source_id: src.id });
      setBal(res.after); setState('accepted'); setFlying(true);
      t.current = setTimeout(() => { setFlying(false); onDone(); }, 1600);
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }
  async function decline() {
    setBusy(true);
    try { await api.post(`/splits/${r.id}/decline`); setState('declined'); t.current = setTimeout(onDone, 1600); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <div className="card msgin sh-req" style={{ animationDelay: `${delay}s` }}>
      <div className="sh-req-top">
        <Avatar initials={r.from.initials} bg={bg} fg={fg} size={42} />
        <div className="grow">
          <div className="sh-list-title">{r.title}</div>
          <div className="sh-list-sub">From {r.from.name} · {timeAgo(r.created_at)}</div>
        </div>
      </div>
      <div className="sh-req-amounts">
        <div><span>Total</span><b className="num">{fmt(r.total)}</b></div>
        <div><span>Your share</span><b className="num" style={{ color: '#8A6406' }}>{fmt(r.share)}</b></div>
      </div>
      {src && (
        <div className="req-src">
          {state === 'pending' && sources.length > 1
            ? <label className="sh-src-pick">Pay from
                <select value={src.id} onChange={(e) => setSrcId(e.target.value)} className="req-sel">{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
            : <span style={{ color: '#6B5A33' }}>Pay from {src.name}</span>}
          <b style={{ fontSize: 16 }}><Num value={bal ?? src.balance} from={src.balance} duration={800} /></b>
          {flying && <span className="flyc" style={{ right: 30, top: -70, '--fx': '0px', '--fy': '64px' }}><Coin size={28} style={{ fontSize: 12 }} /></span>}
        </div>
      )}
      {state === 'pending' && (
        <div className="sh-req-actions">
          <button type="button" className="btn-o" disabled={busy} onClick={decline}>Decline</button>
          <button type="button" className="btn" disabled={busy} onClick={accept}>Accept</button>
        </div>
      )}
      {state === 'accepted' && (
        <div className="pop accepted" role="status">
          <svg viewBox="0 0 24 24" style={{ width: 26, height: 26, flex: 'none' }} aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#15803D" /><path className="draw" d="m7 12.5 3.5 3.5L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Accepted · {fmt(r.share)} deducted
        </div>
      )}
      {state === 'declined' && <span className="st no pop" role="status" style={{ alignSelf: 'flex-start' }}>Declined · {name} will be notified</span>}
    </div>
  );
}

function AddPeopleModal({ open, onClose, onAdded, group = null, sent = [], onCancelled }) {
  const { toast } = useApp();
  const [pick, setTab] = useState('person');
  const tab = group ? 'group' : pick; // inviting more people to an existing group
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('Roommate');
  const [gname, setGname] = useState('');
  const [emails, setEmails] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(null);

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
  async function cancelInvite(i) {
    setCancelling(i.id);
    try { await api.del(`/invites/${i.id}`); toast('Invitation cancelled'); onCancelled?.(); }
    catch (e2) { toast(e2.message, 'err'); } finally { setCancelling(null); }
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
        <span className="small-muted" style={{ fontSize: 12.5 }}>They'll get an invitation and have to accept it before you can split costs or save up together. Up to 20 invitations a day.</span>
        <ErrorNote>{err}</ErrorNote>
        <button className="btn full" disabled={busy}>{busy ? <span className="spin" /> : tab === 'person' ? 'Send invitation' : group ? 'Send invitations' : 'Create group & invite'}</button>
      </form>
      {!group && sent.length > 0 && (
        <div className="sh-sent">
          <span className="req-head">Invitations you sent</span>
          {sent.map((i) => (
            <div key={i.id} className="sh-sent-row">
              <div className="grow">
                <div className="sh-list-title" style={{ overflowWrap: 'anywhere' }}>{i.email}</div>
                <div className="sh-list-sub">{i.relation} · {timeAgo(i.created_at)}</div>
              </div>
              <button type="button" className="btn-o sm" disabled={cancelling === i.id} onClick={() => cancelInvite(i)}>Cancel</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
