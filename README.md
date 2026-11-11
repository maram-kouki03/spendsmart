# SpendSmart

**Know where every coin goes.** Cards, cash, budgets, shared bills, subscriptions and savings goals, in one warm little app.

- **Frontend:** React 18 + Vite + React Router (`client/`)
- **Backend:** Node 20+ / Express REST API (`server/`)
- **Database & auth:** Supabase (Postgres, Auth, Storage) (`supabase/`)

## What's inside

| Screen | Route | What it does |
| --- | --- | --- |
| Landing | `/` | Marketing page with the 3D wallet, scroll reveals and count-ups |
| Log in / Sign up | `/login` | Email + password, Google/Apple OAuth, "remember me", password reset |
| Dashboard | `/dashboard` | Total available, month spend/income, live card balances, upcoming renewals & split requests |
| Transactions | `/transactions` | Expenses / income by day, filter by source, search, add income, delete |
| Add a purchase | `/add` → `/add/saved` | Category, source preview, budget heads-up, receipt photo upload, confetti confirmation |
| My purchases | `/purchases` | Daily / weekly / monthly history with category and source filters |
| Budgets | `/budgets` | Per-category monthly limits with alert thresholds; alerts land in the bell |
| Shared expenses | `/shared` | People & groups, split requests (accept/decline/settle up), shared budgets |
| Subscriptions | `/subscriptions` | Pause/resume, 3-day reminders, renewals auto-logged as expenses |
| Savings goals | `/goals` | Jars that fill up; move money in from a card or wallet |
| Settings | `/settings` | Profile, currency (TND/EUR/USD), sources, notification prefs, CSV export, log out |

Balances are never stored; they're computed from each source's starting balance plus its transactions (`source_balances` view), so they're always consistent.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste `supabase/migrations/20261111000000_init.sql`, and run it.
   (Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
   This creates the tables, RLS policies, the balance view, the private `receipts` storage bucket, and a trigger that gives every new user a profile and three starter sources (Card 1, Card 2, Cash Wallet).
3. **Authentication → URL configuration:** set *Site URL* to `http://localhost:5173` and add `http://localhost:5173/**` to *Redirect URLs* (add your production URL later).
4. Optional: enable **Google** and/or **Apple** under *Authentication → Providers*.
5. Optional: under *Authentication → Providers → Email*, turn off "Confirm email" during development so sign-ups log in straight away.

## 2. Configure environment

```bash
cp server/.env.example server/.env
```

```bash
cp client/.env.example client/.env
```

- `server/.env`: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). The service-role key stays on the server.
- `client/.env`: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the public anon key).

## 3. Run it

```bash
npm install
```

```bash
npm run dev
```

The API runs on http://localhost:4000 and the web app on http://localhost:5173 (Vite proxies `/api` to the API).

Sign up, then on the dashboard click **Load sample month** to fill the account with the demo data from the design. To try shared expenses, sign up a second account and add each other by email on the Shared page.

## Production

```bash
npm run build
```

```bash
npm start
```

`npm start` serves the API and the built React app from one Node process on `PORT`. To host the frontend separately (Vercel, Netlify…), set `VITE_API_URL` to the API's origin before building, and `CLIENT_ORIGIN` on the server to the frontend's origin for CORS.

## API overview

All routes need `Authorization: Bearer <supabase access token>`.

| Method & path | Purpose |
| --- | --- |
| `GET /api/summary` | Dashboard data: totals, sources with balances, upcoming, budget health, unread count |
| `GET/PATCH /api/me` | Profile, currency, notification preferences |
| `GET/POST/PATCH/DELETE /api/sources` | Cards & wallets |
| `GET/POST /api/transactions`, `DELETE /api/transactions/:id` | Expenses & income (filters: `kind`, `source`, `category`, `from`, `to`, `q`) |
| `POST/GET /api/transactions/:id/receipt` | Upload a receipt photo / get a signed URL |
| `GET/POST/PATCH/DELETE /api/budgets` | Budgets with this month's spend |
| `GET/POST/PATCH/DELETE /api/subscriptions` | Subscriptions |
| `GET/POST/PATCH/DELETE /api/goals`, `POST /api/goals/:id/contribute` | Savings goals |
| `GET /api/shared`, `POST /api/contacts`, `POST /api/groups` | People, groups, balances |
| `POST /api/splits`, `POST /api/splits/:id/accept`, `POST /api/splits/:id/decline`, `POST /api/settle` | Split requests |
| `POST /api/shared-budgets`, `PUT /api/shared-budgets/:id/limit` | Shared budgets |
| `GET /api/notifications`, `POST /api/notifications/read-all` | Bell notifications |
| `GET /api/export.csv` | Everything as CSV |
| `POST /api/demo/seed` | Load the sample month into an empty account |

## Project layout

```
client/            React app
  src/components/  Sidebar, Topbar, cards, count-up numbers, modal, switches…
  src/pages/       One file per screen
  src/styles/      motion.css (design tokens + animations), app.css (components & pages)
server/            Express API
  src/routes/      One router per feature
  src/lib/         Balances, budgets, alerts, subscription renewals
supabase/          SQL migration (schema, RLS, triggers, storage)
```
