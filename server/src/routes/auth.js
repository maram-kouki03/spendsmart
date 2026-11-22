import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { ah, HttpError } from '../lib/util.js';
import { createStarterSources } from '../lib/finance.js';
import { claimInvites } from '../lib/sharing.js';
import { newPasswordProblem } from '../lib/passwordRules.js';
import { sendMail, sendVerificationCode } from '../lib/mailer.js';
import { requireAuth, issueSession, clearSession, publicUser } from '../auth.js';

const r = Router();
const COST = 12;
const RESET_TTL_MS = 60 * 60 * 1000; // reset links work for 1 hour
const CODE_TTL_MIN = 15; // email confirmation codes work for 15 minutes
const RESEND_COOLDOWN_S = 60; // at most one new code per minute per sign-up
const MAX_CODE_ATTEMPTS = 5; // wrong tries before a code stops working
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const WRONG = 'Wrong email or password.';
const TAKEN = 'An account with this email already exists — log in instead.';

const appUrl = () => (process.env.APP_URL || (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// ---- validation ----
const email = z.string({ required_error: 'Enter your email address.' }).trim().toLowerCase()
  .min(1, 'Enter your email address.').max(254, "That email address doesn't look right.").email("That email address doesn't look right.");
// A new password's shape only; its strength is checked by assertNewPassword (lib/passwordRules.js).
const password = z.string({ required_error: 'Enter a password.', invalid_type_error: 'Enter a password.' });
const confirmField = z.unknown().optional();
const remember = z.boolean().optional().default(true);

/** Like util.parse, but returns just the human message (these are shown on the auth screens). */
function check(schema, input) {
  const res = schema.safeParse(input ?? {});
  if (!res.success) throw new HttpError(400, res.error.issues[0].message, 'validation_error');
  return res.data;
}

/**
 * Every place that SETS a password (sign-up, reset, change, Google accounts adding one) goes
 * through this: the shared rules, then the confirmation. 400 weak_password / password_mismatch.
 * Never used at log-in, so older passwords keep working.
 */
function assertNewPassword(pw, confirm, ctx) {
  const bad = newPasswordProblem(pw, confirm, ctx);
  if (bad) throw new HttpError(400, bad.message, bad.code);
}

// ---- rate limits (per IP) ----
const limiter = (windowMin, limit, extra = {}) => rateLimit({
  windowMs: windowMin * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many attempts — please wait a few minutes and try again.', code: 'rate_limited' }),
  ...extra
});
const loginLimit = limiter(15, 10, { skipSuccessfulRequests: true }); // 10 failed logins / 15 min
const registerLimit = limiter(60, 10);
const forgotLimit = limiter(15, 5);
const resetLimit = limiter(15, 20);
const googleLimit = limiter(15, 30);
const verifyLimit = limiter(15, 30); // on top of the 5-tries-per-code rule
const resendLimit = limiter(15, 10);

// A real hash to compare against when the email is unknown, so both cases take the same time.
let dummyHash;
const getDummyHash = () => (dummyHash ||= bcrypt.hash(crypto.randomBytes(16).toString('hex'), COST));

/**
 * Inside transaction `c`: creates a confirmed user + profile + three starter sources, and removes
 * any sign-up that was waiting for the same address.
 */
async function insertAccount(c, { email: addr, full_name, password_hash = null, google_id = null }) {
  const u = await one(
    `insert into public.users (email, password_hash, full_name, google_id, email_verified_at)
     values ($1, $2, $3, $4, now()) returning *`,
    [addr, password_hash, full_name, google_id], c
  );
  await query('insert into public.profiles (id, full_name, email) values ($1, $2, $3)', [u.id, full_name, addr], c);
  await createStarterSources(u.id, c);
  await claimInvites(c, u.id, addr);
  await query('delete from public.pending_signups where email = $1', [addr], c);
  return u;
}

/** insertAccount in its own transaction (Google sign-in). */
async function createAccount(fields) {
  try {
    return await tx((c) => insertAccount(c, fields));
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, TAKEN, 'email_taken');
    throw e;
  }
}

// ---- sign-ups waiting for their email code (public.pending_signups) ----

const SEND_FAILED = "We couldn't send the confirmation email. Please try again in a moment.";
/** Codes are hashed together with the address, so equal codes for two sign-ups never share a hash. */
const codeHash = (addr, code) => sha256(`${addr}:${code}`);

/**
 * Emails the code. Never call this inside a transaction: the row is saved and committed first,
 * then the email goes out, and `undo` (a separate short query) runs if sending fails. On failure
 * throws a 502 `email_send_failed` (the mailer has logged why, including timeouts).
 */
async function sendCodeOrUndo(addr, name, code, undo) {
  try {
    await sendVerificationCode({ to: addr, name, code, minutes: CODE_TTL_MIN });
  } catch {
    await undo().catch((e) => console.error(`[signup] Could not undo the pending sign-up for ${addr}:`, e.message));
    throw new HttpError(502, SEND_FAILED, 'email_send_failed');
  }
}

/** Puts back a pending sign-up's previous code/state (only if nobody has changed it since). */
const restorePending = (id, newHash, old) => query(
  `update public.pending_signups
      set full_name = $3, password_hash = $4, code_hash = $5, code_expires_at = $6, attempts = $7, last_sent_at = $8
    where id = $1 and code_hash = $2`,
  [id, newHash, old.full_name, old.password_hash, old.code_hash, old.code_expires_at, old.attempts, old.last_sent_at]
);

/** Seconds before this pending sign-up may get another code (0 = now), or null if there is none. */
async function pendingCooldown(addr, c) {
  const row = await one(
    `select greatest(0, ceil(extract(epoch from (last_sent_at + make_interval(secs => $2)) - now())))::int as seconds_left
       from public.pending_signups where email = $1`,
    [addr, RESEND_COOLDOWN_S], c
  );
  return row ? row.seconds_left : null;
}

/**
 * Gives an existing pending sign-up a new code (and 5 fresh tries) and emails it, unless a code
 * went out less than RESEND_COOLDOWN_S ago. The new code is saved in one statement (no transaction
 * is held while the email is sent); if sending fails, the previous code and state are put back, so
 * the previous code stays valid. Returns { sent: true } | { secondsLeft } | { missing: true }.
 */
async function refreshPendingCode(addr) {
  const code = newCode();
  const hash = codeHash(addr, code);
  // The FROM subquery locks the row and hands back its values from before the update.
  const row = await one(
    `update public.pending_signups p
        set code_hash = $2, code_expires_at = now() + make_interval(mins => $3), attempts = 0, last_sent_at = now()
       from (select id, full_name, password_hash, code_hash, code_expires_at, attempts, last_sent_at
               from public.pending_signups where email = $1 for update) old
      where p.id = old.id and old.last_sent_at <= now() - make_interval(secs => $4)
      returning p.id, p.full_name, old.full_name as old_full_name, old.password_hash as old_password_hash,
                old.code_hash as old_code_hash, old.code_expires_at as old_code_expires_at,
                old.attempts as old_attempts, old.last_sent_at as old_last_sent_at`,
    [addr, hash, CODE_TTL_MIN, RESEND_COOLDOWN_S]
  );
  if (!row) {
    const left = await pendingCooldown(addr);
    return left === null ? { missing: true } : { secondsLeft: Math.max(1, left) };
  }
  await sendCodeOrUndo(addr, row.full_name, code, () => restorePending(row.id, hash, {
    full_name: row.old_full_name, password_hash: row.old_password_hash, code_hash: row.old_code_hash,
    code_expires_at: row.old_code_expires_at, attempts: row.old_attempts, last_sent_at: row.old_last_sent_at
  }));
  return { sent: true };
}

const tooSoon = (secondsLeft, message) => new HttpError(429,
  message || `Please wait ${secondsLeft} second${secondsLeft === 1 ? '' : 's'} before asking for a new code.`,
  'resend_too_soon', { secondsLeft });

/**
 * Per-address cooldown for resend requests about emails with no pending sign-up (unknown or
 * already confirmed), so they get the same 429 behaviour as real pending sign-ups and the endpoint
 * doesn't reveal which emails exist. Pending sign-ups use last_sent_at in the database instead.
 */
const resendSeen = new Map();
function phantomCooldown(addr) {
  const now = Date.now();
  if (resendSeen.size > 5000) for (const [k, t] of resendSeen) if (now - t >= RESEND_COOLDOWN_S * 1000) resendSeen.delete(k);
  const last = resendSeen.get(addr);
  const left = last ? Math.ceil((last + RESEND_COOLDOWN_S * 1000 - now) / 1000) : 0;
  if (left <= 0) resendSeen.set(addr, now);
  return Math.max(0, left);
}

// ---- public endpoints ----

r.get('/config', (_req, res) => {
  res.json({ google: Boolean(GOOGLE_CLIENT_ID), googleClientId: GOOGLE_CLIENT_ID || null });
});

/**
 * Stores the sign-up in pending_signups and emails a 6-digit code. Nothing is written to users,
 * profiles or sources until /verify-email succeeds.
 */
r.post('/register', registerLimit, ah(async (req, res) => {
  const body = check(z.object({
    full_name: z.string({ required_error: 'Tell us your name.' }).trim().min(1, 'Tell us your name.').max(80, 'That name is a bit long.'),
    email, password, confirmPassword: confirmField, remember
  }), req.body);
  assertNewPassword(body.password, body.confirmPassword, { email: body.email, name: body.full_name });
  if (await one('select 1 from public.users where email = $1', [body.email])) throw new HttpError(409, TAKEN, 'email_taken');

  const password_hash = await bcrypt.hash(body.password, COST);
  const code = newCode();
  const hash = codeHash(body.email, code);
  // 1. Save and commit (short transaction, database work only).
  const result = await tx(async (c) => {
    // The previous state of a sign-up that's already waiting, to put back if the email fails.
    const old = await one(
      `select full_name, password_hash, code_hash, code_expires_at, attempts, last_sent_at
         from public.pending_signups where email = $1 for update`,
      [body.email], c
    );
    // New sign-up, or a fresh start for one that's waiting — unless its last code is under a minute old.
    const row = await one(
      `insert into public.pending_signups as p (email, full_name, password_hash, code_hash, code_expires_at)
       values ($1, $2, $3, $4, now() + make_interval(mins => $5))
       on conflict (email) do update
          set full_name = excluded.full_name, password_hash = excluded.password_hash,
              code_hash = excluded.code_hash, code_expires_at = excluded.code_expires_at,
              attempts = 0, last_sent_at = now()
        where p.last_sent_at <= now() - make_interval(secs => $6)
       returning id`,
      [body.email, body.full_name, password_hash, hash, CODE_TTL_MIN, RESEND_COOLDOWN_S], c
    );
    if (!row) return { secondsLeft: Math.max(1, await pendingCooldown(body.email, c)) };
    return { id: row.id, old };
  });
  // 2. Then send. If that fails, undo with a separate short query: remove a brand-new sign-up, or
  //    put back the previous code of one that was already waiting.
  if (!result.secondsLeft) {
    await sendCodeOrUndo(body.email, body.full_name, code, () => (result.old
      ? restorePending(result.id, hash, result.old)
      : query('delete from public.pending_signups where id = $1 and code_hash = $2', [result.id, hash])));
  }
  if (result.secondsLeft) {
    const s = result.secondsLeft;
    throw tooSoon(s, `We just sent a code to this email — check your inbox, or wait ${s} second${s === 1 ? '' : 's'} to get a new one.`);
  }
  res.status(201).json({ needsVerification: true, email: body.email, resendIn: RESEND_COOLDOWN_S });
}));

/** Checks the code; on success creates the confirmed account and signs the user in. */
r.post('/verify-email', verifyLimit, ah(async (req, res) => {
  const body = check(z.object({
    email,
    code: z.string({ required_error: 'Enter the 6-digit code from the email.' }).trim()
      .regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
    remember
  }), req.body);
  const addr = body.email;

  let result;
  try {
    result = await tx(async (c) => {
      const row = await one(
        `select id, full_name, password_hash, code_hash, attempts, code_expires_at > now() as live
           from public.pending_signups where email = $1 for update`,
        [addr], c
      );
      // No pending sign-up: either it was just confirmed (double click) or there never was one.
      if (!row) return { fail: (await one('select 1 from public.users where email = $1', [addr], c)) ? 'already' : 'expired' };
      if (row.attempts >= MAX_CODE_ATTEMPTS) return { fail: 'locked' };
      if (!row.live) return { fail: 'expired' };

      const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(codeHash(addr, body.code), 'hex'));
      if (!ok) {
        // Returned (not thrown) so the transaction commits the extra attempt.
        const { attempts } = await one(
          'update public.pending_signups set attempts = attempts + 1 where id = $1 returning attempts', [row.id], c
        );
        return { fail: 'wrong', left: Math.max(0, MAX_CODE_ATTEMPTS - attempts) };
      }
      // User + profile + starter sources, and the pending row is deleted — all or nothing.
      return { user: await insertAccount(c, { email: addr, full_name: row.full_name, password_hash: row.password_hash }) };
    });
  } catch (e) {
    if (e.code !== '23505') throw e;
    result = { fail: 'already' }; // the account was created by a parallel request
  }

  if (result.fail === 'already') throw new HttpError(409, 'This email is already confirmed — log in instead.', 'already_verified');
  if (result.fail === 'expired') throw new HttpError(400, 'This code has expired or is no longer valid — request a new one.', 'code_expired');
  if (result.fail === 'locked') throw new HttpError(400, 'Too many wrong tries — request a new code.', 'too_many_attempts');
  if (result.fail === 'wrong') {
    if (result.left === 0) throw new HttpError(400, 'Too many wrong tries — request a new code.', 'too_many_attempts');
    throw new HttpError(400, `That code isn't right — ${result.left} ${result.left === 1 ? 'try' : 'tries'} left.`, 'invalid_code', { attemptsLeft: result.left });
  }
  issueSession(res, result.user, body.remember);
  const profile = await one('select * from public.profiles where id = $1', [result.user.id]);
  res.json({ user: publicUser(result.user, profile) });
}));

