/**
 * Applies supabase/migrations/*.sql in filename order to DATABASE_URL, each in its own
 * transaction, and records what ran in public.schema_migrations.
 *
 *   npm run db:migrate -w server            apply pending migrations
 *   npm run db:migrate -w server -- --status  list applied / pending without changing anything
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from '../src/db.js';

const DIR = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const LOCK = 727274; // arbitrary advisory-lock key so two runners can't overlap
const statusOnly = process.argv.includes('--status');
const LONG = 30 * 60 * 1000; // migrations may take longer than the app's 15 s / 20 s limits

/**
 * Runs `fn(q)` in one transaction (one client, so it also works through the Transaction pooler)
 * that holds the migration lock (pg_try_advisory_xact_lock, released at COMMIT/ROLLBACK) and has no
 * statement / idle-in-transaction timeout. `q(text, values)` runs a query on that transaction.
 */
function locked(fn) {
  return tx(async (c) => {
    // RAISE NOTICE from a migration (e.g. rows it fixed) is shown on the console.
    // ("… does not exist, skipping" from IF [NOT] EXISTS is noise and left out.)
    const onNotice = (n) => { if (!/, skipping$/.test(n.message)) console.log(`\n  notice: ${n.message}`); };
    c.on('notice', onNotice);
    const q = (text, values) => c.query({ text, values, query_timeout: LONG });
    try {
      if (!(await q('select pg_try_advisory_xact_lock($1) as ok', [LOCK])).rows[0].ok) {
        throw new Error('another migration run is in progress — try again when it has finished');
      }
      await q(`create table if not exists public.schema_migrations (
        filename   text primary key,
        applied_at timestamptz not null default now()
      )`);
      await q('alter table public.schema_migrations enable row level security');
      return await fn(q);
    } finally {
      c.off('notice', onNotice);
    }
  }, { statementTimeout: 0, idleTimeout: 0 });
}

const appliedSet = async (q) => new Set((await q('select filename from public.schema_migrations')).rows.map((r) => r.filename));

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();

  // A database set up before this runner existed (init.sql pasted into the SQL editor) already
  // has the tables but no history: record the first migration as applied instead of re-running it.
  const applied = await locked(async (q) => {
    const done = await appliedSet(q);
    if (!done.size && files.length) {
      const { rows } = await q("select to_regclass('public.profiles') is not null as exists");
      if (rows[0].exists) {
        console.log(`• ${files[0]} — tables already exist, recording it as applied (baseline)`);
        if (!statusOnly) await q('insert into public.schema_migrations (filename) values ($1)', [files[0]]);
        done.add(files[0]);
      }
    }
    return done;
  });

  const pending = files.filter((f) => !applied.has(f));
  if (statusOnly) {
    files.forEach((f) => console.log(`${applied.has(f) ? '✓ applied ' : '… pending '} ${f}`));
    return;
  }
  if (!pending.length) {
    console.log('Database is up to date.');
    return;
  }

  let ran = 0;
  for (const f of pending) {
    const sql = await readFile(path.join(DIR, f), 'utf8');
    process.stdout.write(`→ ${f} … `);
    try {
      // Each file in its own transaction, re-checked under the lock (another run may have applied it).
      const did = await locked(async (q) => {
        if ((await appliedSet(q)).has(f)) return false;
        await q(sql); // no parameters → simple protocol, so a file can hold many statements
        await q('insert into public.schema_migrations (filename) values ($1)', [f]);
        return true;
      });
      console.log(did ? 'done' : 'already applied');
      if (did) ran++;
    } catch (e) {
      console.log('FAILED');
      throw new Error(`${f}: ${e.message}${e.position ? ` (at character ${e.position})` : ''}`);
    }
  }
  console.log(`Applied ${ran} migration${ran === 1 ? '' : 's'}.`);
}

main()
  .catch((e) => { console.error(`Migration failed: ${e.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
