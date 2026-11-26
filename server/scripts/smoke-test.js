/**
 * End-to-end smoke test against a real database: `npm run smoke -w server`.
 *
 * Starts the API on a random port (with this process's DATABASE_URL), creates throwaway
 * users directly in the database (two, plus a third that "signs up" to claim invitations),
 * runs the checks over HTTP (plus the subscription job
 * functions directly) and deletes the users again. Exit code 1 when a check fails.
 *
 * It does touch the database it runs against (temporary users, and one pass of the
 * subscription job for everybody), so prefer a local or staging database.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, one, many, query, tx } from '../src/db.js';
import { createStarterSources } from '../src/lib/finance.js';
import { claimInvites, INVITE_SENT, INVITES_PER_DAY } from '../src/lib/sharing.js';
import { runSubscriptionJob, JOB_LOCK } from '../src/jobs/subscriptions.js';
import { addDays, addMonths, localYmd } from '../src/lib/util.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4600 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}/api`;
const TZ = 'Africa/Tunis';
const PASSWORD = 'smoke-test-password'; // deliberately weak: older passwords must still log in
const STRONG = 'Tq9!vRw#4mZs';

let failed = 0, passed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
}
const section = (t) => console.log(`\n${t}`);

// ---- HTTP client with a cookie jar ----
let cookie = '';
async function call(method, p, body) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + p, { method, headers, body: payload });
  const set = res.headers.getSetCookie?.() || [];
  for (const c of set) if (c.startsWith('ss_session=')) cookie = c.split(';')[0];
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
// One session per test user: `await as(user)` switches the cookie jar (logging in the first time).
const jars = new Map();
async function as(u) {
  if (!jars.has(u.id)) {
    cookie = '';
    const r = await call('POST', '/auth/login', { email: u.email, password: PASSWORD, remember: false });
    if (r.status !== 200) throw new Error(`login as ${u.email} failed: HTTP ${r.status}`);
    jars.set(u.id, cookie);
  }
  cookie = jars.get(u.id);
}
const show = (r) => `HTTP ${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 200) : JSON.stringify(r.data)?.slice(0, 300)}`;

// ---- server process ----
async function startServer() {
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/index.js'], {
    // SMTP off: invitation emails to the test addresses are printed in the server log, never sent.
    cwd: SERVER_DIR, env: { ...process.env, PORT: String(PORT), SMTP_HOST: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return child; } catch { /* not up yet */ }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`The API did not start on port ${PORT}:\n${log}`);
}

async function createUser(tag, email = `smoke+${tag}-${crypto.randomBytes(4).toString('hex')}@example.test`) {
  const u = await one('insert into public.users (email, password_hash, full_name) values ($1, $2, $3) returning id',
    [email, await bcrypt.hash(PASSWORD, 4), `Smoke ${tag}`]);
  await query('insert into public.profiles (id, full_name, email, timezone) values ($1, $2, $3, $4)', [u.id, `Smoke ${tag}`, email, TZ]);
  await createStarterSources(u.id);
  return { id: u.id, email };
}

const charges = async (subId) => Number((await one('select count(*) as n from public.transactions where subscription_id = $1', [subId])).n);
const same = (x, y) => Math.abs(Number(x) - Number(y)) < 0.005;
const balanceOf = async (sourceId) => Number((await one('select balance from public.source_balances where id = $1', [sourceId])).balance);

/** Strong-password rules on every endpoint that sets a password (never at log-in). */
async function passwordChecks(users) {
  section('Passwords: one shared rule set');
  const [clientRules, serverRules] = await Promise.all([
    readFile(new URL('../../client/src/lib/passwordRules.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/passwordRules.js', import.meta.url), 'utf8')
  ]);
  check('client and server passwordRules.js are identical', clientRules === serverRules);

  section('Passwords: sign-up');
  const saved = cookie;
  cookie = '';
  const signupEmail = `smoke+signup-${crypto.randomBytes(4).toString('hex')}@example.test`;
  const reg = (password, confirmPassword) =>
    call('POST', '/auth/register', { full_name: 'Zelda Smoke', email: signupEmail, password, confirmPassword });
  const weak = (r, re) => r.status === 400 && r.data?.code === 'weak_password' && re.test(r.data.error || '');
  let r = await reg('Ab1!', 'Ab1!');
  check('too short → 400 weak_password', weak(r, /at least 8/), show(r));
  r = await reg('lowercase1!x', 'lowercase1!x');
  check('no uppercase → 400 weak_password', weak(r, /uppercase/), show(r));
  r = await reg('NoSymbol123x', 'NoSymbol123x');
  check('no symbol → 400 weak_password', weak(r, /symbol/), show(r));
  r = await reg('Password123!', 'Password123!');
  check('common password (Password123!) → 400 weak_password', weak(r, /too common/), show(r));
  r = await reg('Zelda#2026x', 'Zelda#2026x');
  check('contains the first name → 400 weak_password', weak(r, /name or email/), show(r));
  r = await reg(` ${STRONG}`, ` ${STRONG}`);
  check('space at the start → 400 weak_password', weak(r, /spaces/), show(r));
  r = await reg(STRONG, `${STRONG}x`);
  check('confirmPassword different → 400 password_mismatch', r.status === 400 && r.data?.code === 'password_mismatch', show(r));
  r = await reg(STRONG, undefined);
  check('confirmPassword missing → 400 password_mismatch', r.status === 400 && r.data?.code === 'password_mismatch', show(r));
  r = await reg(STRONG, STRONG);
  check('strong password + matching confirmation → 201 (code sent)', r.status === 201 && r.data?.needsVerification === true, show(r));
  await query('delete from public.pending_signups where email = $1', [signupEmail]);

  section('Passwords: reset');
  const resetUser = await createUser('reset'); users.push(resetUser);
  const token = crypto.randomBytes(32).toString('hex');
  await query("insert into public.password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')",
    [resetUser.id, crypto.createHash('sha256').update(token).digest('hex')]);
  const reset = (password, confirmPassword) => call('POST', '/auth/reset-password', { token, password, confirmPassword, remember: false });
  r = await reset('weakpassword', 'weakpassword');
  check('reset with a weak password → 400 weak_password', r.status === 400 && r.data?.code === 'weak_password', show(r));
  r = await reset('Smoke!Reset42', 'Smoke!Reset42');
  check('reset containing the first name ("Smoke") → 400 weak_password', weak(r, /name or email/), show(r));
  r = await reset(STRONG, 'other');
  check('reset with a mismatch → 400 password_mismatch', r.status === 400 && r.data?.code === 'password_mismatch', show(r));
  r = await reset(STRONG, STRONG);
  check('the link still works after rejected tries; strong reset → 200', r.status === 200 && !!r.data?.user, show(r));
  cookie = '';
  r = await call('POST', '/auth/login', { email: resetUser.email, password: STRONG, remember: false });
  check('log in with the new password', r.status === 200, show(r));

  cookie = saved;
}

