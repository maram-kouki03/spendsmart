# SpendSmart — backend audit

Date: 2026-11-21 · Scope: `server/` (Express + `pg`), `supabase/migrations/`, and the API calls in `client/src`.
Sections 0–6 are the original audit. **Part A (money safety + schema) is fixed — see §7. Part B (shared-expense privacy) is fixed — see §8.** Items marked *(fixed in A)* / *(fixed in B)* below are resolved.

---

## 8. Fixed in part B — shared-expense privacy (2026-11-22)

Rule: **nobody is linked to someone else, or has their spending shown to them, without accepting.**
New migration: `supabase/migrations/20261116000000_sharing_consent.sql`. New module: `server/src/lib/sharing.js`.
`npm run build` passes. **Not yet run:** the migration and `npm run smoke -w server`. Supabase's Postgres port is still blocked from this machine, and starting a local test PostgreSQL was not permitted in this session.

| # | Finding | Fix |
|---|---|---|
| B1 | Contacts without consent | `POST /contacts { email, relation }` only creates a row in the new `contact_invites` table (`from_user`, `to_email` lowercase, `to_user` null when there's no account, `relation`, `status` pending/accepted/declined/cancelled, `created_at`, `responded_at`; one pending invite per `(from_user, to_email)`). The two-way contact is created only by `POST /invites/:id/accept`, in a transaction that locks the invite row. Inviting someone who has already invited you counts as accepting their invite. New: `GET /invites` (incoming contact and group invites, outgoing contact invites), `POST /invites/:id/decline`, `DELETE /invites/:id` (cancel one I sent). |
| B2 | Email enumeration | `POST /contacts` always answers **202** `{ ok, message: "If this person has a SpendSmart account, they'll get an invitation." }`. That holds for an existing account, an unknown address, an existing contact and a repeat invite. Outgoing invites show the address you typed, never a name. A **declined** invite still shows as sent to the inviter (they aren't told), and re-inviting after a decline sends nothing new. Groups: invited members are shown by email only (masked as `s•••h@…` for members other than the owner and the inviter). Invites to addresses without an account are kept in `group_email_invites`, so the member list looks the same either way. The invitation email to non-users is sent *after* the response, so the response time doesn't depend on whether an account exists. |
| B3 | Invitations to non-users | Addresses without an account get an invitation email ("X invited you to SpendSmart", with a link to `/login`), at most once per address per 7 days. At sign-up (`insertAccount` → `claimInvites`), pending contact and group invites for that address move to the new user, with bell notifications. |
| B4 | Rate limit | Max **20 invitations per user per 24 h**, contact and group invites together. They are counted in the new `invite_sends` log, so cancelling or removing an invite doesn't give the quota back. Over the limit: 429 `invite_limit` `{ left }`. A per-user advisory lock stops two requests at once from both passing the check. |
| B5 | Groups without consent | New `group_members` columns: `status` (`invited` / `active`, default `invited`), `invited_by`, `invited_at`, `joined_at`. The creator is `active`. Everyone else is `invited` and must `POST /groups/:id/accept`, or `/decline` (which deletes the row). Only active members appear in `members`, receive group splits, and can see or use the group's shared budgets. New endpoints: `POST /groups/:id/invite { emails }` (owner), `POST /groups/:id/leave` (any member), `DELETE /groups/:id/members/:userId` (owner), `DELETE /groups/:id/invites?email=` (owner or inviter cancels a pending invite). If the owner leaves, the longest-standing member becomes owner, and an empty group is deleted. Leaving or being removed cancels that person's pending splits in the group and removes their limits on the group's shared budgets. |
| B6 | Spending shown without opt-in | `GET /shared` only computes and returns another person's spending in a shared budget once **they** have set their own limit on it. Until then their row is `{ waiting: true, spent: null, limit: null }`, the budget has `waitingFor: [names]`, and the UI says "Waiting for <name> to join". |
| B7 | Only checked at creation | Every request is re-checked: the two people must be accepted contacts (both rows) or active members of the same group. This covers splits (`POST /splits`, accept, settle) and shared budgets (create, `PUT …/limit`). Accepting a split from someone you're no longer connected to → 403. It can still be declined. |
| B8 | Removing a contact = my side only | `DELETE /contacts/:id` deletes both rows. It also cancels pending 1:1 splits between the two (new split status `cancelled`) and pending invites between them. 1:1 shared budgets are hidden, and unusable (404), while the two aren't contacts. Accepted and declined splits stay in history. |
| B9 | Deleting a group turned its pending splits into 1:1 debts | `DELETE /groups/:id` cancels the group's pending splits first. |
| B10 | Notifications | New type `invite`. `GET /notifications` adds `action: 'split' \| 'contact' \| 'group'` next to `actionable`, so the bell shows Accept/Decline for invites too. |
| B11 | Frontend | Shared page: **Invite** instead of Add (same modal; the server's message is shown as a toast). A **Pending invitations** card: incoming with Accept/Decline, outgoing with Cancel. Group member chips, with **Invited** for invitees; the owner can remove members, cancel invites and use "+ Invite"; everyone gets "Leave group". "Remove <name>" for contacts, with a confirm dialog. Waiting rows in shared budgets. The bell answers invites, and the Shared page refreshes when it does. |
| B12 | Indexes | `contact_invites` (unique pending, `to_user`, `to_email`), `group_members(invited_by, invited_at)`, `split_requests(group_id, status)`, `contacts(contact_id)`, `invite_sends(user_id, created_at)`. |

**Existing data:** existing contacts are kept as accepted, and existing group members are marked `active` (the column is added with default `active`, then the default changes to `invited`). One-sided contacts, left behind by the old "remove = my side only", are deleted because the other person had already removed them. The runner prints both as NOTICEs. To reset all sharing test data instead, run `delete from public.contacts; delete from public.groups;` after migrating.

**Tests:** the smoke test now logs in as each user (one cookie jar per user). New sections cover contact invites, opt-in budgets, removing a contact, groups, invites to non-users (a third user "signs up" with the invited address), leaving and removing members, and the daily limit. The spawned API gets `SMTP_HOST=''`, so invitation emails to `@example.test` addresses are printed in its log, never sent.

**Still open:** ownership can only change by the owner leaving (no explicit transfer), and there's no "delete shared budget" endpoint. 1:1 shared-budget limits are kept while two people aren't contacts, so they show again if both reconnect, which takes a new accepted invitation.

---

## 7. Fixed in part A (2026-11-21)

New migration: `supabase/migrations/20261115000000_money_safety.sql` (needs PostgreSQL 15+, checked at the start).
Verified with `npm run smoke -w server` (65/65 checks) and `npm run build` against a local PostgreSQL 17.
The live Supabase database was **not** migrated from this machine (see "Not done" below).

| # | Finding | Fix |
|---|---|---|
| 1 | Deleting a goal lost its deposits | `DELETE /api/goals/:id` needs `{ return_to_source_id }` (body or query) when deposits > 0. Without it: 400 `return_source_required` `{ deposited }`. In one transaction (goal row locked) an income "Returned from <goal>" (category Savings) of the **deposited** total (not `initial_saved`) is logged on that active card, then the goal is deleted. The answer is 200 `{ ok, returned }`, or 204 when nothing was deposited. `GET /goals` adds a `deposited` field. The Goals edit modal asks "Return X to which card?" with a card picker. |
| 2 | Deleting a card erased its history | New `sources.archived_at`. `DELETE /sources/:id`: no transactions → deleted (204). With transactions → 409 `{ code: 'source_has_history', count }`, or `?archive=true` → archived (200 `{ archived, source }`). It keeps at least one active card and locks the user's cards against races. New `POST /sources/:id/restore`. Archived cards are left out of `summary.sources` (so out of every picker and the dashboard). They appear in the new `summary.archivedSources` and stay in transaction history (`source.archived: true`). New transactions, goal deposits/refunds, splits and subscriptions refuse them (400 `source_archived`). `GET /sources?include=archived` lists them too. Settings: confirm dialog on 409, plus an "Archived cards" section with Restore. **Totals:** `totals.available` adds up all cards including archived ones. That's the same as "only when non-zero", because a zero balance adds nothing. The DB foreign key transactions → sources is now NO ACTION instead of CASCADE, so history can't be erased by accident. |
| 3 | Renewals processed on every page load | Removed from `GET /summary`, `/subscriptions` and `/notifications`. New `server/src/jobs/subscriptions.js` runs on server start, then hourly (unref'd timer), and via `npm run jobs:subscriptions -w server`. Protections: `pg_try_advisory_lock` (one job across instances), a row lock per subscription, and a unique index on `transactions (subscription_id, subscription_period)` with `INSERT … ON CONFLICT DO NOTHING`. `subscription_period` is the renewal date it pays for (sturdier than `occurred_at::date`, which shifts with time zones). The 3-day reminders come from the job too. A create or edit that makes a renewal due today charges it immediately, so nobody waits an hour. Renewals are charged **on** the renewal day (previously the day after). |
| 4 | Schema hardening | Indexes: `group_members(user_id)`, `shared_budgets(partner_id)`, `(group_id)`, `(created_by)`, `shared_budget_limits(user_id)`, `transactions(user_id, kind, occurred_at)`, `transactions(goal_id)`, `notifications(user_id, read)`, `subscriptions(source_id)`, `subscriptions(next_renewal) where active`. New CHECKs: `transactions.category` (8 categories + Income + Savings), `budgets/shared_budgets/split_requests.category`, `goals.icon`, `subscriptions.icon/color`. The CHECKs on `transactions.kind`, `split_requests.status`, `sources.kind/style` and `profiles.currency` already existed. Same-user integrity: `unique (id, user_id)` on sources, goals and subscriptions, plus composite FKs `transactions(source_id, user_id)`, `(goal_id, user_id)`, `(subscription_id, user_id)` and `subscriptions(source_id, user_id)`, using `on delete set null (column)` so `user_id` is never nulled. **Existing rows:** unknown categories → More, unknown icons/colours → defaults, cross-user goal/subscription links → unlinked. Each fix is reported as a NOTICE, which the migration runner now prints. A transaction on another user's card has no safe fix, so the migration stops with a query to inspect it. Both paths were tested on seeded bad data. |
| 5a | Unchecked transaction dates | `occurred_at` must be a real date (`YYYY-MM-DD` or ISO date-time), from 2000 on, and at most 1 day in the future. Otherwise 400. |
| 5b | Receipt type trusted from the browser | The type is detected from the file's bytes (`file-type`). Only JPG/PNG/WEBP up to 8 MB, with readable 400s. Old HEIC files can still be served. The client text says "JPG, PNG or WEBP (max 8 MB)". |
| 5c | 204/200 for unknown ids | Every `:id` route answers 404 for unknown, someone else's, or malformed ids: budgets, goals, subscriptions, sources, transactions, contacts, groups, notifications, splits, shared budgets. |
| 5d | UTC month/day boundaries | New `profiles.timezone` (default `Africa/Tunis`, validated against Node and `pg_timezone_names`). The client sends `Intl…timeZone` via `PATCH /me` once per session when it differs. This month (summary, budgets, budget alerts, shared budgets), today, analytics days/months, subscription `days` and renewal dates all use it. |
| 5e | Dead Supabase rules | Removed from `client/src/lib/authErrors.js`. Only the network-error translation is left. |
| 6 | Tests | New `server/scripts/smoke-test.js` (`npm run smoke -w server`). It starts the API on a random port, creates two temporary users, covers all of the above (goal refund, archive/restore, job lock/idempotency/replay/reminders, FKs/CHECKs, 404s, dates, receipts, time zone), then deletes the users. |

**Not done / to do on your side**
- **Apply the migration to Supabase:** run `npm run db:migrate -w server`. From this machine, the Supabase pooler (ports 5432 and 6543) accepted TCP but never answered the Postgres handshake, while HTTPS to the project worked. Something on the network is blocking the Postgres protocol. Run it from a network that allows it, then run `npm run smoke -w server` there too. It creates and deletes two `smoke+…@example.test` users.
- Use the **Session** pooler (5432) for `DATABASE_URL`. The job's advisory lock is session-level and doesn't work through the Transaction pooler (6543).
- Still open from the audit: split-linked transaction deletes, demo-seed duplicates, notification pruning and export contents.

---

## 0. Google / Apple login

| Item | State |
|---|---|
| Apple button | Already gone from the working tree. It was in `HEAD` (`Login.jsx`, old Supabase `oauth('apple')`) and isn't referenced anywhere in `client/src` now. |
| Google button | Only renders when `GET /api/auth/config` returns `{ google: true, googleClientId }` (`client/src/pages/Login.jsx:356`). `GOOGLE_CLIENT_ID` is empty in `server/.env`, so the button is hidden. |
| Google script (GIS) | `accounts.google.com/gsi/client` is injected only from inside `<GoogleButton>`, so it never loads while the button is hidden. |
| Backend | `POST /api/auth/google` returns 404 before doing anything when `GOOGLE_CLIENT_ID` is unset. `google-auth-library` is loaded with a dynamic `import()` after that check, so it's never loaded either (`server/src/routes/auth.js:340-344`). The code and dependency are kept. |

**Result:** no edit was needed. When `GOOGLE_CLIENT_ID` is empty, no Google code runs on the client or the server. To turn Google on later, set `GOOGLE_CLIENT_ID` in `server/.env`.

---

## 1. Endpoint inventory

Everything except `/api/health` and `/api/auth/*` (public ones) sits behind `requireAuth` (`server/src/index.js:50-53`).

| Method | Path | File | What it does |
|---|---|---|---|
| GET | `/api/health` | index.js | Liveness check |
| GET | `/api/auth/config` | routes/auth.js | Tells the client whether Google sign-in is enabled |
| POST | `/api/auth/register` | routes/auth.js | Stores a pending sign-up (bcrypt hash) and emails a 6-digit code |
| POST | `/api/auth/verify-email` | routes/auth.js | Checks the code. Creates user + profile + 3 starter sources and sets the session cookie |
| POST | `/api/auth/resend-code` | routes/auth.js | New code for a pending sign-up (60 s cooldown, same answer for unknown emails) |
| POST | `/api/auth/login` | routes/auth.js | Email/password login. Answers 403 `email_not_verified` for a pending sign-up |
| POST | `/api/auth/logout` | routes/auth.js | Clears the session cookie |
| POST | `/api/auth/forgot-password` | routes/auth.js | Emails a 1-hour reset link (always answers `ok`) |
| POST | `/api/auth/reset-password` | routes/auth.js | Uses the reset token, sets the new password and signs in |
| POST | `/api/auth/google` | routes/auth.js | Google ID-token sign-in (disabled, see §0) |
| GET | `/api/auth/me` | routes/auth.js | Current user (`{ user }`) |
| POST | `/api/auth/change-password` | routes/auth.js | Change or set the password. Other sessions become invalid |
| GET | `/api/me` | routes/me.js | Current profile row |
| PATCH | `/api/me` | routes/me.js | Update name, currency, notification toggles |
| GET | `/api/sources` | routes/me.js | Cards/wallets with live balance |
| POST | `/api/sources` | routes/me.js | Add a card/wallet |
| PATCH | `/api/sources/:id` | routes/me.js | Edit a card/wallet |
| DELETE | `/api/sources/:id` | routes/me.js | Delete a card/wallet (cascades its transactions) and its receipt files |
| GET | `/api/summary` | routes/summary.js | Dashboard/sidebar/topbar data. Also runs subscription renewals |
| GET | `/api/transactions` | routes/transactions.js | Filtered list (kind, source, category, from/to, search, limit) |
| POST | `/api/transactions` | routes/transactions.js | Add expense/income and return budget-alert info |
| DELETE | `/api/transactions/:id` | routes/transactions.js | Delete a transaction and its receipt file |
| POST | `/api/transactions/:id/receipt` | routes/transactions.js | Upload a receipt image (multer, 8 MB, saved to disk) |
| GET | `/api/transactions/:id/receipt` | routes/transactions.js | Stream the receipt image to its owner |
| GET | `/api/budgets` | routes/budgets.js | Budgets with this month's spend, % and status |
| POST | `/api/budgets` | routes/budgets.js | Create a budget and return the list |
| PATCH | `/api/budgets/:id` | routes/budgets.js | Edit a budget and return the list |
| DELETE | `/api/budgets/:id` | routes/budgets.js | Delete a budget |
| GET | `/api/subscriptions` | routes/subscriptions.js | Run renewals, then list with `days` until renewal |
| POST | `/api/subscriptions` | routes/subscriptions.js | Create and return the list |
| PATCH | `/api/subscriptions/:id` | routes/subscriptions.js | Edit or pause and return the list |
| DELETE | `/api/subscriptions/:id` | routes/subscriptions.js | Delete |
| GET | `/api/goals` | routes/goals.js | Goals with `saved` (initial + deposits) |
| POST | `/api/goals` | routes/goals.js | Create and return the list |
| PATCH | `/api/goals/:id` | routes/goals.js | Edit and return the list |
| DELETE | `/api/goals/:id` | routes/goals.js | Delete |
| POST | `/api/goals/:id/contribute` | routes/goals.js | Move money from a source into a goal (balance check, row lock) |
| GET | `/api/shared` | routes/shared.js | People, groups, balances, shared budgets, incoming/outgoing splits |
| POST | `/api/contacts` | routes/shared.js | Invite a person by email (202, same answer whether or not they have an account) *(B)* |
| DELETE | `/api/contacts/:id` | routes/shared.js | Remove a contact on both sides and cancel pending 1:1 splits *(B)* |
| GET | `/api/invites` | routes/shared.js | Incoming contact/group invites, outgoing contact invites *(B)* |
| POST | `/api/invites/:id/accept`, `/decline` | routes/shared.js | Answer a contact invite (accept creates the two-way contact) *(B)* |
| DELETE | `/api/invites/:id` | routes/shared.js | Cancel an invite I sent *(B)* |
| POST | `/api/groups` | routes/shared.js | Create a group; the others are invited *(B)* |
| POST | `/api/groups/:id/invite` | routes/shared.js | Owner invites more people *(B)* |
| POST | `/api/groups/:id/accept`, `/decline`, `/leave` | routes/shared.js | Answer a group invite, or leave *(B)* |
| DELETE | `/api/groups/:id/members/:userId` | routes/shared.js | Owner removes a member *(B)* |
| DELETE | `/api/groups/:id/invites?email=` | routes/shared.js | Cancel a pending group invite *(B)* |
| DELETE | `/api/groups/:id` | routes/shared.js | Delete a group (owner only; cancels its pending splits) |
| POST | `/api/splits` | routes/shared.js | Log what I paid and send split requests and notifications |
| POST | `/api/splits/:id/accept` | routes/shared.js | Pay my share (expense for me, income for the sender) |
| POST | `/api/splits/:id/decline` | routes/shared.js | Decline a split request |
| POST | `/api/settle` | routes/shared.js | Accept every pending 1:1 request from one person |
| POST | `/api/shared-budgets` | routes/shared.js | Create a shared budget with a person or group, plus my limit |
| PUT | `/api/shared-budgets/:id/limit` | routes/shared.js | Set my limit on a shared budget |
| GET | `/api/notifications` | routes/notifications.js | Run renewals, then the last 30 notifications with an `actionable` flag |
| POST | `/api/notifications/read-all` | routes/notifications.js | Mark all as read |
| POST | `/api/notifications/:id/read` | routes/notifications.js | Mark one as read |
| GET | `/api/analytics` | routes/analytics.js | Dashboard charts: by category, last 30 days, last 6 months |
| GET | `/api/export.csv` | routes/exportcsv.js | CSV of transactions, budgets, goals and subscriptions |
| POST | `/api/demo/seed` | routes/demo.js | Load the sample month into an empty account |

---

## 2. Cross-cutting checks

| Check | Result |
|---|---|
| `@supabase/supabase-js`, Supabase Auth or Storage | ✅ **None in the server.** No import, no dependency (`package-lock.json` has 0 `@supabase` entries) and `server/src/supabase.js` is deleted. Receipts are on disk (`lib/receipts.js`). Supabase is only mentioned in comments and env help text. Leftover on the client: `client/src/lib/authErrors.js` still says "Turn Supabase auth errors…" and matches Supabase-only messages (`invalid login credentials`, `email not confirmed`, …). Harmless but dead. |
| SQL scoped to the logged-in user | ✅ Every read/update/delete on user-owned tables filters by `user_id = req.user.id` (or `owner_id` / `to_user` / membership). FK targets in request bodies are checked for ownership: `source_id` in transactions, subscriptions, goals and splits; `user_id` in splits and settle via `contacts`; `group_id` via `group_members`. The two privacy issues listed under Shared expenses below are *fixed in B* (§8). |
| String-concatenated SQL | ✅ None with user input. Dynamic parts are `setClause()` / `insertRows()` (column names pass the `ident()` regex and come from zod-validated keys), the fixed `where` fragments in `GET /transactions`, and the constant `SPLIT_SELECT` / `personJson()` aliases. LIKE wildcards are escaped. |
| Input validation | ✅ zod on every body/query that writes, with small gaps listed per module (`occurred_at`, `:id` params, receipt MIME type). |
| Error handling | ✅ Every async handler is wrapped in `ah()`. The global handler maps Postgres codes to 4xx (`22P02` bad uuid becomes 400, `23505` becomes 409, …) and hides 5xx details. |
| Multi-step writes in a transaction | ✅ Mostly. Not atomic: `DELETE /sources/:id` (count check, select, delete), `POST /auth/change-password` (password update, then reset-token invalidation), and `POST /auth/google` (link, or check then create). Details per module. |
| CSRF / session | ✅ httpOnly + `sameSite=lax` cookie, plus an Origin check on state-changing `/api` requests. JWT carries a password fingerprint, so a password change logs out other sessions. |

---

## 3. Frontend ↔ backend

Every endpoint the frontend calls exists, and the response shapes match what the pages read. No missing endpoint and no shape mismatch was found.

| Frontend call | Backend | Shape |
|---|---|---|
| `/auth/me, login, register, verify-email, resend-code, logout, forgot-password, reset-password, change-password, config, google` | ✅ | ✅ `{ user }` / `{ needsVerification, email, resendIn }` / error `code`s used by `Login.jsx` |
| `GET /summary` | ✅ | ✅ `profile, sources[].last, upcoming, budgets{total,under,alerts}, unread` |
| `GET /analytics` | ✅ | ✅ `byCategory, daily, monthly` (`Insights.jsx`) |
| `POST /demo/seed` | ✅ | ✅ |
| `GET/POST/DELETE /transactions`, `POST /transactions/:id/receipt` | ✅ | ✅ (`transaction.id`, `source.before/after`, `budgets[]` for PurchaseSaved) |
| `GET/POST/PATCH/DELETE /budgets` | ✅ | ✅ list returned |
| `GET/POST/PATCH/DELETE /subscriptions` | ✅ | ✅ list returned |
| `GET/POST/PATCH/DELETE /goals`, `POST /goals/:id/contribute` | ✅ | ✅ list returned |
| `GET /shared`, `POST /contacts, /groups, /splits, /settle, /shared-budgets`, `PUT /shared-budgets/:id/limit`, `POST /splits/:id/accept\|decline` | ✅ | ✅ `people[].budgets[].rows[]`, `groups`, `incoming`, `outgoing` |
| `GET /invites`, `POST /invites/:id/accept\|decline`, `DELETE /invites/:id`, `POST /groups/:id/accept\|decline\|leave\|invite`, `DELETE /contacts/:id`, `/groups/:id/members/:userId`, `/groups/:id/invites` *(B)* | ✅ | ✅ |
| `GET /notifications`, `POST /notifications/read-all`, `/:id/read` | ✅ | ✅ `actionable`, `action`, `data.split_id\|invite_id\|group_id` |
| `PATCH /me`, `POST/PATCH/DELETE /sources`, `GET /export.csv` | ✅ | ✅ |

**Backend endpoints the frontend never calls:** `GET /me` (duplicates `/auth/me` with a different shape), `GET /sources` (the summary covers it), `GET /transactions/:id/receipt` (there's no screen to view a receipt), and `DELETE /groups/:id` (the UI offers "Leave group" instead). `DELETE /contacts/:id` now has a button *(B)*.

**Small mismatches:**
- Receipts: the file picker accepts JPG/PNG/WebP, the server accepts JPG/PNG/WebP/HEIC, and the server's error message and the drop-zone text both say "JPG or PNG".
- `AddPurchase.jsx:53` swallows receipt-upload errors (`.catch(() => null)`), so the user never learns the receipt didn't save.

---

## 4. Schema vs queries (migrations) — indexes, CHECKs and same-user FKs fixed in A (§7)

Every table, column and view the queries use exists: `users.email_verified_at`, `pending_signups`, `password_reset_tokens`, `transactions.receipt_path/goal_id/split_request_id`, `split_requests.from_source_id/to_source_id/responded_at`, `shared_budget_limits`, `source_balances`, `notifications.dedupe_key` with its unique constraint, and `profiles.notify_*`. **No missing columns or tables.**

**Missing indexes** (FK columns and lookup columns used in `WHERE`, cascades or `set null`):
- `group_members (user_id)`: `GET /shared` runs `where user_id = $1`. The PK is `(group_id, user_id)`, so it doesn't help.
- `contacts (contact_id)`: FK cascade when a profile is deleted.
- `shared_budgets (created_by)`, `(partner_id)`, `(group_id)`: `GET /shared` uses an `OR` of all three.
- `split_requests (group_id)`, `(from_source_id)`, `(to_source_id)`: FK `set null` on group/source delete.
- `transactions (split_request_id)`, `subscriptions (source_id)`, `groups (owner_id)`.

**Foreign key / constraint gaps:**
- `transactions.goal_id … on delete set null`: deleting a goal leaves its `kind='goal'` transactions in place. They keep reducing the source balance but no longer belong to any goal, so the money disappears (see Goals).
- `transactions.source_id … on delete cascade`: deleting a card deletes its whole history, including goal deposits (lowers `saved`) and split payments (the split stays `accepted`).
- No composite FK makes `transactions.source_id`, `goal_id` or `subscriptions.source_id` belong to the **same** `user_id`. The app enforces this, the database doesn't.
- No `check` on `budgets.category`, `transactions.category`, `shared_budgets.category`, `goals.icon`, `subscriptions.icon/color`. zod enforces them, the database doesn't.
- `budgets` has no unique `(user_id, category)`, so duplicate budgets for one category are possible. That may be intended.
- `profiles.email` duplicates `users.email` with no sync. That's fine today because there's no change-email feature.

**Migration hygiene:**
- `20261111000000_init.sql` was edited after it was first applied (removed `auth.users` FK, trigger, RLS policies and the Storage bucket). For a database that ran the old file, `20261112…_own_auth.sql` cleans up the trigger and policies, so the result is consistent. Only the `receipts` Storage bucket needs manual removal. For future changes, add a new migration instead of editing an applied one.
- `20261112…` truncates `profiles cascade` on first conversion. That's guarded, but it's destructive, so it should be documented in the README.

---

## 5. Results per module

### Account (auth + profile + settings) — ✅ works
| Endpoint | Status |
|---|---|
| register / verify-email / resend-code / login / logout | ✅ |
| forgot / reset-password | ✅ |
| change-password | ✅ |
| google | ✅ disabled (§0) |
| `GET/PATCH /me` | ✅ |

Problems:
- Rate limits and the resend "phantom cooldown" are in-memory: they reset on restart and aren't shared between instances.
- Logout only clears the cookie. The stateless JWT stays valid until it expires (7 days), unless the password changes.
- `change-password`: the password update and the reset-token invalidation run as two statements outside a transaction. Low risk.
- `POST /auth/google`: the link-or-create steps aren't in one transaction. A parallel request is caught by the unique constraint as a 409. Only matters once Google is enabled.
- `register` answers 409 "account already exists", which reveals that an email is registered. That's a conscious UX choice.
- Duplicate endpoints: `GET /me` (profile row) and `GET /auth/me` (`{ user }`).
- Client leftover: `authErrors.js` has Supabase-specific rules and comment.

### Sources (cards & wallets) — ✅ fixed in A (archive instead of cascade delete, locking, 404)
| Endpoint | Status |
|---|---|
| `GET/POST/PATCH /sources` | ✅ |
| `DELETE /sources/:id` | ⚠️ |

Problems:
- Deleting a source **cascades all its transactions**: history, goal deposits (goal `saved` drops) and split payments (the split stays `accepted` while the other person keeps their income). There's no warning or soft-delete.
- The steps "keep at least one" check, select receipts and delete aren't in a transaction. Two parallel deletes can remove the last source.
- Deleting an unknown or foreign id returns 204 instead of 404 (nothing happens, so it's safe).
- `position` comes from `existing.length` and is never compacted after deletes. Cosmetic.

### Transactions — ⚠️ mostly fixed in A (dates, receipt sniffing, 404). Still open: split-linked deletes, disk storage, no receipt viewer
| Endpoint | Status |
|---|---|
| `GET /transactions` | ✅ |
| `POST /transactions` | ⚠️ |
| `DELETE /transactions/:id` | ⚠️ |
| `POST/GET /transactions/:id/receipt` | ⚠️ |
| PATCH (edit) | ❌ none (the frontend doesn't need it yet) |

Problems:
- `occurred_at` is any string. An invalid value silently becomes "now", and there's no range check (year 9999 is accepted).
- Deleting a transaction linked to a split (`split_request_id`) or a goal leaves the split `accepted` and the other user's income in place. Only the deleted side is reversed.
- Receipt type is trusted from the client-supplied `mimetype` with no magic-byte check. The error says "JPG or PNG" but WebP/HEIC are accepted.
- Receipt files live on local disk (`server/uploads`), so they're lost on hosts with ephemeral disks (Render/Fly without a volume).
- There's no UI to view a receipt (`GET …/receipt` is unused), and upload errors are swallowed on the client.

### Budgets — ✅ works (404 and time-zone month fixed in A)
| Endpoint | Status |
|---|---|
| `GET/POST/PATCH/DELETE /budgets` | ✅ |

Problems:
- Two budgets for the same category are allowed (no unique constraint), so both fire alerts.
- `DELETE` returns 204 for an unknown id.
- Month boundaries are UTC. For Tunisia (UTC+1), spending between 00:00 and 01:00 on the 1st counts toward the previous month.

### Subscriptions — ✅ fixed in A (background job, no double charges, 404, CHECKs)
| Endpoint | Status |
|---|---|
| `GET /subscriptions` | ⚠️ |
| `POST/PATCH/DELETE /subscriptions` | ✅ |

Problems:
- `syncSubscriptions()` runs a write transaction with `FOR UPDATE` on **every** `GET /summary`, `/subscriptions` and `/notifications`. It's correct, but heavy, and it locks on reads. A daily job or a "last synced" timestamp would be lighter.
- Creating a subscription with a past `next_renewal` silently backfills up to 24 "Subscription renewal" expenses.
- When its source is deleted, `source_id` becomes null and renewals stop being charged with no notice.
- `DELETE` returns 204 for an unknown id.
- No database check on `icon`/`color`.

### Goals — ✅ fixed in A (delete refunds deposits, 404)
| Endpoint | Status |
|---|---|
| `GET/POST/PATCH /goals` | ✅ |
| `POST /goals/:id/contribute` | ✅ (transaction + row lock + balance check) |
| `DELETE /goals/:id` | ⚠️ |

Problems:
- **Deleting a goal loses its money.** The `kind='goal'` transactions remain (`goal_id` set null) and keep reducing the source balance. Fix options: return the deposits to the source, block the delete, or delete the deposits.
- There's no "withdraw from goal" endpoint.
- `DELETE` returns 204 for an unknown id.

### Shared expenses — ✅ privacy fixed in B (§8). Indexes and 404s fixed in A
| Endpoint | Status |
|---|---|
| `GET /shared` | ⚠️ |
| `POST /contacts` | ⚠️ |
| `DELETE /contacts/:id` | ⚠️ |
| `POST /groups` | ⚠️ |
| `DELETE /groups/:id` | ✅ |
| `POST /splits`, accept, decline, settle | ✅ (transactions, `FOR UPDATE`, ownership checks) |
| `POST /shared-budgets`, `PUT …/limit` | ⚠️ |

Problems (original audit; all fixed in B except the N+1 note):
- **No consent for contacts and groups.** `POST /contacts` inserts the contact in both directions, and `POST /groups` adds anyone by email. The other person never accepts. Any user can then create a shared budget with them, and `GET /shared` returns **that person's monthly spend in the chosen category** (`monthSpendByCategory`). That leaks private financial data to someone they never agreed to share with. Add an invitation/accept step, or only show spend once the partner has set their own limit.
- **Email enumeration.** `POST /contacts` and `/groups` answer "No SpendSmart account uses X". Combined with no consent, this lets anyone probe which emails have accounts.
- `DELETE /contacts/:id` removes only my side. The other person can still send me split requests and see me in shared budgets.
- There's no "leave group", "add/remove member", or "delete shared budget" endpoint. There are no remove buttons in the UI for contacts or groups.
- Deleting a group sets `split_requests.group_id` to null, so old pending group splits suddenly count as 1:1 debts in `people[].iOwe`.
- `GET /shared` computes budget rows with sequential awaits per person/group (N+1 queries). Fine at small scale.
- Missing indexes: `group_members(user_id)`, `shared_budgets(created_by|partner_id|group_id)`, `split_requests(group_id)`.

### Notifications — ✅ works (GET no longer writes; 404 fixed in A)
| Endpoint | Status |
|---|---|
| `GET /notifications`, read-all, `:id/read` | ✅ |

Problems:
- `GET` triggers the subscription sync, which writes (see Subscriptions).
- Old notifications are never pruned, so the table only grows (the API reads only the last 30).
- `/:id/read` with a non-uuid id gives 400 "Invalid id" (fine).

### Dashboard / analytics — ✅ works (time zones and read-only summary fixed in A)
| Endpoint | Status |
|---|---|
| `GET /summary` | ✅ |
| `GET /analytics` | ✅ |
| `POST /demo/seed` | ✅ (one transaction, serialized per user) |

Problems:
- Month, day and 6-month buckets are UTC, not the user's time zone.
- `/summary` does seven queries plus the subscription sync on every page load.
- Demo seed only checks "no transactions". Existing budgets and goals get duplicated, and if the starter sources were renamed it deletes and recreates them (subscriptions on them lose their source).
- `totals.incomeFrom` is built from transaction *names*, not categories. It works but is misleadingly named.

### Export — ✅ works
| Endpoint | Status |
|---|---|
| `GET /export.csv` | ✅ (user-scoped, formula-injection safe, UTF-8 BOM) |

Problems:
- Doesn't include sources/balances, shared splits or goal progress (`saved`).
- Builds the whole file in memory with no limit. Fine for a personal app.

---

## 6. Suggested fix order

1. *(done in B)* **Shared privacy:** consent for contacts/groups before spend is visible, and a generic "not found / invite sent" message.
2. **Goal delete** and **source delete** money consistency (refund or block, and warn before cascading).
3. Validate `occurred_at` (ISO date/datetime within a sane range), and sniff receipt magic bytes.
4. Migration with the missing indexes, plus optional `check` constraints and composite ownership FKs.
5. Move `syncSubscriptions` off the read path (daily job or a `subs_synced_at` on profiles).
6. Small cleanups: 404 on unknown deletes, the receipt type message, the client receipt error, the Supabase rules in `authErrors.js`, and the duplicate `/me`.
