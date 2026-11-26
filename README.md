<a id="top"></a>

<div align="center">

# 💰 SpendSmart

### Know where every coin goes

*✍️ Spend smart, live happy!*

<br>

<a href="https://spendsmart-tn.vercel.app"><img alt="Live demo" src="https://img.shields.io/badge/%F0%9F%9A%80%20LIVE%20DEMO-spendsmart--tn.vercel.app-F2D06B?style=for-the-badge&labelColor=3B2F12"></a>

**🌐 [https://spendsmart-tn.vercel.app](https://spendsmart-tn.vercel.app)**

<br>

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![React Router](https://img.shields.io/badge/React%20Router-6-CA4245?style=flat-square&logo=reactrouter&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-2-22B5BF?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-httpOnly%20cookie-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![bcrypt](https://img.shields.io/badge/bcrypt-cost%2012-8A6406?style=flat-square)
![Mailjet](https://img.shields.io/badge/Mailjet-emails-FEC800?style=flat-square)
<br>
![Vercel](https://img.shields.io/badge/Vercel-frontend-000000?style=flat-square&logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/Render-API-46E3B7?style=flat-square&logo=render&logoColor=black)
![ESLint](https://img.shields.io/badge/ESLint-0%20errors-4B32C3?style=flat-square&logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-formatted-F7B93E?style=flat-square&logo=prettier&logoColor=black)
![Lighthouse](https://img.shields.io/badge/Lighthouse-100%20accessibility-F44B21?style=flat-square&logo=lighthouse&logoColor=white)
![Status](https://img.shields.io/badge/status-Deployed-15803D?style=flat-square)

<br>

**Group 13** · Maram Kouki · Imen Khedimallah · Emna Borchani<br>
Supervisor: **Dr. Maroua Nouioua** · **SUP'COM** · Projet Web 2026/2027

</div>

<br>

> [!WARNING]
> **Check your Spam folder!** The confirmation code email may land in your **Spam / Junk** folder (Gmail: also check the **Promotions** tab). Mark it as **"Not spam"** so the next ones arrive in the inbox.

> [!NOTE]
> The API runs on **Render's free plan** and sleeps after **15 minutes** without visits: the first request can take **30–50 seconds** while it wakes up. After that, everything is fast.

---

## 📑 Table of contents

| | | |
| --- | --- | --- |
| 1. [✨ About](#-about) | 6. [🔐 Security](#-security) | 11. [🔌 API overview](#-api-overview) |
| 2. [🎯 Features](#-features) | 7. [⚡ Performance](#-performance) | 12. [🎨 Design](#-design) |
| 3. [🗺️ Sitemap](#️-sitemap) | 8. [🚀 Deployment](#-deployment) | 13. [📸 Screenshots](#-screenshots) |
| 4. [🏗️ Architecture (UML)](#️-architecture-uml) | 9. [💻 Run it locally](#-run-it-locally) | 14. [👥 Team](#-team) |
| 5. [🧰 Tech stack](#-tech-stack) | 10. [📁 Project structure](#-project-structure) | |

---

## ✨ About

**SpendSmart** is a personal finance web app built for **students**.

Student money is spread everywhere: a debit card, some cash, a credit card, a subscription you forgot about, and the pizza you paid for your flatmates. At the end of the month nobody knows where it all went.

SpendSmart puts everything in one place:

- 💳 every **card and wallet** with its live balance;
- 🧾 every **purchase and income**, in seconds;
- 🎯 **budgets** that warn you *before* you overspend;
- 🤝 **shared expenses** with friends, flatmates or a group, only after they accept;
- 🔁 **subscriptions** that renew automatically, with a reminder;
- 🐷 **savings goals**, alone or together.

> [!TIP]
> After signing up, click **"Load sample month"** on the dashboard to fill your account with demo data and explore every screen.

<div align="right"><a href="#top">⬆️ Back to top</a></div>

---

## 🎯 Features

<table>
<tr>
<td valign="top" width="50%">

#### 💳 Cards & wallets
- Debit, credit, cash or other, with an optional last 4 digits and a card style
- Live balance = starting balance + income − spending (computed, never stored)
- Archive a card and restore it later; history is kept

#### 🧾 Transactions
- Everything that came in and went out, filtered and grouped
- Add **income** in a modal; delete a transaction

#### 🛒 Add a purchase → Purchase saved
- Amount, name, category (Food, Coffee, Groceries, Transport, Bills…), card and date
- A summary screen shows the new balance and the budget impact

#### 🛍️ My purchases
- All your purchases with search and filters

#### 🎯 Budgets with periods and alerts
- A limit per category for a **week, month, quarter, year** or **custom** dates
- Spending counted in **your time zone**
- Alert at a chosen threshold (50–100 %) and when you go over, once per period

#### 📊 Dashboard insights
- *Where your money went*, a donut chart of this month by category
- *Daily spending* over the last 30 days
- *Money in vs out* over the last 6 months
- Upcoming renewals and goals at a glance

</td>
<td valign="top" width="50%">

#### 🤝 Shared expenses
- Add contacts **by email**: they must **accept the invitation** first
- Create **groups**, invite members, leave or remove them
- **Split** a bill: each person accepts or declines their share
- **Settle up** pending requests from a chosen card

#### 🐷 Saving together
- Shared plans to buy something together over 1–60 months
- Split equally or by percentage, and track everyone's progress

#### 🔁 Subscriptions
- Price, renewal date and card; charged **automatically** when due
- A reminder **3 days** before each renewal

#### ⭐ Savings goals
- Target amount and optional date, with progress
- Add money from a card in two taps (20 / 50 / 100 or your own amount)

#### 🔔 Notifications
- Budget alerts, split requests, invitations and renewals in the top-bar bell

#### ⚙️ Settings
- Profile, currency (**TND**, EUR, USD), notification preferences, cards & wallets, log out

#### 🔐 Auth
- Sign-up confirmed with a **6-digit email code**
- **Strong password** rules with a live checklist
- "Remember me", password reset by email, optional Google sign-in

</td>
</tr>
</table>

<div align="right"><a href="#top">⬆️ Back to top</a></div>

---

## 🗺️ Sitemap

```mermaid
flowchart LR
    L["🏠 Landing /"]
    LG["🔑 Log in / Sign up /login"]
    RP["🔁 Reset password /reset-password"]

    subgraph APP["🔒 Protected app (session cookie required)"]
        direction TB
        D["📊 Dashboard /dashboard"]
        T["🧾 Transactions /transactions"]
        A["🛒 Add a purchase /add"]
        S["✅ Purchase saved /add/saved"]
        P["🛍️ My purchases /purchases"]
        B["🎯 Budgets /budgets"]
        SH["🤝 Shared expenses /shared"]
        SU["🔁 Subscriptions /subscriptions"]
        G["⭐ Savings goals /goals"]
        ST["⚙️ Settings /settings"]
    end

    L --> LG
    LG -- "email link" --> RP
    RP --> D
    LG -- "logged in" --> D
    D --> T
    D --> A
    A --> S
    D --> P
    D --> B
    D --> SH
    D --> SU
    D --> G
    D --> ST

    classDef public fill:#FBE38E,stroke:#F2D06B,color:#3B2F12,stroke-width:2px
    classDef app fill:#8A6406,stroke:#57400A,color:#FFFFFF,stroke-width:2px
    class L,LG,RP public
    class D,T,A,S,P,B,SH,SU,G,ST app
    style APP fill:#FFFBEF,stroke:#8A6406,stroke-width:2px,color:#3B2F12
```

<sub>🟨 Public pages · 🟫 App pages (signed in). Unknown routes redirect to the landing page.</sub>

---

## 🏗️ Architecture (UML)

<sub>Colour key: 🟨 **frontend** · 🟫 **backend** · 🟩 **database** · 🟦 **external services**</sub>

### a) Component diagram

```mermaid
flowchart LR
    subgraph CLIENT["React client (client/src)"]
        direction TB
        PG["pages: Dashboard, Budgets, Shared..."]
        CO["components: Sidebar, Topbar, Modal, Insights..."]
        CX["context: AuthContext, AppContext"]
        LB["lib: api.js, useApi, format, passwordRules"]
        PG --> CO
        PG --> CX
        CX --> LB
    end

    subgraph API["Express API (server/src)"]
        direction TB
        RT["routes: auth, me, transactions, budgets, shared, plans..."]
        AU["auth middleware: requireAuth, JWT cookie"]
        LI["lib: finance, sharing, plans, mailer, util"]
        JB["jobs: subscriptions, cleanup"]
        AU --> RT
        RT --> LI
        JB --> LI
    end

    DB[("PostgreSQL on Supabase")]
    MJ["Mailjet HTTP API (production)"]
    SM["SMTP, e.g. Gmail (development)"]

    LB -- "fetch /api, JSON + cookie" --> AU
    LI -- "pg, parameterized SQL" --> DB
    LI -- "HTTPS" --> MJ
    LI -.->|"SMTP"| SM

    classDef fe fill:#FBE38E,stroke:#F2D06B,color:#3B2F12,stroke-width:2px
    classDef be fill:#8A6406,stroke:#57400A,color:#FFFFFF,stroke-width:2px
    classDef db fill:#15803D,stroke:#0F5F2D,color:#FFFFFF,stroke-width:2px
    classDef ext fill:#1D4ED8,stroke:#1E3A8A,color:#FFFFFF,stroke-width:2px
    class PG,CO,CX,LB fe
    class RT,AU,LI,JB be
    class DB db
    class MJ,SM ext
    style CLIENT fill:#FFFBEF,stroke:#F2D06B,color:#3B2F12
    style API fill:#FFF4D6,stroke:#8A6406,color:#3B2F12
```

### b) Deployment diagram

```mermaid
flowchart LR
    U["👩‍🎓 User's browser"]

    subgraph VERCEL["▲ Vercel"]
        VS["Static React build, dist"]
        VR["Rewrite /api/* to Render"]
    end

    subgraph RENDER["Render web service"]
        EX["Node 22 + Express API"]
    end

    subgraph SUPA["Supabase"]
        PGB[("PostgreSQL, transaction pooler port 6543")]
    end

    MJ["Mailjet API"]
    MB["📬 User's mailbox"]

    U -- "HTTPS spendsmart-tn.vercel.app" --> VS
    U -- "HTTPS /api/... same origin, cookie sent" --> VR
    VR -- "HTTPS proxy" --> EX
    EX -- "SSL" --> PGB
    EX -- "HTTPS POST /v3.1/send" --> MJ
    MJ --> MB

    classDef fe fill:#FBE38E,stroke:#F2D06B,color:#3B2F12,stroke-width:2px
    classDef be fill:#8A6406,stroke:#57400A,color:#FFFFFF,stroke-width:2px
    classDef db fill:#15803D,stroke:#0F5F2D,color:#FFFFFF,stroke-width:2px
    classDef ext fill:#1D4ED8,stroke:#1E3A8A,color:#FFFFFF,stroke-width:2px
    class U,VS,VR fe
    class EX be
    class PGB db
    class MJ,MB ext
```

> [!IMPORTANT]
> **The same-origin cookie trick.** The browser only ever talks to the **Vercel** domain. Vercel forwards `/api/*` to Render, so for the browser the API is *same-origin*. The session cookie is then a normal first-party cookie (`httpOnly`, `Secure`, `SameSite=Lax`) and is not blocked as a third-party cookie. No CORS is needed in the browser.

### c) Sequence: sign-up and log-in

```mermaid
sequenceDiagram
    autonumber
    actor U as Student
    participant C as React client
    participant A as Express API
    participant D as PostgreSQL
    participant M as Mailjet

    rect rgb(255, 244, 214)
    Note over U,M: Sign-up: no account exists until the email is confirmed
    U->>C: Name, email, strong password
    C->>A: POST /api/auth/register
    A->>A: Zod validation, password rules, bcrypt hash
    A->>D: Save pending_signups with password hash and SHA-256 of a 6-digit code, 15 min
    A->>M: Send the confirmation code
    M-->>U: Email with the code
    A-->>C: 201 needsVerification
    end

    rect rgb(232, 245, 236)
    Note over U,D: Verify the code, max 5 attempts
    U->>C: Types the 6 digits
    C->>A: POST /api/auth/verify-email
    A->>D: Check hash, expiry and attempts
    A->>D: One transaction creates users, profiles and 3 starter sources, deletes the pending row
    A-->>C: 200 user and Set-Cookie ss_session, JWT httpOnly
    end

    rect rgb(230, 238, 255)
    Note over U,D: Later visits
    U->>C: Email and password
    C->>A: POST /api/auth/login
    A->>D: Find user, bcrypt compare
    A-->>C: 200 user and Set-Cookie ss_session
    C->>A: GET /api/summary, cookie sent automatically
    A->>A: requireAuth verifies JWT and password fingerprint
    A-->>C: 200 data of this user only
    end
```

### d) Sequence: adding a purchase

```mermaid
sequenceDiagram
    autonumber
    actor U as Student
    participant C as Add a purchase page
    participant A as Express API
    participant D as PostgreSQL

    U->>C: Amount, name, category, card, date
    C->>A: POST /api/transactions
    A->>A: Zod validation, amount above 0, known category, date in the user time zone
    A->>D: Read the card and its balance from the source_balances view
    alt Card not found or archived
        A-->>C: 404 or 400 with a clear message
    else OK
        A->>D: BEGIN
        A->>D: INSERT INTO transactions
        A->>D: Budget check, spent in the current period vs limit
        opt Threshold reached or limit exceeded, once per period
            A->>D: INSERT INTO notifications
        end
        A->>D: COMMIT
        A-->>C: 201 transaction, balance before and after, budget impact
        C-->>U: Purchase saved screen
    end
```

### e) Entity–relationship diagram

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#FBE38E','primaryBorderColor':'#8A6406','primaryTextColor':'#3B2F12','lineColor':'#8A6406','tertiaryColor':'#FFFBEF'}}}%%
erDiagram
    users ||--|| profiles : "has"
    users ||--o{ password_reset_tokens : "requests"
    profiles ||--o{ sources : "owns"
    profiles ||--o{ transactions : "records"
    sources ||--o{ transactions : "pays"
    profiles ||--o{ budgets : "sets"
    profiles ||--o{ goals : "saves for"
    goals |o--o{ transactions : "deposits"
    profiles ||--o{ subscriptions : "pays"
    sources |o--o{ subscriptions : "charged on"
    subscriptions |o--o{ transactions : "renewals"
    profiles ||--o{ notifications : "receives"
    profiles ||--o{ user_categories : "creates"
    profiles ||--o{ contacts : "knows"
    profiles ||--o{ contact_invites : "sends"
    profiles ||--o{ invite_sends : "rate-limits"
    profiles ||--o{ groups : "owns"
    groups ||--o{ group_members : "has"
    profiles ||--o{ group_members : "joins"
    groups ||--o{ group_email_invites : "invites"
    profiles ||--o{ split_requests : "sends and receives"
    groups |o--o{ split_requests : "within"
    split_requests |o--o{ transactions : "settled by"
    profiles ||--o{ shared_plans : "creates"
    groups |o--o{ shared_plans : "for"
    shared_plans ||--o{ shared_plan_members : "has"
    profiles ||--o{ shared_plan_members : "takes part"
    shared_plans |o--o{ transactions : "contributions"

    users {
        uuid id PK
        text email UK
        text password_hash
        text google_id UK
        timestamptz email_verified_at
    }
    profiles {
        uuid id PK, FK
        text full_name
        text currency
        text timezone
        boolean notify_budget
    }
    pending_signups {
        uuid id PK
        text email UK
        text password_hash
        text code_hash
        timestamptz code_expires_at
        int attempts
    }
    password_reset_tokens {
        uuid id PK
        uuid user_id FK
        text token_hash UK
        timestamptz expires_at
    }
    sources {
        uuid id PK
        uuid user_id FK
        text name
        text kind
        numeric starting_balance
        timestamptz archived_at
    }
    transactions {
        uuid id PK
        uuid user_id FK
        uuid source_id FK
        text kind
        text category
        numeric amount
        timestamptz occurred_at
    }
    budgets {
        uuid id PK
        uuid user_id FK
        text category
        numeric limit_amount
        text period
        int alert_threshold
    }
    goals {
        uuid id PK
        uuid user_id FK
        text name
        numeric target
        date target_date
    }
    subscriptions {
        uuid id PK
        uuid user_id FK
        uuid source_id FK
        numeric price
        date next_renewal
    }
    notifications {
        uuid id PK
        uuid user_id FK
        text type
        text dedupe_key
        boolean read
    }
    contacts {
        uuid id PK
        uuid owner_id FK
        uuid contact_id FK
        text relation
    }
    contact_invites {
        uuid id PK
        uuid from_user FK
        text to_email
        text status
    }
    groups {
        uuid id PK
        uuid owner_id FK
        text name
    }
    group_members {
        uuid group_id FK
        uuid user_id FK
        text status
    }
    split_requests {
        uuid id PK
        uuid from_user FK
        uuid to_user FK
        numeric share_amount
        text status
    }
    shared_plans {
        uuid id PK
        uuid created_by FK
        text item_name
        numeric target_amount
        int months
    }
    shared_plan_members {
        uuid plan_id FK
        uuid user_id FK
        numeric share_pct
    }
```

<sub>Balances come from the <code>source_balances</code> view: starting balance + income − everything else. Also in the schema: <code>group_email_invites</code>, <code>invite_sends</code>, <code>user_categories</code>, and the legacy <code>shared_budgets</code> / <code>shared_budget_limits</code> (migrated to <code>shared_plans</code>). All 8 migrations are in <a href="supabase/migrations"><code>supabase/migrations/</code></a>.</sub>

### f) Use cases

```mermaid
flowchart LR
    V["👤 Visitor"]
    S["👩‍🎓 Student, signed in"]
    F["🧑‍🤝‍🧑 Friend or group member"]
    J["⏰ Hourly server job"]

    subgraph SYS["💰 SpendSmart"]
        direction TB
        UC1(["Sign up with email code"])
        UC2(["Log in, reset password"])
        UC3(["Manage cards and wallets"])
        UC4(["Add a purchase or income"])
        UC5(["Set budgets and get alerts"])
        UC6(["View dashboard insights"])
        UC7(["Track subscriptions"])
        UC8(["Save toward goals"])
        UC9(["Invite contacts and groups"])
        UC10(["Split a bill, settle up"])
        UC11(["Save together on a plan"])
        UC12(["Charge renewals, send reminders"])
    end

    V --> UC1
    V --> UC2
    S --> UC3
    S --> UC4
    S --> UC5
    S --> UC6
    S --> UC7
    S --> UC8
    S --> UC9
    S --> UC10
    S --> UC11
    F -- "accepts or declines" --> UC9
    F -- "accepts or declines" --> UC10
    F --> UC11
    J --> UC12

    classDef actor fill:#1D4ED8,stroke:#1E3A8A,color:#FFFFFF,stroke-width:2px
    classDef uc fill:#FBE38E,stroke:#8A6406,color:#3B2F12,stroke-width:2px
    classDef job fill:#8A6406,stroke:#57400A,color:#FFFFFF,stroke-width:2px
    class V,S,F actor
    class J job
    class UC1,UC2,UC3,UC4,UC5,UC6,UC7,UC8,UC9,UC10,UC11,UC12 uc
    style SYS fill:#FFFBEF,stroke:#8A6406,stroke-width:2px,color:#3B2F12
```

<div align="right"><a href="#top">⬆️ Back to top</a></div>

---

## 🧰 Tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| 🎨 UI | **React 18** | Components and hooks, a huge ecosystem |
| ⚡ Build | **Vite 6** | Instant dev server, fast builds with code splitting |
| 🧭 Routing | **React Router 6** | Client-side routes, protected app layout |
| 📊 Charts | **Recharts 2** | Declarative SVG charts for the dashboard insights |
| 🟢 Runtime | **Node.js 22** | Same language front and back; built-in `fetch` and `--env-file` |
| 🚂 API | **Express 4** | Small and well known; routers, middleware |
| ✅ Validation | **Zod** | One schema per request body, readable errors |
| 🗄️ Database | **PostgreSQL** (on **Supabase**) | Relations, transactions, constraints and views for money data |
| 🔌 DB driver | **pg** | Plain parameterized SQL, connection pool |
| 🔑 Auth | **bcryptjs** + **jsonwebtoken** | Password hashing and a signed session cookie |
| 🚦 Protection | **express-rate-limit**, **compression**, **cors** | Brute-force limits, gzip, origin allow-list |
| ✉️ Email | **Mailjet** HTTP API (prod), **nodemailer** SMTP (dev) | HTTPS works where SMTP ports are blocked |
| ☁️ Hosting | **Vercel** + **Render** | Free tiers, auto-deploy from GitHub |
| 🧹 Quality | **ESLint 9** + **Prettier 3** | Same rules and style for client and server |

> [!NOTE]
> **Why Supabase only as PostgreSQL?** We use Supabase only as a **hosted PostgreSQL database**. Authentication, business logic and emails are **our own Node.js API**: accounts live in our `users` table, passwords are hashed by us, sessions are our JWT cookies. We don't use Supabase Auth, the Data API or Edge Functions. This way we wrote and understand every part of the security, and the app could move to any PostgreSQL server.

---

## 🔐 Security

| | Measure | Detail |
| --- | --- | --- |
| 🔑 | **Password hashing** | **bcrypt**, cost 12. Unknown emails are compared against a dummy hash, so timing doesn't reveal which accounts exist |
| 💪 | **Strong passwords** | 8–72 characters, upper and lower case, a number, a symbol, not your name or email, not a common password. One shared rule file for the client checklist and the server |
| 🍪 | **Session cookie** | JWT (HS256) in an **httpOnly**, `SameSite=Lax`, `Secure` cookie that JavaScript can't read. It contains a password fingerprint, so a password reset signs out other sessions |
| 🔢 | **Email codes** | 6 digits from a cryptographic RNG, stored **only as a SHA-256 hash**, valid **15 min**, **5 attempts** max, resend once per minute |
| 🔗 | **Password reset** | Random token stored hashed, valid **1 hour**, single use |
| 🚦 | **Rate limiting** | Per IP on login, register, verify, resend, forgot and reset password (e.g. 10 failed logins / 15 min), using the real client IP behind the proxy |
| 🧱 | **SQL injection** | Every query is **parameterized** (`$1, $2…`), never built from user strings |
| 👤 | **Per-user data** | Every query is filtered by the signed-in user's id; another user's id returns 404 |
| 🗄️ | **Row Level Security** | **RLS on with no policies** on every table, so Supabase's public Data API can read nothing. Only our API (as table owner) reaches the data |
| 🤝 | **Consent before sharing** | Nobody becomes your contact, joins your group or sees your spending without **accepting an invitation** |
| 🌐 | **Cross-site requests** | CORS allow-list (`CLIENT_ORIGIN`) plus an `Origin` check on every state-changing request |
| 🔒 | **Secrets** | Only in **environment variables** (Render / local `.env`, git-ignored), never in the code or the repository |

<div align="right"><a href="#top">⬆️ Back to top</a></div>

---

## ⚡ Performance

Measured with `npm run build` and **Lighthouse 13** on the production build. Details and reports are in [`docs/performance.md`](docs/performance.md) and [`docs/lighthouse/`](docs/lighthouse).

| Metric | Before | After | |
| --- | ---: | ---: | :---: |
| JavaScript on first visit (gzip) | 221 kB | **77 kB** | 🟢 −65 % |
| Total page weight | 925 KiB | **175 KiB** | 🟢 −81 % |
| Login page, mobile performance score | 76 | **95** | 🟢 +19 |
| Login page, mobile LCP | 6.8 s | **3.0 s** | 🟢 −56 % |
| Accessibility · Best practices · SEO | 98 · 96 · 91 | **100 · 100 · 100** | 🟢 |

**What we did**

- 🧩 **Lazy loading:** every app page is loaded with `React.lazy` when first opened; the sidebar stays visible with a skeleton meanwhile.
- 📦 **Vendor chunks:** `react-vendor` (cached across deploys) and `charts` (Recharts, loaded only with the dashboard); the dashboard is preloaded right after log-in.
- 🗜️ **Compression:** gzip on the API responses.
- 🗃️ **Caching:** hashed `/assets/*` cached for a year (`immutable`); `index.html` always revalidated (`no-cache`).
- 🔤 **Fonts:** only the weights in use, loaded without blocking the first paint.
- ♿ **Accessibility:** `<main>` landmarks, labels, contrast fixes, `robots.txt` and meta tags.
- 🧹 **Code quality:** ESLint (React, Hooks, jsx-a11y) with **0 errors**, Prettier formatting, hook dependencies fixed properly.

---

## 🚀 Deployment

| Part | Platform | What runs there |
| --- | --- | --- |
| 🎨 Frontend | **Vercel** | Static React build from `client/`, plus the `/api/*` rewrite |
| 🚂 API | **Render** (free web service) | `npm run start -w server`, Node 22, health check `GET /api/health` |
| 🗄️ Database | **Supabase** | PostgreSQL, Transaction pooler (port 6543), SSL |
| ✉️ Email | **Mailjet** | HTTP API, because Render's free plan blocks SMTP ports |

**The rewrite** ([`client/vercel.json`](client/vercel.json)): `/api/*` goes to Render, everything else to the SPA.

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://<render-service>.onrender.com/api/:path*" },
  { "source": "/(.*)", "destination": "/index.html" }
]
```

**Environment variables** (names only, values live in each platform's dashboard):

| Variable | Platform | Purpose |
| --- | --- | --- |
| `NODE_ENV`, `NODE_VERSION` | Render | `production` and `22` (set in [`render.yaml`](render.yaml)) |
| `DATABASE_URL` | Render | Supabase Transaction pooler connection string |
| `JWT_SECRET` | Render | Signs the session cookies |
| `CLIENT_ORIGIN` | Render | The Vercel URL, the only origin CORS allows |
| `APP_URL` | Render | The Vercel URL, used in password-reset links |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` | Render | Mailjet API keys |
| `SMTP_FROM` | Render | Sender name and address (validated in Mailjet) |
| `GOOGLE_CLIENT_ID` | Render | *Optional*: Google sign-in |
| `TRUST_PROXY`, `LOG_CLIENT_IP` | Render | *Optional*: proxy hops for the client IP, and a debug log |
| `BREVO_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Render / local | *Optional*: other email transports (Brevo API, or SMTP for local development) |
| `VITE_API_URL` | Vercel | Leave **empty**: the client calls relative `/api` URLs |

> [!TIP]
> **Redeploying is just `git push`.** A push to `main` auto-deploys **both** Vercel (frontend) and Render (API).
> Database migrations are **not** run on deploy. Run `npm run db:migrate -w server` by hand when a new file appears in `supabase/migrations/`.

<div align="right"><a href="#top">⬆️ Back to top</a></div>

---

## 💻 Run it locally

**Prerequisites**

- **Node.js 22.9+** (the scripts use `--env-file-if-exists`)
- A **Supabase project** (free tier), or any PostgreSQL 15+ server

**1. Environment variables:** copy the examples and fill them in. The files explain every variable.

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

| File | Variables |
| --- | --- |
| `server/.env` | `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`, `APP_URL`, optional `GOOGLE_CLIENT_ID`, email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (or `MAILJET_API_KEY` + `MAILJET_SECRET_KEY`) |
| `client/.env` | `VITE_API_URL` (leave empty: Vite proxies `/api` to port 4000) |

> [!TIP]
> No email service set up locally? Leave the email variables empty: the **confirmation code is printed in the server console**.

**2. Install, migrate, run**

```bash
npm install
npm run db:migrate -w server
npm run dev
```

Then open **http://localhost:5173** 🎉

**3. Check the code**

```bash
npm run lint             # ESLint, client + server
npm run smoke -w server  # end-to-end smoke test against a real database
npm run build            # production build of the client
```

> [!CAUTION]
> `.env` files hold secrets and are **git-ignored**. Never commit them.

---

## 📁 Project structure

```text
spendsmart/
├── client/                    🎨 React app (Vite)
│   ├── public/                   favicon, robots.txt
│   ├── src/
│   │   ├── pages/                one file per screen (+ lazy.js for code splitting)
│   │   ├── components/           Sidebar, Topbar, Modal & UI kit, Insights charts, cards
│   │   ├── context/              AuthContext (session) and AppContext (data, toasts)
│   │   ├── lib/                  api client, useApi hook, formatting, password rules, icons
│   │   └── styles/               app.css + motion.css (animations)
│   ├── vercel.json               Vercel build, /api rewrite, cache headers
│   └── vite.config.js            dev proxy and vendor chunks
├── server/                    🚂 Express API
│   ├── src/
│   │   ├── index.js              app setup, security middleware, error handler
│   │   ├── auth.js               JWT cookie session, requireAuth
│   │   ├── db.js                 pg pool, transactions, timeouts
│   │   ├── routes/               auth, me, transactions, budgets, goals, subscriptions, shared, plans…
│   │   ├── lib/                  finance, sharing, plans, mailer, password rules, cleanup
│   │   └── jobs/                 subscription renewals and reminders
│   └── scripts/                  migrate, smoke test, email test, cleanup
├── supabase/migrations/       🗄️ SQL migrations (schema, RLS, constraints, views)
├── docs/                      📚 performance report, Lighthouse reports, backend audit
├── scripts/                      Lighthouse helpers
├── render.yaml                ☁️ Render Blueprint for the API
├── eslint.config.js              ESLint flat config (+ .prettierrc)
└── package.json                  npm workspaces and root scripts
```

<div align="right"><a href="#top">⬆️ Back to top</a></div>

---

## 🔌 API overview

All routes are under `/api` and use JSON. 🔒 = needs the session cookie.

| Area | Endpoints |
| --- | --- |
| 🔑 **Auth** | `POST /auth/register` · `POST /auth/verify-email` · `POST /auth/resend-code` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/google` · `GET /auth/session` · `GET /auth/me` · `GET /auth/config` |
| ❤️ Health | `GET /health` (no database access) |
| 👤 Profile 🔒 | `GET /me` · `PATCH /me` |
| 💳 Sources 🔒 | `GET /sources` · `POST /sources` · `PATCH /sources/:id` · `DELETE /sources/:id` (archive) · `POST /sources/:id/restore` |
| 📊 Summary 🔒 | `GET /summary` · `GET /analytics` · `POST /demo/seed` |
| 🧾 Transactions 🔒 | `GET /transactions` · `POST /transactions` · `DELETE /transactions/:id` |
| 🎯 Budgets 🔒 | `GET /budgets` · `POST /budgets` · `PATCH /budgets/:id` · `DELETE /budgets/:id` |
| ⭐ Goals 🔒 | `GET /goals` · `POST /goals` · `PATCH /goals/:id` · `DELETE /goals/:id` · `POST /goals/:id/contribute` |
| 🔁 Subscriptions 🔒 | `GET /subscriptions` · `POST /subscriptions` · `PATCH /subscriptions/:id` · `DELETE /subscriptions/:id` |
| 🤝 Sharing 🔒 | `GET /shared` · `POST /contacts` · `DELETE /contacts/:id` · `GET /invites` · `POST /invites/:id/accept` · `POST /invites/:id/decline` · `POST /groups` · `POST /groups/:id/invite` · `POST /groups/:id/accept` · `POST /groups/:id/leave` · `POST /splits` · `POST /splits/:id/accept` · `POST /splits/:id/decline` · `POST /settle` |
| 🐷 Saving together 🔒 | `GET /shared-plans` · `POST /shared-plans` · `PATCH /shared-plans/:id` · `POST /shared-plans/:id/contribute` · `DELETE /shared-plans/:id` · `GET /categories` · `POST /categories` |
| 🔔 Notifications 🔒 | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` |

---

## 🎨 Design

A warm **cream and gold** theme that is friendly, calm and easy to read.

![Gold](https://img.shields.io/badge/Gold-%23FBE38E-FBE38E?style=for-the-badge)
![Deep gold](https://img.shields.io/badge/Deep%20gold-%23F2D06B-F2D06B?style=for-the-badge)
![Cream](https://img.shields.io/badge/Cream-%23FFFBEF-FFFBEF?style=for-the-badge)
![Ink](https://img.shields.io/badge/Ink-%233B2F12-3B2F12?style=for-the-badge)
![Cocoa](https://img.shields.io/badge/Cocoa-%2357400A-57400A?style=for-the-badge)
![Green](https://img.shields.io/badge/Green-%2315803D-15803D?style=for-the-badge)
![Amber](https://img.shields.io/badge/Amber-%23B45309-B45309?style=for-the-badge)
![Red](https://img.shields.io/badge/Red-%23DC2626-DC2626?style=for-the-badge)

| | |
| --- | --- |
| 🔤 **Fonts** | **Poppins** (400–700) for the interface · **Caveat** (700) for the handwritten taglines like *"Every coin counts!"* |
| 📱 **Responsive** | Sidebar on desktop, a **bottom tab bar** on phones; modals become bottom sheets |
| 🪄 **Animations** | Spinning coins, scroll reveals and soft transitions, all turned off with `prefers-reduced-motion` |
| ♿ **Accessible** | Keyboard focus trap in modals, `Esc` to close, ARIA labels, Lighthouse accessibility **100** |

---

## 📸 Screenshots

<!--
  TODO: add screenshots of the live app here.
  Put the images in docs/screenshots/ with these names (PNG, ~1280 px wide):
    docs/screenshots/landing.png
    docs/screenshots/dashboard.png
    docs/screenshots/add-purchase.png
    docs/screenshots/budgets.png
    docs/screenshots/shared.png
    docs/screenshots/mobile.png
  Then replace this comment with the table below (remove the HTML comment markers around it):

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/landing.png" alt="Landing page" width="100%"><br><b>🏠 Landing</b></td>
    <td align="center"><img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%"><br><b>📊 Dashboard</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/add-purchase.png" alt="Add a purchase" width="100%"><br><b>🛒 Add a purchase</b></td>
    <td align="center"><img src="docs/screenshots/budgets.png" alt="Budgets" width="100%"><br><b>🎯 Budgets</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/shared.png" alt="Shared expenses" width="100%"><br><b>🤝 Shared expenses</b></td>
    <td align="center"><img src="docs/screenshots/mobile.png" alt="Mobile view" width="100%"><br><b>📱 Mobile</b></td>
  </tr>
</table>
-->

> [!NOTE]
> Screenshots are coming soon. In the meantime, try the **[live demo](https://spendsmart-tn.vercel.app)** 🚀

---

## 👥 Team

<div align="center">

| | Member | Role |
| :---: | --- | --- |
| 👩‍💻 | **Maram Kouki** | [role] |
| 👩‍💻 | **Imen Khedimallah** | [role] |
| 👩‍💻 | **Emna Borchani** | [role] |

**Supervisor:** Dr. Maroua Nouioua<br>
**SUP'COM** · Projet Web 2026/2027 · Group 13

<br>

*Made with 💛 and a lot of coffee ☕. Spend smart, live happy!*

<a href="#top">⬆️ Back to top</a>

</div>