/** Shared expenses: nobody is linked, or has their spending shown, without accepting. */
async function sharingChecks(a, b, users, aCard) {
  const ghost = `smoke+ghost-${crypto.randomBytes(4).toString('hex')}@example.test`; // no account (yet)
  const pendingInvites = async () => Number((await one("select count(*) as n from public.contact_invites where from_user = $1 and to_user = $2 and status = 'pending'", [a.id, b.id])).n);
  const inviteNotes = async (uid) => Number((await one("select count(*) as n from public.notifications where user_id = $1 and type = 'invite'", [uid])).n);
  const contactRows = async () => Number((await one('select count(*) as n from public.contacts where (owner_id = $1 and contact_id = $2) or (owner_id = $2 and contact_id = $1)', [a.id, b.id])).n);
  const bCard = await one('select id from public.sources where user_id = $1 order by created_at limit 1', [b.id]);
  let r;

  section('Sharing: contact invitations (no enumeration, consent first)');
  await as(a);
  const sentExisting = await call('POST', '/contacts', { email: b.email.toUpperCase(), relation: 'Roommate' });
  const sentGhost = await call('POST', '/contacts', { email: ghost, relation: 'Friend' });
  check('inviting an existing account → 202 with the generic message', sentExisting.status === 202 && sentExisting.data?.message === INVITE_SENT, show(sentExisting));
  check('inviting an unknown address → exactly the same answer', sentGhost.status === sentExisting.status && JSON.stringify(sentGhost.data) === JSON.stringify(sentExisting.data), `${show(sentGhost)} vs ${show(sentExisting)}`);
  r = await call('POST', '/contacts', { email: a.email });
  check('inviting yourself → 400', r.status === 400, show(r));
  r = await call('GET', '/shared');
  check('no contact is created before they accept', r.status === 200 && r.data.people.length === 0, show(r));
  r = await call('GET', '/invites');
  const out = r.data?.outgoing || [];
  check('GET /invites lists both sent invites by email only (no names), both "pending"',
    out.length === 2 && out.some((i) => i.email === b.email.toLowerCase()) && out.some((i) => i.email === ghost) && out.every((i) => i.status === 'pending' && !('from' in i) && !('name' in i)), show(r));
  r = await call('POST', '/splits', { target: { type: 'person', user_id: b.id }, title: 'Too early', category: 'Food', amount: 10, source_id: aCard.id });
  check('a split with someone who hasn\'t accepted → 403', r.status === 403, show(r));
  r = await call('POST', '/shared-plans', { item_name: 'Too early', category: 'More', target_amount: 100, months: 1, partner_id: b.id });
  check('a savings plan with someone who hasn\'t accepted → 403', r.status === 403, show(r));
  await call('POST', '/contacts', { email: b.email });
  check('inviting the same person again doesn\'t create a second invite', (await pendingInvites()) === 1);

  await as(b);
  r = await call('GET', '/notifications');
  const note = r.data?.find((n) => n.type === 'invite');
  check('the invitee gets an invite notification with Accept/Decline (action "contact")', note?.actionable === true && note.action === 'contact', show(r));
  check('… only one, despite the repeated invite', (await inviteNotes(b.id)) === 1);
  r = await call('GET', '/invites');
  const incoming = r.data?.incoming?.find((i) => i.kind === 'contact');
  check('GET /invites shows it as incoming, with the sender\'s name', incoming?.from?.name === 'Smoke a' && incoming.relation === 'Roommate', show(r));
  r = await call('POST', `/invites/${incoming.id}/decline`);
  check('decline → 200', r.status === 200, show(r));
  r = await call('POST', `/invites/${incoming.id}/accept`);
  check('accepting a declined invite → 400', r.status === 400, show(r));

  await as(a);
  r = await call('GET', '/invites');
  const mine = r.data?.outgoing?.find((i) => i.email === b.email.toLowerCase());
  check('the sender still sees the declined invite as "pending" (isn\'t told)', mine?.status === 'pending', show(r));
  await call('POST', '/contacts', { email: b.email });
  check('re-inviting after a decline sends nothing new', (await pendingInvites()) === 0 && (await inviteNotes(b.id)) === 1);
  r = await call('DELETE', `/invites/${mine.id}`);
  check('the sender can cancel it (204)', r.status === 204, show(r));
  await call('POST', '/contacts', { email: b.email, relation: 'Partner' });
  check('… and invite again afterwards', (await pendingInvites()) === 1);

  await as(b);
  r = await call('GET', '/invites');
  const again = r.data?.incoming?.find((i) => i.kind === 'contact');
  r = await call('POST', `/invites/${again.id}/accept`);
  check('accept → 200, contact created on both sides', r.status === 200 && (await contactRows()) === 2, show(r));
  r = await call('GET', '/shared');
  check('the invitee now sees the sender as a Partner', r.data?.people?.length === 1 && r.data.people[0].user_id === a.id && r.data.people[0].relation === 'Partner', show(r));

  section('Saving together: plans, contributions, refunds');
  const planOf = (resp, id) => [...(resp.data?.people || []).flatMap((x) => x.plans || []), ...(resp.data?.groups || []).flatMap((g) => g.plans || [])].find((x) => x.id === id);
  await as(a);
  r = await call('POST', '/categories', { name: 'Kitchen' });
  check('add a custom category → 201', r.status === 201 && r.data?.category?.name === 'Kitchen' && r.data.custom.some((c) => c.name === 'Kitchen'), show(r));
  r = await call('POST', '/categories', { name: 'kitchen' });
  check('… adding it again (any case) returns the same one', r.status === 201 && r.data.custom.filter((c) => c.name.toLowerCase() === 'kitchen').length === 1, show(r));
  r = await call('POST', '/shared-plans', { item_name: 'Oven', category: 'Nope', target_amount: 900, months: 3, partner_id: b.id });
  check('an unknown category → 400', r.status === 400, show(r));
  r = await call('POST', '/shared-plans', { item_name: 'Oven', category: 'Kitchen', target_amount: 900, months: 3, partner_id: b.id, shares: [{ user_id: a.id, share_pct: 70 }, { user_id: b.id, share_pct: 20 }] });
  check('shares that don\'t add up to 100 → 400', r.status === 400, show(r));
  r = await call('POST', '/shared-plans', { item_name: 'Oven', category: 'Kitchen', target_amount: 900, months: 3, partner_id: b.id, my_pct: 50 });
  const oven = r.data;
  const meA = oven?.members?.find((m) => m.isMe), themA = oven?.members?.find((m) => !m.isMe);
  check('create a plan with an accepted contact → 201 (900 in 3 months, 50/50)', r.status === 201 && oven.target === 900 && oven.months === 3 && oven.category === 'Kitchen', show(r));
  check('… each share is 450, 150/month needed, on track', meA?.target_share === 450 && meA.per_month === 150 && meA.status === 'on_track' && themA?.target_share === 450, JSON.stringify(oven?.members));

  await as(b);
  await call('POST', '/transactions', { kind: 'income', name: 'Smoke salary', amount: 1000, source_id: bCard.id });
  r = await call('GET', '/notifications');
  check('the partner is notified about the new plan', r.data?.some((n) => n.type === 'plan' && n.data?.plan_id === oven.id), show(r));
  r = await call('GET', '/shared');
  check('… and sees it in GET /shared', !!planOf(r, oven.id), show(r));
  const bBefore = await balanceOf(bCard.id);
  r = await call('POST', `/shared-plans/${oven.id}/contribute`, { amount: 1e7, source_id: bCard.id });
  check('contributing more than the card holds → 400 insufficient_funds', r.status === 400 && r.data?.code === 'insufficient_funds', show(r));
  r = await call('POST', `/shared-plans/${oven.id}/contribute`, { amount: 100, source_id: aCard.id });
  check('contributing from someone else\'s card → 404', r.status === 404, show(r));
  r = await call('POST', `/shared-plans/${oven.id}/contribute`, { amount: 100, source_id: bCard.id });
  const bRow = r.data?.members?.find((m) => m.isMe);
  check('the partner contributes 100 from their own card', r.status === 200 && bRow?.saved === 100 && bRow.remaining === 350 && r.data.saved === 100, show(r));
  check('… which lowers their card by 100', same(await balanceOf(bCard.id), bBefore - 100));
  r = await call('DELETE', `/shared-plans/${oven.id}`, { return_to_source_id: bCard.id });
  check('only the creator can delete the plan (403)', r.status === 403, show(r));

  await as(a);
  const aBefore = await balanceOf(aCard.id);
  r = await call('POST', `/shared-plans/${oven.id}/contribute`, { amount: 50, source_id: aCard.id });
  check('the creator contributes 50 from their card', r.status === 200 && r.data.saved === 150 && r.data.pct === 17, show(r));
  r = await call('GET', '/notifications');
  check('the creator was notified about the partner\'s contribution', r.data?.some((n) => n.type === 'plan' && /put .* aside for Oven/.test(n.title)), show(r));
  r = await call('PATCH', `/shared-plans/${oven.id}`, { shares: [{ user_id: a.id, share_pct: 60 }, { user_id: b.id, share_pct: 30 }] });
  check('editing shares that don\'t add up to 100 → 400', r.status === 400, show(r));
  r = await call('PATCH', `/shared-plans/${oven.id}`, { target_amount: 1000, months: 4, shares: [{ user_id: a.id, share_pct: 60 }, { user_id: b.id, share_pct: 40 }] });
  check('edit price, months and shares (60/40) → 200', r.status === 200 && r.data.target === 1000 && r.data.split_mode === 'ratio' && r.data.members.find((m) => m.isMe)?.target_share === 600, show(r));
  r = await call('DELETE', `/shared-plans/${oven.id}`);
  check('deleting without saying where my money goes → 400 return_source_required', r.status === 400 && r.data?.code === 'return_source_required', show(r));
  r = await call('DELETE', `/shared-plans/${oven.id}`, { return_to_source_id: aCard.id });
  check('delete with a card → my 50 comes back to it', r.status === 200 && r.data?.returned?.amount === 50 && same(await balanceOf(aCard.id), aBefore), show(r));
  check('… and the partner\'s 100 goes back to their own card', same(await balanceOf(bCard.id), bBefore));
  check('… the plan is gone', !(await one('select 1 from public.shared_plans where id = $1', [oven.id])));

  // A second plan with money in it, to check what removing the contact does.
  r = await call('POST', '/shared-plans', { item_name: 'Sofa', category: 'More', target_amount: 300, months: 2, partner_id: b.id });
  const sofa = r.data;
  await as(b);
  await call('POST', `/shared-plans/${sofa.id}/contribute`, { amount: 40, source_id: bCard.id });
  await as(a);

  section('Sharing: removing a contact');
  r = await call('POST', '/splits', { target: { type: 'person', user_id: b.id }, title: 'Smoke dinner', category: 'Food', amount: 40, source_id: aCard.id });
  check('split with an accepted contact → 201', r.status === 201, show(r));
  r = await call('POST', '/splits', { target: { type: 'person', user_id: b.id }, title: 'Smoke taxi', category: 'Transport', amount: 20, source_id: aCard.id });
  const [dinner, taxi] = await many("select id from public.split_requests where from_user = $1 and title in ('Smoke dinner', 'Smoke taxi') order by title", [a.id]);
  await as(b);
  r = await call('POST', `/splits/${dinner.id}/accept`, { source_id: bCard.id });
  check('the contact pays one of them', r.status === 200, show(r));
  await as(a);
  const bPreRemove = await balanceOf(bCard.id);
  r = await call('GET', '/shared');
  r = await call('DELETE', `/contacts/${r.data.people[0].id}`);
  check('remove the contact → 204', r.status === 204, show(r));
  check('… gone on both sides', (await contactRows()) === 0);
  const statuses = Object.fromEntries((await many('select id, status from public.split_requests where id = any($1::uuid[])', [[dinner.id, taxi.id]])).map((x) => [x.id, x.status]));
  check('… the paid split stays in history, the pending one is cancelled', statuses[dinner.id] === 'accepted' && statuses[taxi.id] === 'cancelled', JSON.stringify(statuses));
  await as(b);
  r = await call('GET', '/shared');
  check('… the other person no longer sees them', r.data?.people?.length === 0 && r.data.incoming.length === 0, show(r));
  check('… their plan together ended and the 40 went back to the contributor\'s card',
    !(await one('select 1 from public.shared_plans where id = $1', [sofa.id])) && same(await balanceOf(bCard.id), bPreRemove + 40));
  r = await call('POST', `/shared-plans/${sofa.id}/contribute`, { amount: 5, source_id: bCard.id });
  check('… and the plan can\'t be used any more (404)', r.status === 404, show(r));
  r = await call('POST', '/splits', { target: { type: 'person', user_id: a.id }, title: 'Nope', category: 'Food', amount: 10, source_id: bCard.id });
  check('… nor send split requests any more (403)', r.status === 403, show(r));
  r = await call('POST', '/settle', { user_id: a.id, source_id: bCard.id });
  check('… nor settle up (403)', r.status === 403, show(r));

  section('Sharing: groups need acceptance');
  await as(a);
  r = await call('POST', '/groups', { name: 'Smoke flat', emails: [b.email, ghost] });
  const group = r.data;
  check('create a group → 201 with a generic message', r.status === 201 && !!group?.id && /will get an invitation/.test(group.message || ''), show(r));
  r = await call('GET', '/shared');
  let gv = r.data?.groups?.find((g) => g.id === group.id);
  check('only the creator is an active member; both others show as invited, by email only',
    gv?.members?.length === 1 && gv.members[0].user_id === a.id && gv.invited.length === 2
      && gv.invited.some((x) => x.email === b.email.toLowerCase()) && gv.invited.some((x) => x.email === ghost) && gv.invited.every((x) => !('name' in x) && !('user_id' in x)), JSON.stringify(gv));
  r = await call('POST', '/splits', { target: { type: 'group', group_id: group.id }, title: 'Rent', category: 'Bills', amount: 90, source_id: aCard.id });
  check('a group split before anyone joined → 400', r.status === 400, show(r));
  r = await call('POST', '/shared-plans', { item_name: 'Flat TV', category: 'Shopping', target_amount: 400, months: 2, group_id: group.id });
  check('a group plan before anyone else joined → 400', r.status === 400, show(r));

  await as(b);
  r = await call('GET', '/shared');
  check('an invited member doesn\'t see the group yet', !r.data?.groups?.some((g) => g.id === group.id), show(r));
  r = await call('GET', '/notifications');
  check('the group invitation is in the bell with Accept/Decline (action "group")', r.data?.some((n) => n.type === 'invite' && n.action === 'group' && n.data?.group_id === group.id), show(r));
  r = await call('GET', '/invites');
  check('… and in GET /invites (kind "group")', r.data?.incoming?.some((i) => i.kind === 'group' && i.id === group.id && i.group.name === 'Smoke flat'), show(r));
  r = await call('POST', `/groups/${group.id}/accept`);
  check('accept the group → 200', r.status === 200, show(r));
  r = await call('GET', '/shared');
  gv = r.data?.groups?.find((g) => g.id === group.id);
  check('now an active member; the other invite is shown masked to non-owners', gv?.members?.length === 2 && gv.invited.length === 1 && gv.invited[0].email.includes('•••') && !gv.invited[0].canCancel, JSON.stringify(gv));

  await as(a);
  r = await call('POST', '/shared-plans', { item_name: 'Flat TV', category: 'Shopping', target_amount: 400, months: 2, group_id: group.id });
  const gp = r.data;
  check('a group plan with 2 active members → 201, equal shares (200 each)', r.status === 201 && gp.split_mode === 'equal' && gp.members.length === 2 && gp.members.every((m) => m.target_share === 200), show(r));
  r = await call('POST', `/shared-plans/${gp.id}/contribute`, { amount: 20, source_id: aCard.id });
  check('the owner puts 20 aside for the group plan', r.status === 200, show(r));
  r = await call('POST', '/splits', { target: { type: 'group', group_id: group.id }, title: 'Smoke rent', category: 'Bills', amount: 90, source_id: aCard.id });
  check('a group split goes to active members only (1 request, 45 each)', r.status === 201 && r.data.count === 1 && r.data.share === 45, show(r));

  section('Sharing: invitations to addresses without an account');
  const c = await createUser('ghost', ghost); users.push(c);
  await tx((cl) => claimInvites(cl, c.id, ghost));
  const claimed = await one("select count(*) as n from public.contact_invites where to_email = $1 and to_user = $2 and status = 'pending'", [ghost, c.id]);
  const gm = await one('select status from public.group_members where group_id = $1 and user_id = $2', [group.id, c.id]);
  check('signing up claims the contact invite and the group invite', claimed.n === 1 && gm?.status === 'invited', JSON.stringify({ claimed, gm }));
  check('… with a notification for each', (await inviteNotes(c.id)) === 2);
  r = await call('DELETE', `/groups/${group.id}/invites?email=${encodeURIComponent(ghost)}`);
  check('the owner can cancel a pending group invitation by email (204)', r.status === 204 && !(await one('select 1 from public.group_members where group_id = $1 and user_id = $2', [group.id, c.id])), show(r));

  section('Sharing: leaving and removing members');
  await as(b);
  const bBeforeGroup = await balanceOf(bCard.id);
  r = await call('POST', `/shared-plans/${gp.id}/contribute`, { amount: 30, source_id: bCard.id });
  check('an active member contributes to the group plan', r.status === 200 && r.data.saved === 50, show(r));
  r = await call('POST', `/groups/${group.id}/leave`);
  check('leave the group → 200', r.status === 200, show(r));
  const rent = await one("select status from public.split_requests where group_id = $1 and title = 'Smoke rent'", [group.id]);
  const inPlan = await one('select 1 from public.shared_plan_members where plan_id = $1 and user_id = $2', [gp.id, b.id]);
  check('… their pending group split is cancelled and they leave the plan', rent?.status === 'cancelled' && !inPlan, JSON.stringify({ rent, inPlan }));
  check('… with their 30 back on their own card', same(await balanceOf(bCard.id), bBeforeGroup));
  const left = await many('select share_pct from public.shared_plan_members where plan_id = $1', [gp.id]);
  check('… and the owner\'s share scaled back up to 100%', left.length === 1 && Number(left[0].share_pct) === 100, JSON.stringify(left));
  r = await call('GET', '/shared');
  check('… and the group is gone from their page', !r.data?.groups?.some((g) => g.id === group.id), show(r));
  await as(a);
  r = await call('POST', `/groups/${group.id}/invite`, { emails: [b.email] });
  check('the owner can invite them again (202)', r.status === 202, show(r));
  await as(b);
  await call('POST', `/groups/${group.id}/accept`);
  await as(a);
  r = await call('DELETE', `/groups/${group.id}/members/${b.id}`);
  check('the owner can remove a member (204)', r.status === 204, show(r));
  await as(b);
  r = await call('POST', '/splits', { target: { type: 'group', group_id: group.id }, title: 'Nope', category: 'Bills', amount: 10, source_id: bCard.id });
  check('a removed member can\'t send group splits (403)', r.status === 403, show(r));
  r = await call('DELETE', `/groups/${group.id}/members/${a.id}`);
  check('a non-member can\'t remove anyone (404)', r.status === 404, show(r));

  section(`Sharing: at most ${INVITES_PER_DAY} invitations a day`);
  await as(a);
  const sent = Number((await one("select count(*) as n from public.invite_sends where user_id = $1 and created_at > now() - interval '1 day'", [a.id])).n);
  let lastOk = null;
  for (let i = sent; i < INVITES_PER_DAY; i++) lastOk = await call('POST', '/contacts', { email: `smoke+quota${i}-${crypto.randomBytes(3).toString('hex')}@example.test` });
  check(`invitations up to ${INVITES_PER_DAY} are accepted`, lastOk === null || lastOk.status === 202, lastOk && show(lastOk));
  r = await call('POST', '/contacts', { email: `smoke+one-too-many@example.test` });
  check('the next one → 429 invite_limit', r.status === 429 && r.data?.code === 'invite_limit', show(r));
  r = await call('POST', '/groups', { name: 'Too many', emails: [`smoke+x1@example.test`] });
  check('group invitations count too (429)', r.status === 429, show(r));
}