/**
 * Sends a new code for a pending sign-up (max one per minute, attempts reset). The answer is the
 * same whether or not the address has a sign-up waiting.
 */
r.post('/resend-code', resendLimit, ah(async (req, res) => {
  const body = check(z.object({ email }), req.body);
  const generic = { ok: true, message: 'If this email is waiting to be confirmed, a new code is on its way.', resendIn: RESEND_COOLDOWN_S };
  const result = await refreshPendingCode(body.email); // throws 502 email_send_failed if sending fails
  if (result.missing) {
    const left = phantomCooldown(body.email);
    if (left > 0) throw tooSoon(left);
    return res.json(generic);
  }
  if (result.secondsLeft) throw tooSoon(result.secondsLeft);
  res.json(generic);
}));

r.post('/login', loginLimit, ah(async (req, res) => {
  const body = check(z.object({ email, password: z.string({ required_error: 'Enter your password.' }).min(1, 'Enter your password.'), remember }), req.body);
  const user = await one('select * from public.users where email = $1', [body.email]);
  const pending = user ? null : await one('select password_hash from public.pending_signups where email = $1', [body.email]);
  // Exactly one bcrypt comparison on every path, so timing doesn't reveal which case applies.
  const ok = await bcrypt.compare(body.password, user?.password_hash || pending?.password_hash || (await getDummyHash()));

  if (!user && pending && ok) {
    // Right password for a sign-up that isn't confirmed yet: send a fresh code (60 s limit) and
    // let the client show the code screen.
    let sent;
    try {
      sent = await refreshPendingCode(body.email);
    } catch (e) {
      if (e.code !== 'email_send_failed') throw e;
      sent = { failed: true };
    }
    throw new HttpError(403, 'Please confirm your email first.', 'email_not_verified', {
      email: body.email,
      resendIn: sent.sent ? RESEND_COOLDOWN_S : (sent.secondsLeft ?? 0),
      ...(sent.failed ? { emailError: SEND_FAILED } : {})
    });
  }
  // Same message whether the email is unknown, the account is Google-only, or the password is wrong.
  if (!user || !user.password_hash || !ok) throw new HttpError(401, WRONG, 'invalid_credentials');
  issueSession(res, user, body.remember);
  const profile = await one('select * from public.profiles where id = $1', [user.id]);
  res.json({ user: publicUser(user, profile) });
}));

