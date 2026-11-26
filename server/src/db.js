import pg from 'pg';

const { Pool, types } = pg;

// Match the JSON shapes the API has always returned:
// numeric/bigint → JS numbers, date → 'YYYY-MM-DD' strings (timestamps stay Date → ISO in JSON).
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8 (count(*))
types.setTypeParser(1082, (v) => v); // date

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error(
    'Missing DATABASE_URL. Copy server/.env.example to server/.env and paste your Supabase pooler connection string.'
  );
  process.exit(1);
}

/**
 * Works with Supabase's Transaction pooler (port 6543) as well as the Session pooler / a direct
 * connection. In transaction mode every transaction (or single statement outside one) may run on a
 * different server connection, so this code never relies on session state:
 *   - no named prepared statements (pg only creates one when a query passes `name`; nothing does);
 *   - no session-level SET: timeouts are SET LOCAL at the start of each transaction (see tx());
 *   - advisory locks only as pg_try_advisory_xact_lock inside a transaction (released at its end);
 *   - a transaction always runs on one client, from BEGIN to COMMIT/ROLLBACK.
 *
 * SSL is on (Supabase requires it) without certificate verification, because the pooler's
 * certificate chain isn't in Node's default store. `sslmode` in the URL would override the
 * `ssl` object below, so it's stripped. A localhost URL (local Postgres for development) skips SSL.
 */
function poolConfig(url) {
  let connectionString = url;
  let local = false;
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    connectionString = u.toString();
    local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
  } catch {
    /* not a URL — let pg report it */
  }
  const ssl = local || process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false };
  return {
    connectionString,
    ssl,
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30000,
    // Give up on a connection attempt after 10 s instead of waiting forever (an unreachable or
    // silent server used to make every request hang).
    connectionTimeoutMillis: 10000,
    // Client-side limit on every query, inside or outside a transaction: one whose answer never
    // arrives (dead network, or a slow single statement outside a transaction, which has no
    // server-side statement_timeout) fails after 20 s, and its connection is thrown away.
    query_timeout: 20000,
  };
}

/** Server-side limits for every transaction, applied with SET LOCAL by tx(). */
export const STATEMENT_TIMEOUT_MS = 15000;
export const IDLE_IN_TX_TIMEOUT_MS = 20000;

export const pool = new Pool(poolConfig(raw));
pool.on('error', (err) => console.error('Postgres pool error:', err.message));

/** True for errors that mean "the database can't be reached / didn't answer in time". */
export function isDbUnavailable(err) {
  const m = String(err?.message || '');
  return (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      '57P01',
      '57P03',
      '08000',
      '08001',
      '08003',
      '08006',
    ].includes(err?.code) ||
    /timeout exceeded when trying to connect|Connection terminated|Query read timeout|connection timeout/i.test(m)
  );
}

/** Run a parameterized query on the pool, or on `ex` (a transaction client) when given. */
export function query(sql, params = [], ex = pool) {
  return ex.query(sql, params);
}

/** All rows. */
export async function many(sql, params = [], ex = pool) {
  return (await ex.query(sql, params)).rows;
}

/** First row or null. */
export async function one(sql, params = [], ex = pool) {
  return (await ex.query(sql, params)).rows[0] ?? null;
}

/** BEGIN plus the transaction's own limits, in one round trip (SET LOCAL ends with the transaction). */
const beginSql = (statementMs, idleMs) =>
  `begin; set local statement_timeout = ${Math.trunc(statementMs)}; set local idle_in_transaction_session_timeout = ${Math.trunc(idleMs)}`;

/**
 * Run `fn(client)` inside BEGIN/COMMIT on one client; rolls back and rethrows on any error. The
 * client is always released; a broken one (failed ROLLBACK, lost or timed-out connection) is
 * destroyed instead of going back to the pool.
 *
 * The transaction gets statement_timeout 15 s and idle_in_transaction_session_timeout 20 s
 * (SET LOCAL, so it works through the Transaction pooler); pass { statementTimeout, idleTimeout }
 * in ms to change them (0 = no limit, e.g. for migrations).
 *
 * Keep `fn` to database work only: never send email or call another service inside it — that
 * holds a connection and an open transaction for as long as the other side takes.
 */
export async function tx(fn, { statementTimeout = STATEMENT_TIMEOUT_MS, idleTimeout = IDLE_IN_TX_TIMEOUT_MS } = {}) {
  const client = await pool.connect();
  let broken;
  try {
    await client.query(beginSql(statementTimeout, idleTimeout));
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    if (isDbUnavailable(err))
      broken = err; // the connection's state is unknown: don't reuse it
    else
      await client.query('rollback').catch((e) => {
        broken = e;
      });
    throw err;
  } finally {
    client.release(broken);
  }
}

// Identifiers below always come from code (never from requests); the check is a safety net.
const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name) {
  if (!IDENT.test(name)) throw new Error(`Bad SQL identifier: ${name}`);
  return `"${name}"`;
}

/**
 * Builds `"a" = $n, "b" = $n+1` from an object of already-validated fields.
 * Returns { sql, values } or null when there is nothing to set.
 */
export function setClause(fields, startAt = 1) {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (!keys.length) return null;
  return {
    sql: keys.map((k, i) => `${ident(k)} = $${startAt + i}`).join(', '),
    values: keys.map((k) => fields[k]),
  };
}

/**
 * Multi-row INSERT. Columns are the union of the rows' keys; a row missing a column gets DEFAULT.
 * `suffix` is appended verbatim (e.g. 'on conflict do nothing returning *').
 */
export async function insertRows(ex, table, rows, suffix = '') {
  if (!rows.length) return [];
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const values = [];
  const tuples = rows.map(
    (r) =>
      `(${cols
        .map((c) => {
          if (!(c in r) || r[c] === undefined) return 'DEFAULT';
          const v = r[c];
          values.push(v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v);
          return `$${values.length}`;
        })
        .join(', ')})`
  );
  const sql = `insert into ${ident('public')}.${ident(table)} (${cols.map(ident).join(', ')}) values ${tuples.join(', ')} ${suffix}`;
  return (await ex.query(sql, values)).rows;
}
