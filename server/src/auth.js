import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { one, tx } from './db.js';
import { createStarterSources } from './lib/finance.js';

export const COOKIE = 'ss_session';
const PROD = process.env.NODE_ENV === 'production';
const DAY = 86400000;
const JWT_TTL = '7d';
const REMEMBER_MS = 30 * DAY;
const RENEW_AFTER_S = 24 * 3600; // re-sign a token once it's a day old, so active sessions stay alive

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (PROD) {
    console.error('Missing JWT_SECRET. Set a long random value in server/.env.');
    process.exit(1);
  }
  SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('JWT_SECRET is not set: using a temporary secret, so everyone is logged out when the server restarts.');
}

/*
 * In production the browser talks to Vercel, which forwards /api to Render, so the cookie is first-party
 * (same origin as the app) and sameSite 'lax' is enough. `secure` is on in production (HTTPS only).
 * It's off in development, because http://localhost would never send a secure cookie back.
 */
const cookieBase = { httpOnly: true, sameSite: 'lax', secure: PROD, path: '/' };

/**
 * A short fingerprint of the password hash goes into the token, so changing or resetting the
 * password invalidates every other session without needing a sessions table.
 */
const fingerprint = (hash) =>
  crypto
    .createHash('sha256')
    .update(hash || 'no-password')
    .digest('base64url')
    .slice(0, 16);

/** Signs a 7-day JWT and sets it as an httpOnly cookie: a session cookie, or 30 days with "remember me". */
export function issueSession(res, user, remember) {
  const token = jwt.sign({ sub: user.id, rem: remember ? 1 : 0, pf: fingerprint(user.password_hash) }, SECRET, {
    expiresIn: JWT_TTL,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE, token, remember ? { ...cookieBase, maxAge: REMEMBER_MS } : cookieBase);
}

export function clearSession(res) {
  res.clearCookie(COOKIE, cookieBase);
}

/** What the client sees about the signed-in user (never the password hash). */
export function publicUser(u, profile) {
  return {
    id: u.id,
    email: u.email,
    full_name: profile?.full_name ?? u.full_name ?? '',
    google: !!u.google_id,
    email_verified: !!u.email_verified_at,
    created_at: u.created_at,
  };
}

async function loadUser(id) {
  return one(
    `select u.id, u.email, u.full_name, u.password_hash, u.google_id, u.email_verified_at, u.created_at,
            case when p.id is null then null else to_jsonb(p) end as profile
       from public.users u
       left join public.profiles p on p.id = u.id
      where u.id = $1`,
    [id]
  );
}

/**
 * The session behind this request, or null. The cookie holds a JWT (user id, "remember me" flag and
 * a fingerprint of the password hash); it is valid only while the signature checks out, the user
 * still exists and the password hasn't changed since. An invalid cookie is cleared.
 */
export async function loadSession(req, res) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch {
    clearSession(res);
    return null;
  }

  const row = await loadUser(payload.sub);
  if (!row || payload.pf !== fingerprint(row.password_hash)) {
    clearSession(res);
    return null;
  }

  let profile = row.profile;
  if (!profile) {
    // Shouldn't happen (register creates both), but recover rather than lock the user out.
    profile = await tx(async (c) => {
      const p = await one(
        'insert into public.profiles (id, full_name, email) values ($1, $2, $3) on conflict (id) do nothing returning *',
        [row.id, row.full_name, row.email],
        c
      );
      if (p) await createStarterSources(row.id, c);
      return p || one('select * from public.profiles where id = $1', [row.id], c);
    });
  }

  // Sliding renewal: the JWT lasts 7 days from the last day you used the app.
  if (Date.now() / 1000 - payload.iat > RENEW_AFTER_S) issueSession(res, row, !!payload.rem);
  return { payload, row, profile };
}

/** Express middleware: 401 without a valid session, otherwise sets req.auth, req.user and req.profile. */
export async function requireAuth(req, res, next) {
  try {
    const session = await loadSession(req, res);
    if (!session) {
      return res
        .status(401)
        .json({ error: req.cookies?.[COOKIE] ? 'Session expired — please log in again' : 'Not signed in' });
    }
    const { payload, row, profile } = session;
    req.auth = payload;
    req.user = publicUser(row, profile);
    req.profile = profile;
    next();
  } catch (err) {
    next(err);
  }
}
