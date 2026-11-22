import { query } from '../db.js';

/** Sign-ups not confirmed within this many hours of their last code are deleted. */
export const PENDING_MAX_AGE_HOURS = 24;

/**
 * Deletes pending sign-ups whose last code went out more than 24 h ago (codes only live 15 min,
 * so nothing usable is lost). Measured from last_sent_at so a sign-up that just got a new code
 * isn't removed mid-flow. Returns the number of rows deleted.
 */
export async function cleanupPendingSignups() {
  const r = await query(
    'delete from public.pending_signups where last_sent_at < now() - make_interval(hours => $1)',
    [PENDING_MAX_AGE_HOURS]
  );
  return r.rowCount;
}

/** Runs the cleanup now and then every hour; the timer doesn't keep the process alive. */
export function scheduleCleanup() {
  const run = () => cleanupPendingSignups()
    .then((n) => { if (n) console.log(`Removed ${n} unconfirmed sign-up${n === 1 ? '' : 's'} older than ${PENDING_MAX_AGE_HOURS} h`); })
    .catch((e) => console.error('Pending sign-up cleanup failed:', e.message));
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