/** Budgets for any period: the current period's dates, what counts as spent, alerts once per period. */
async function budgetPeriodChecks(me, today, card) {
  const [y, m] = today.split('-');
  const monthStart = `${y}-${m}-01`;
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const monday = addDays(today, -dow);
  const created = [];
  const make = async (body) => {
    const before = new Set(created);
    const res = await call('POST', '/budgets', { category: 'Coffee', alert_threshold: 80, ...body });
    const b = Array.isArray(res.data) ? res.data.find((x) => x.name === body.name && !before.has(x.id)) : null;
    if (b) created.push(b.id);
    return { res, b };
  };
  const list = async () => (await call('GET', '/budgets')).data || [];
  const find = async (id) => (await list()).find((b) => b.id === id);
  let r;

  section('Budgets: periods');
  const month = await make({ name: 'Smoke month', limit_amount: 500 });
  check('no period → a monthly budget (201)', month.res.status === 201 && month.b?.period === 'month', show(month.res));
  check(`… over this calendar month (${monthStart} – ${monthEnd})`, month.b?.period_start === monthStart && month.b?.period_end === monthEnd && month.b?.current === true, JSON.stringify(month.b));
  check('… with limit_amount (no more monthly_limit)', month.b?.limit_amount === 500 && !('monthly_limit' in (month.b || {})), JSON.stringify(month.b));

  const week = await make({ name: 'Smoke week', limit_amount: 10, period: 'week' });
  check(`a week budget runs Monday → Sunday (${monday} – ${addDays(monday, 6)})`, week.b?.period_start === monday && week.b?.period_end === addDays(monday, 6), JSON.stringify(week.b));

  const year = await make({ name: 'Smoke year', limit_amount: 5000, period: 'year' });
  check('a year budget runs Jan 1 → Dec 31', year.b?.period_start === `${y}-01-01` && year.b?.period_end === `${y}-12-31`, JSON.stringify(year.b));

  const anchor = addMonths(monthStart, -4); // blocks: anchor, anchor+3 (contains today), …
  const quarter = await make({ name: 'Smoke quarter', limit_amount: 900, period: 'quarter', start_date: anchor });
  check('a 3-month budget uses the block that contains today', quarter.b?.period_start === addMonths(anchor, 3) && quarter.b?.period_end === addDays(addMonths(anchor, 6), -1), JSON.stringify(quarter.b));
  const q2 = await make({ name: 'Smoke quarter default', limit_amount: 900, period: 'quarter' });
  check('… without a start date it starts on the 1st of this month', q2.b?.start_date === monthStart && q2.b?.period_start === monthStart, JSON.stringify(q2.b));

  r = await call('POST', '/budgets', { category: 'Coffee', name: 'x', limit_amount: 10, period: 'custom' });
  check('custom without dates → 400', r.status === 400, show(r));
  r = await call('POST', '/budgets', { category: 'Coffee', name: 'x', limit_amount: 10, period: 'custom', start_date: today, end_date: today });
  check('custom with end = start → 400', r.status === 400, show(r));
  r = await call('POST', '/budgets', { category: 'Coffee', name: 'x', limit_amount: 10, period: 'fortnight' });
  check('an unknown period → 400', r.status === 400, show(r));
  const custom = await make({ name: 'Smoke custom', limit_amount: 300, period: 'custom', start_date: addDays(today, -1), end_date: addDays(today, 30) });
  check('custom dates are used as they are (inclusive)', custom.b?.period_start === addDays(today, -1) && custom.b?.period_end === addDays(today, 30) && custom.b?.current, JSON.stringify(custom.b));
  const past = await make({ name: 'Smoke past', limit_amount: 300, period: 'custom', start_date: '2024-01-01', end_date: '2024-03-31' });
  check('a custom budget in the past is not current', past.b?.current === false && past.b?.spent === 0, JSON.stringify(past.b));

  let dbErr = null;
  try {
    await query("insert into public.budgets (user_id, category, name, limit_amount, period, start_date, end_date) values ($1, 'Coffee', 'x', 5, 'custom', '2026-02-01', '2026-01-01')", [me.id]);
  } catch (e) { dbErr = e.code; }
  check('the database refuses custom dates with end before start (CHECK)', dbErr === '23514', `code ${dbErr}`);

  section('Budgets: spent in the current period, alerts once per period');
  const spend = (amount, occurred_at) => call('POST', '/transactions', { kind: 'expense', name: 'Smoke coffee', category: 'Coffee', amount, source_id: card.id, ...(occurred_at ? { occurred_at } : {}) });
  r = await spend(9);
  const weekHit = r.data?.budgets?.find((b) => b.id === week.b?.id);
  check('a 9 / 10 expense reports the week budget at 90%', r.status === 201 && weekHit?.pct === 90 && weekHit?.period === 'week', show(r));
  check('… and not the past custom budget', !r.data?.budgets?.some((b) => b.id === past.b?.id), show(r));
  const alerts = (id) => many("select type, title, body, dedupe_key from public.notifications where user_id = $1 and data->>'budget_id' = $2 order by created_at", [me.id, id]);
  let notes = await alerts(week.b.id);
  check('one threshold alert, keyed to this week', notes.length === 1 && notes[0].type === 'budget' && notes[0].dedupe_key === `budget:${week.b.id}:week:${monday}`, JSON.stringify(notes));
  check('… worded with "limit", not "monthly limit"', /limit/.test(notes[0]?.title || '') && !/monthly/i.test(`${notes[0]?.title} ${notes[0]?.body}`), JSON.stringify(notes[0]));
  await spend(2);
  await spend(1);
  notes = await alerts(week.b.id);
  check('going over sends one "over" alert, and only once', notes.filter((n) => n.type === 'over').length === 1 && notes.length === 2, JSON.stringify(notes));
  const w = await find(week.b.id);
  check('the week budget has spent 12 (120%, over)', w?.spent === 12 && w?.pct === 120 && w?.status === 'over', JSON.stringify(w));

  r = await spend(5, addDays(monday, -1)); // last Sunday: outside this week
  const w2 = await find(week.b.id);
  check('an expense dated before this week does not count for the week budget', r.status === 201 && w2?.spent === 12 && !r.data?.budgets?.some((b) => b.id === week.b.id), `${show(r)} / ${JSON.stringify(w2)}`);
  check('the past custom budget stays at 0', (await find(past.b.id))?.spent === 0);

  const sum = await call('GET', '/summary');
  check('the summary counts only budgets of the current periods', sum.data?.budgets?.total === created.length - 1, JSON.stringify(sum.data?.budgets?.total));

  section('Budgets: editing the period');
  r = await call('PATCH', `/budgets/${month.b.id}`, { period: 'custom' });
  check('switching to custom without dates → 400', r.status === 400, show(r));
  r = await call('PATCH', `/budgets/${custom.b.id}`, { end_date: addDays(today, -5) });
  check('a custom end date before its start → 400', r.status === 400, show(r));
  r = await call('PATCH', `/budgets/${custom.b.id}`, { period: 'week' });
  const cw = Array.isArray(r.data) ? r.data.find((b) => b.id === custom.b.id) : null;
  check('custom → week clears the dates', r.status === 200 && cw?.period === 'week' && cw?.start_date === null && cw?.end_date === null && cw?.period_start === monday, show(r));
  r = await call('PATCH', `/budgets/${month.b.id}`, { limit_amount: 600 });
  const mm = Array.isArray(r.data) ? r.data.find((b) => b.id === month.b.id) : null;
  check('changing only the limit keeps the period', mm?.limit_amount === 600 && mm?.period === 'month', show(r));

  for (const id of created) await call('DELETE', `/budgets/${id}`);
  await query("delete from public.transactions where user_id = $1 and name = 'Smoke coffee'", [me.id]);
}

