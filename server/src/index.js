import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { requireAuth } from './auth.js';
import me from './routes/me.js';
import summary from './routes/summary.js';
import transactions from './routes/transactions.js';
import budgets from './routes/budgets.js';
import subscriptions from './routes/subscriptions.js';
import goals from './routes/goals.js';
import shared from './routes/shared.js';
import notifications from './routes/notifications.js';
import exportcsv from './routes/exportcsv.js';
import demo from './routes/demo.js';

const app = express();
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());

app.disable('x-powered-by');
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const api = express.Router();
api.use(requireAuth);
for (const r of [me, summary, transactions, budgets, subscriptions, goals, shared, notifications, exportcsv, demo]) api.use(r);
app.use('/api', api);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app from the same origin.
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(`${dist}/index.html`));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`SpendSmart API on http://localhost:${port}`));