r.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.post('/forgot-password', forgotLimit, ah(async (req, res) => {
  const body = check(z.object({ email }), req.body);
  const user = await one('select id, email from public.users where email = $1', [body.email]);
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    await tx(async (c) => {
      // Only the newest link works.
      await query('update public.password_reset_tokens set used_at = now() where user_id = $1 and used_at is null', [user.id], c);
      await query('insert into public.password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)',
        [user.id, sha256(token), new Date(Date.now() + RESET_TTL_MS)], c);
    });
    const link = `${appUrl()}/reset-password?token=${token}`;
    // Not awaited: the response time shouldn't reveal whether the account exists.
    sendMail({
      to: user.email,
      subject: 'Reset your SpendSmart password',
      text: `Someone (hopefully you) asked to reset your SpendSmart password.\n\nChoose a new one here (the link works for 1 hour):\n${link}\n\nIf it wasn't you, you can ignore this email.`,
      html: `<p>Someone (hopefully you) asked to reset your SpendSmart password.</p><p><a href="${link}">Choose a new password</a> — the link works for 1 hour.</p><p>If it wasn't you, you can ignore this email.</p>`
    }).catch((e) => console.error('Reset email failed:', e.message));
  }
  res.json({ ok: true });
}));

r.post('/reset-password', resetLimit, ah(async (req, res) => {
  const body = check(z.object({
    token: z.string().min(20, 'This reset link is invalid.').max(200, 'This reset link is invalid.'),
    password, confirmPassword: confirmField, remember
  }), req.body);
  const invalid = () => new HttpError(400, 'This reset link is invalid or has expired. Request a new one from the log-in page.');
  // Look the account up first (no lock) so the rules can check its name and email; the token is
  // checked again, and used, inside the transaction below.
  const owner = await one(
    `select u.email, coalesce(nullif(pr.full_name, ''), u.full_name) as full_name
       from public.password_reset_tokens t join public.users u on u.id = t.user_id
       left join public.profiles pr on pr.id = u.id
      where t.token_hash = $1 and t.used_at is null and t.expires_at > now()`,
    [sha256(body.token)]
  );
  if (!owner) throw invalid();
  assertNewPassword(body.password, body.confirmPassword, { email: owner.email, name: owner.full_name });
  const password_hash = await bcrypt.hash(body.password, COST);
  const user = await tx(async (c) => {
    const t = await one(
      `select user_id from public.password_reset_tokens
        where token_hash = $1 and used_at is null and expires_at > now()
        for update`,
      [sha256(body.token)], c
    );
    if (!t) throw invalid();
    await query('update public.password_reset_tokens set used_at = now() where user_id = $1 and used_at is null', [t.user_id], c);
    return one('update public.users set password_hash = $1 where id = $2 returning *', [password_hash, t.user_id], c);
  });
  issueSession(res, user, body.remember);
  res.json({ user: publicUser(user) });
}));

