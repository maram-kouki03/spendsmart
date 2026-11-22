/**
 * Deletes unconfirmed sign-ups (public.pending_signups) older than 24 hours.
 *
 *   npm run db:cleanup -w server
 *
 * The server also does this on start and every hour; this script is for cron jobs or a manual run.
 */
import { pool } from '../src/db.js';
import { cleanupPendingSignups, PENDING_MAX_AGE_HOURS } from '../src/lib/cleanup.js';

try {
  const n = await cleanupPendingSignups();
  const { rows } = await pool.query('select count(*)::int as n from public.pending_signups');
  console.log(`Deleted ${n} pending sign-up${n === 1 ? '' : 's'} older than ${PENDING_MAX_AGE_HOURS} h. ${rows[0].n} still waiting for confirmation.`);
} catch (e) {
  console.error(`Cleanup failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
