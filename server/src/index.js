import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { pool, isDbUnavailable } from './db.js';
import { HttpError } from './lib/util.js';
import { scheduleCleanup } from './lib/cleanup.js';
import { scheduleSubscriptionJob } from './jobs/subscriptions.js';
import { requireAuth } from './auth.js';
import auth from './routes/auth.js';
import me from './routes/me.js';
import summary from './routes/summary.js';
import transactions from './routes/transactions.js';
import budgets from './routes/budgets.js';
import subscriptions from './routes/subscriptions.js';
import goals from './routes/goals.js';
import shared from './routes/shared.js';
import plans from './routes/plans.js';
import notifications from './routes/notifications.js';
import demo from './routes/demo.js';
import analytics from './routes/analytics.js';

const PROD = process.env.NODE_ENV === 'production';
const app = express();
// The React app's origin(s), e.g. https://spendsmart.vercel.app. Only these may call the API with cookies.
const origins = (process.env.CLIENT_ORIGIN || (PROD ? '' : 'http://localhost:5173'))
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
if (PROD && !origins.length)
  console.warn('[config] CLIENT_ORIGIN is empty: cross-origin browser calls will be refused.');

app.disable('x-powered-by');
/*
 * Proxies in front of the API (Render's load balancer, and Vercel when /api is rewritten there) add
 * the client's address to X-Forwarded-For. `trust proxy` = how many of those hops to believe, so that
 * req.ip (used by the rate limiters) is the real client and not the proxy. Production default: 1.
 * Set TRUST_PROXY to override (a hop count, or e.g. "loopback"); LOG_CLIENT_IP=1 logs what's seen.
 */
const trustProxy = process.env.TRUST_PROXY || (PROD ? '1' : '');
if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
if (process.env.LOG_CLIENT_IP) {
  app.use('/api', (req, _res, next) => {
    console.log(
      `[ip] ${req.method} ${req.originalUrl} ip=${req.ip} x-forwarded-for=${req.get('x-forwarded-for') || '-'}`
    );
    next();
  });
}
// Requests without an Origin header (same-origin GETs, curl, health checks) aren't affected by CORS.
app.use(cors({ origin: origins, credentials: true }));
// gzip for API answers and the built client (text over ~1 kB; images and fonts are already compressed).
app.use(compression());

/**
 * No request may hang: after REQUEST_TIMEOUT_MS the client gets a 503 JSON answer, even if the
 * handler is still waiting on something. (Whatever the handler does later is ignored: the error
 * handler below skips responses that were already sent.) The client gives up after 30 s, so this
 * answers first.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 25000;
app.use('/api', (req, res, next) => {
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    console.warn(`[timeout] ${req.method} ${req.originalUrl} took over ${REQUEST_TIMEOUT_MS / 1000} s`);
    res.status(503).json({ error: 'The server took too long. Please try again.', code: 'timeout' });
  }, REQUEST_TIMEOUT_MS);
  const done = () => clearTimeout(timer);
  res.on('finish', done);
  res.on('close', done);
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: '200kb' }));

/**
 * Defence in depth against cross-site requests riding on the session cookie (sameSite=lax already
 * blocks most): a state-changing request that carries an Origin header must come from the app itself.
 */
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  let host = '';
  try {
    host = new URL(origin).host;
  } catch {
    /* malformed */
  }
  if (origins.includes(origin) || host === req.get('host')) return next();
  res.status(403).json({ error: 'Request blocked: unexpected origin' });
});

// Liveness check for Render (healthCheckPath): answers without touching the database.
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);

const api = express.Router();
api.use(requireAuth);
for (const r of [
  me,
  summary,
  transactions,
  budgets,
  subscriptions,
  goals,
  shared,
  plans,
  notifications,
  demo,
  analytics,
])
  api.use(r);
app.use('/api', api);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// The API doesn't need the React build: in production Vercel serves it. When client/dist exists
// (local `npm run build` + `npm start`), it's served from here as well, on the same origin.
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  // Files in /assets have a content hash in their name, so they can be cached forever; a new build
  // gets new names. Other files (favicon, robots.txt) are revalidated after an hour.
  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, file) {
        const hashed = /[\\/]assets[\\/]/.test(file); // file is an OS path (\ on Windows)
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      },
    })
  );
  // index.html must always be revalidated, so a deploy is picked up on the next visit.
  app.get('*', (_req, res) => res.sendFile(`${dist}/index.html`, { headers: { 'Cache-Control': 'no-cache' } }));
}

/** Postgres errors caused by bad input become 4xx with a readable message; the rest are 500s. */
function pgStatus(err) {
  switch (err.code) {
    case '22P02':
      return [400, 'Invalid id or value']; // invalid_text_representation (e.g. a non-uuid id)
    case '22003':
      return [400, 'That number is too large'];
    case '22007':
    case '22008':
      return [400, 'Invalid date'];
    case '23505':
      return [409, 'That already exists'];
    case '23503':
      return [400, 'Something it refers to no longer exists'];
    case '23514':
      return [400, "That value isn't allowed"];
    case '23502':
      return [400, 'A required value is missing'];
    default:
      return null;
  }
}

app.use((err, req, res, _next) => {
  // Already answered (e.g. by the request timeout): just log what happened afterwards.
  if (res.headersSent) {
    console.error(`[after response] ${req.method} ${req.originalUrl}: ${err.message}`);
    return;
  }
  // The database couldn't be reached, or a query hit statement_timeout / the idle-in-transaction limit.
  if (isDbUnavailable(err) || err.code === '57014' || err.code === '25P03') {
    console.error(`[db] ${req.method} ${req.originalUrl}: ${err.code || ''} ${err.message}`);
    return res.status(503).json({ error: 'The server took too long. Please try again.', code: 'db_unavailable' });
  }
  const pg = typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? pgStatus(err) : null;
  if (pg) return res.status(pg[0]).json({ error: pg[1] });
  const status = err.status || err.statusCode || 500;
  // An HttpError is a deliberate answer (e.g. 502 email_send_failed): its message is safe to show.
  const deliberate = err instanceof HttpError;
  if (status >= 500 && !deliberate) {
    console.error(err);
    return res.status(status).json({ error: 'Something went wrong' });
  }
  res.status(status).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.extra || {}) });
});

// Render (and most hosts) give the port in PORT.
const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, () => console.log(`SpendSmart API on port ${port}`));

// Report the database connection up front instead of on the first request.
pool
  .query('select 1')
  .then(
    () => console.log('Connected to Postgres'),
    (e) => console.error(`Could not connect to Postgres (${e.message}). Check DATABASE_URL in server/.env.`)
  )
  .finally(() => {
    /*
     * Background jobs run once now and then every hour. On Render's free plan the server sleeps when
     * idle, so the hourly timer may never fire: the run at each (re)start catches up instead (the
     * subscription job charges every period that came due while asleep, at most once each). They're
     * scheduled even if the check above failed; each run reports its own errors and the next retries.
     */
    scheduleCleanup();
    scheduleSubscriptionJob();
  });

const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