r.post('/google', googleLimit, ah(async (req, res) => {
  if (!GOOGLE_CLIENT_ID) throw new HttpError(404, 'Google sign-in is not enabled');
  const body = check(z.object({ credential: z.string().min(10, 'Google sign-in failed — please try again.'), remember }), req.body);

  const { OAuth2Client } = await import('google-auth-library');
  let p;
  try {
    const ticket = await new OAuth2Client(GOOGLE_CLIENT_ID).verifyIdToken({ idToken: body.credential, audience: GOOGLE_CLIENT_ID });
    p = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Google sign-in failed — please try again.');
  }
  if (!p?.sub || !p.email || !p.email_verified) throw new HttpError(400, 'Your Google account has no verified email address.');
  const addr = p.email.toLowerCase();

  let user = await one('select * from public.users where google_id = $1', [p.sub]);
  if (!user) {
    // Link to an existing (confirmed) account with the same Google-verified email, or create a new one.
    // A sign-up still waiting for its code is dropped when the account is created (insertAccount).
    user = await one(
      'update public.users set google_id = $1 where email = $2 and google_id is null returning *',
      [p.sub, addr]
    );
    if (!user) {
      const other = await one('select id from public.users where email = $1', [addr]);
      if (other) throw new HttpError(409, 'This email is already linked to a different Google account.');
      user = await createAccount({ email: addr, full_name: (p.name || '').slice(0, 80), google_id: p.sub });
    }
  }
  issueSession(res, user, body.remember);
  const profile = await one('select * from public.profiles where id = $1', [user.id]);
  res.json({ user: publicUser(user, profile) });
}));