async function main() {
  const server = await startServer();
  const users = [];
  try {
    const me = await createUser('a'); users.push(me);
    const other = await createUser('b'); users.push(other);
    const today = localYmd(new Date(), TZ);

    section('Auth');
    const login = await call('POST', '/auth/login', { email: me.email, password: PASSWORD, remember: false });
    check('log in with email + password', login.status === 200 && !!cookie, show(login));
    jars.set(me.id, cookie);

    const sum0 = await call('GET', '/summary');
    check('GET /summary works and has no archived cards', sum0.status === 200 && Array.isArray(sum0.data.archivedSources) && sum0.data.archivedSources.length === 0, show(sum0));
    const [card1, card2, cash] = sum0.data.sources;

    section('Time zone');
    let r = await call('PATCH', '/me', { timezone: 'Europe/Paris' });
    check('PATCH /me { timezone: Europe/Paris } is saved', r.status === 200 && r.data.timezone === 'Europe/Paris', show(r));
    r = await call('PATCH', '/me', { timezone: 'Mars/Olympus_Mons' });
    check('an unknown time zone is refused (400)', r.status === 400, show(r));
    await call('PATCH', '/me', { timezone: TZ });

    section('Transaction dates');
    const base = { kind: 'income', name: 'Smoke income', amount: 200, source_id: card1.id };
    r = await call('POST', '/transactions', { ...base, occurred_at: '1999-12-31' });
    check('a date before 2000 → 400', r.status === 400, show(r));
    r = await call('POST', '/transactions', { ...base, occurred_at: addDays(today, 3) });
    check('a date 3 days in the future → 400', r.status === 400, show(r));
    r = await call('POST', '/transactions', { ...base, occurred_at: '2026-02-30' });
    check('an impossible date (Feb 30) → 400', r.status === 400, show(r));
    r = await call('POST', '/transactions', { ...base, occurred_at: 'yesterday-ish' });
    check('a non-date string → 400', r.status === 400, show(r));
    r = await call('POST', '/transactions', { ...base, occurred_at: addDays(today, -2) });
    check('a valid date (2 days ago) → 201', r.status === 201, show(r));
    r = await call('POST', '/transactions', { ...base, occurred_at: today });
    check('today → 201', r.status === 201, show(r));
    const incomeTx = r.data?.transaction;

    section('Removed features are gone');
    r = await call('GET', '/export.csv');
    check('GET /export.csv → 404', r.status === 404, show(r));
    r = await call('POST', `/transactions/${incomeTx.id}/receipt`, {});
    check('POST /transactions/:id/receipt → 404', r.status === 404, show(r));
    r = await call('GET', `/transactions/${incomeTx.id}/receipt`);
    check('GET /transactions/:id/receipt → 404', r.status === 404, show(r));
    r = await call('POST', '/auth/change-password', { current_password: PASSWORD, new_password: STRONG, confirm_password: STRONG });
    check('POST /auth/change-password → 404', r.status === 404, show(r));
    r = await call('DELETE', `/transactions/${incomeTx.id}`);
    check('deleting a transaction still works (204)', r.status === 204, show(r));

    await budgetPeriodChecks(me, today, card1);

    section('Goals: deleting gives deposits back');
    r = await call('POST', '/goals', { name: 'Smoke goal', target: 500, initial_saved: 30 });
    const goal = r.data?.find((g) => g.name === 'Smoke goal');
    check('create a goal', r.status === 201 && !!goal, show(r));
    const before = await balanceOf(card1.id);
    r = await call('POST', `/goals/${goal.id}/contribute`, { amount: 40, source_id: card1.id });
    const g1 = r.data?.find((g) => g.id === goal.id);
    check('contribute 40 → saved 70, deposited 40', r.status === 200 && g1?.saved === 70 && g1?.deposited === 40, show(r));
    check('card balance drops by 40', (await balanceOf(card1.id)) === before - 40);
    r = await call('DELETE', `/goals/${goal.id}`);
    check('delete without return_to_source_id → 400 return_source_required', r.status === 400 && r.data?.code === 'return_source_required', show(r));
    r = await call('DELETE', `/goals/${goal.id}`, { return_to_source_id: crypto.randomUUID() });
    check('delete with someone else\'s / unknown card → 404', r.status === 404, show(r));
    r = await call('DELETE', `/goals/${goal.id}`, { return_to_source_id: card1.id });
    check('delete with a card → 200, returned 40 (not the 30 initial_saved)', r.status === 200 && r.data?.returned?.amount === 40, show(r));
    check('card balance is back where it started', (await balanceOf(card1.id)) === before, `${await balanceOf(card1.id)} vs ${before}`);
    const refund = await one(`select kind, category, amount from public.transactions where user_id = $1 and name = 'Returned from Smoke goal'`, [me.id]);
    check('an income "Returned from Smoke goal" (Savings) was logged', refund?.kind === 'income' && refund?.category === 'Savings' && refund?.amount === 40, JSON.stringify(refund));
    r = await call('GET', '/goals');
    check('the goal is gone', r.status === 200 && !r.data.some((g) => g.id === goal.id));
    r = await call('POST', '/goals', { name: 'Empty goal', target: 100, initial_saved: 10 });
    const empty = r.data?.find((g) => g.name === 'Empty goal');
    r = await call('DELETE', `/goals/${empty.id}`);
    check('a goal without deposits is deleted directly (204)', r.status === 204, show(r));
    r = await call('DELETE', `/goals/${empty.id}`);
    check('deleting it again → 404', r.status === 404, show(r));

    section('Cards: archive instead of erasing history');
    r = await call('POST', '/sources', { name: 'Smoke card', kind: 'debit', starting_balance: 10 });
    const smoke = r.data;
    check('create a card', r.status === 201 && !!smoke?.id, show(r));
    r = await call('POST', '/transactions', { kind: 'expense', name: 'Smoke coffee', category: 'Coffee', amount: 4, source_id: smoke.id });
    check('spend on it', r.status === 201, show(r));
    r = await call('DELETE', `/sources/${smoke.id}`);
    check('delete a card with history → 409 source_has_history, count 1', r.status === 409 && r.data?.code === 'source_has_history' && r.data?.count === 1, show(r));
    r = await call('DELETE', `/sources/${smoke.id}?archive=true`);
    check('?archive=true → 200 archived', r.status === 200 && r.data?.archived === true && !!r.data.source?.archived_at, show(r));
    r = await call('GET', '/summary');
    check('archived card is not in summary.sources', !r.data.sources.some((s) => s.id === smoke.id));
    check('… but is in summary.archivedSources with its balance (6)', r.data.archivedSources.some((s) => s.id === smoke.id && s.balance === 6), JSON.stringify(r.data.archivedSources));
    const allBalances = [...r.data.sources, ...r.data.archivedSources].reduce((a, s) => a + s.balance, 0);
    check('… and still counts in totals.available', Math.abs(r.data.totals.available - allBalances) < 0.005, `${r.data.totals.available} vs ${allBalances}`);
    r = await call('GET', `/transactions?source=${smoke.id}`);
    check('its history is still listed (source.archived = true)', r.status === 200 && r.data.length === 1 && r.data[0].source?.archived === true, show(r));
    r = await call('POST', '/transactions', { kind: 'expense', name: 'Nope', category: 'Coffee', amount: 1, source_id: smoke.id });
    check('new transactions on an archived card → 400 source_archived', r.status === 400 && r.data?.code === 'source_archived', show(r));
    r = await call('POST', `/sources/${smoke.id}/restore`);
    check('POST /sources/:id/restore → 200', r.status === 200 && r.data?.archived_at === null, show(r));
    r = await call('GET', '/summary');
    check('restored card is back in summary.sources', r.data.sources.some((s) => s.id === smoke.id));
    r = await call('DELETE', `/sources/${card2.id}`);
    check('a card without transactions is deleted (204)', r.status === 204, show(r));
    r = await call('DELETE', `/sources/${crypto.randomUUID()}`);
    check('unknown card id → 404', r.status === 404, show(r));
    r = await call('DELETE', `/sources/${other.id}`);
    check('another user\'s id → 404', r.status === 404, show(r));
    await call('DELETE', `/sources/${cash.id}`);
    await call('DELETE', `/sources/${smoke.id}?archive=true`);
    r = await call('DELETE', `/sources/${card1.id}?archive=true`);
    check('archiving the last active card → 400 (keep one)', r.status === 400, show(r));
    await call('POST', `/sources/${smoke.id}/restore`);

    section('404 for unknown ids');
    const u = crypto.randomUUID();
    for (const [m, p] of [['DELETE', `/budgets/${u}`], ['PATCH', `/budgets/${u}`], ['DELETE', `/subscriptions/${u}`], ['DELETE', `/transactions/${u}`],
      ['DELETE', '/transactions/not-a-uuid'], ['POST', `/notifications/${u}/read`], ['DELETE', `/contacts/${u}`], ['DELETE', `/groups/${u}`],
      ['POST', `/splits/${u}/decline`], ['PATCH', `/shared-plans/${u}`], ['POST', `/shared-plans/${u}/contribute`], ['DELETE', `/shared-plans/${u}`], ['POST', `/invites/${u}/accept`], ['POST', `/invites/${u}/decline`],
      ['DELETE', `/invites/${u}`], ['POST', `/groups/${u}/accept`], ['POST', `/groups/${u}/decline`], ['POST', `/groups/${u}/leave`]]) {
      r = await call(m, p, p.endsWith('/contribute') ? { amount: 1, source_id: u } : m === 'PATCH' ? { name: 'x' } : undefined);
      check(`${m} ${p.replace(u, ':uuid')} → 404`, r.status === 404, show(r));
    }

    section('Same-user integrity (database)');
    const theirCard = await one('select id from public.sources where user_id = $1 limit 1', [other.id]);
    let fkErr = null;
    try {
      await query(`insert into public.transactions (user_id, source_id, kind, name, category, amount) values ($1, $2, 'expense', 'x', 'More', 1)`, [me.id, theirCard.id]);
    } catch (e) { fkErr = e.code; }
    check('a transaction on another user\'s card is rejected by a foreign key', fkErr === '23503', `got ${fkErr}`);
    let ckErr = null;
    try {
      await query(`insert into public.transactions (user_id, source_id, kind, name, category, amount) values ($1, $2, 'expense', 'x', 'Spaceships', 1)`, [me.id, card1.id]);
    } catch (e) { ckErr = e.code; }
    check('an unknown category is rejected by a CHECK constraint', ckErr === '23514', `got ${ckErr}`);

    await passwordChecks(users);
    await as(me);
    await sharingChecks(me, other, users, card1);
    await as(me);

    section('Transaction pooler safety (no session state)');
    let st = await tx((c) => one("select current_setting('statement_timeout') as st, current_setting('idle_in_transaction_session_timeout') as it", [], c));
    check('a transaction gets statement_timeout 15s / idle-in-transaction 20s (SET LOCAL)', st?.st === '15s' && st?.it === '20s', JSON.stringify(st));
    let toErr = null;
    try { await tx((c) => query('select pg_sleep(2)', [], c), { statementTimeout: 300 }); } catch (e) { toErr = e.code; }
    check('a statement over the transaction limit is cancelled (57014)', toErr === '57014', `got ${toErr}`);
    r = await call('GET', '/summary');
    check('the pool still works after a cancelled statement', r.status === 200, show(r));
    const [l1, l2] = await Promise.all([
      tx((c) => one('select pg_try_advisory_xact_lock(424242) as ok, pg_sleep(1)', [], c)),
      tx((c) => one('select pg_sleep(0.1), pg_try_advisory_xact_lock(424242) as ok', [], c))
    ]);
    check('pg_try_advisory_xact_lock: only one of two concurrent transactions gets it', [l1.ok, l2.ok].filter(Boolean).length === 1, JSON.stringify([l1.ok, l2.ok]));
    const l3 = await tx((c) => one('select pg_try_advisory_xact_lock(424242) as ok', [], c));
    check('… and it is released when the transaction ends', l3.ok === true);

    section('Subscriptions: background job, no double charges');
    r = await call('POST', '/subscriptions', { name: 'Smoke Due Today', price: 3, next_renewal: today, source_id: card1.id });
    const dueToday = r.data?.find((s) => s.name === 'Smoke Due Today');
    check('a subscription due today is charged once on create', r.status === 201 && (await charges(dueToday.id)) === 1, show(r));
    r = await call('POST', '/subscriptions', { name: 'Smoke Stream', price: 9.5, next_renewal: addDays(today, 10), source_id: card1.id });
    const sub = r.data?.find((s) => s.name === 'Smoke Stream');
    check('create a subscription renewing in 10 days', r.status === 201 && !!sub && sub.days === 10, show(r));
    const yesterday = addDays(today, -1);
    await query('update public.subscriptions set next_renewal = $1 where id = $2', [yesterday, sub.id]);
    await call('GET', '/subscriptions'); await call('GET', '/summary'); await call('GET', '/notifications');
    check('GET /subscriptions, /summary, /notifications charge nothing', (await charges(sub.id)) === 0);

    // Another "instance" holds the job lock in an open transaction (as the job itself does).
    const holder = await pool.connect();
    let blocked;
    try {
      await holder.query('begin');
      const got = (await holder.query('select pg_try_advisory_xact_lock($1) as ok', [JOB_LOCK])).rows[0].ok;
      check('the test can take the job lock (transaction-level)', got === true);
      blocked = await runSubscriptionJob();
    } finally {
      await holder.query('rollback').catch(() => {});
      holder.release();
    }
    check('while another instance holds the advisory lock, the job skips', blocked?.skipped === true, JSON.stringify(blocked));

    const run1 = await runSubscriptionJob();
    check('job run 1 charges the due renewal', !run1.skipped && (await charges(sub.id)) === 1, JSON.stringify(run1));
    const after1 = await one('select next_renewal from public.subscriptions where id = $1', [sub.id]);
    check('next_renewal moved forward one month', after1.next_renewal > today, after1.next_renewal);
    await runSubscriptionJob();
    check('job run 2 → still exactly one charge', (await charges(sub.id)) === 1);
    await query('update public.subscriptions set next_renewal = $1 where id = $2', [yesterday, sub.id]);
    await runSubscriptionJob();
    check('replaying the same period (next_renewal reset) → still one charge (unique index)', (await charges(sub.id)) === 1);
    const [a, b] = await Promise.all([runSubscriptionJob(), runSubscriptionJob()]);
    check('two jobs at once → still one charge', (await charges(sub.id)) === 1, JSON.stringify([a, b]));
    const chargeRow = await one('select amount, category, subscription_period from public.transactions where subscription_id = $1', [sub.id]);
    check('the charge is a 9.5 Bills expense for that period', chargeRow?.amount === 9.5 && chargeRow?.category === 'Bills' && chargeRow?.subscription_period === yesterday, JSON.stringify(chargeRow));

    const remindDate = addDays(today, 2);
    await query('update public.subscriptions set next_renewal = $1 where id = $2', [remindDate, sub.id]);
    await runSubscriptionJob();
    const reminder = await one('select title from public.notifications where user_id = $1 and dedupe_key = $2', [me.id, `sub:${sub.id}:${remindDate}`]);
    check('the job sends the 3-day reminder ("renews in 2 days")', /renews in 2 days/.test(reminder?.title || ''), JSON.stringify(reminder));
    await runSubscriptionJob();
    const reminders = await many('select id from public.notifications where user_id = $1 and dedupe_key = $2', [me.id, `sub:${sub.id}:${remindDate}`]);
    check('… only once', reminders.length === 1);
  } finally {
    section('Cleanup');
    for (const u of users) {
      // Deleting the account cascades to everything it owns (this also checks the FKs allow it).
      try { await query('delete from public.users where id = $1', [u.id]); console.log(`  removed ${u.email}`); }
      catch (e) { failed++; console.log(`  ✗ could not delete ${u.email}: ${e.message}`); }
    }
    server.kill();
  }
}

main()
  .catch((e) => { failed++; console.error(`\nSmoke test crashed: ${e.stack || e.message}`); })
  .finally(async () => {
    await pool.end();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
  });
