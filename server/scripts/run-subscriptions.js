/** One pass of the subscription renewal job: `npm run jobs:subscriptions -w server`. */
import { pool } from '../src/db.js';
import { runSubscriptionJob } from '../src/jobs/subscriptions.js';

runSubscriptionJob()
  .then((r) => console.log(r.skipped ? 'Another instance is running the job right now — skipped.' : `Processed ${r.processed} subscription(s): ${r.charged} renewal(s) charged, ${r.reminded} reminder(s), ${r.failed} failed.`))
  .catch((e) => { console.error(`Subscription job failed: ${e.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