// ---- signed-in endpoints ----

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

r.post('/change-password', requireAuth, ah(async (req, res) => {
  const body = check(z.object({
    current_password: z.string().optional().default(''), new_password: password, confirm_password: confirmField
  }), req.body);
  const user = await one('select * from public.users where id = $1', [req.user.id]);
  // Same rules whether changing a password or adding one to a Google-only account.
  assertNewPassword(body.new_password, body.confirm_password, { email: user.email, name: req.profile?.full_name || user.full_name });
  if (user.password_hash) {
    if (!body.current_password) throw new HttpError(400, 'Enter your current password.');
    if (!(await bcrypt.compare(body.current_password, user.password_hash))) throw new HttpError(400, 'Your current password is wrong.');
    if (await bcrypt.compare(body.new_password, user.password_hash)) throw new HttpError(400, 'Pick a password different from your current one.');
  }
  const updated = await one('update public.users set password_hash = $1 where id = $2 returning *', [await bcrypt.hash(body.new_password, COST), user.id]);
  // Other sessions are now invalid (the token carries a password fingerprint); keep this one signed in.
  issueSession(res, updated, !!req.auth?.rem);
  await query('update public.password_reset_tokens set used_at = now() where user_id = $1 and used_at is null', [user.id]);
  res.json({ ok: true, user: publicUser(updated, req.profile) });
}));

export default r;
