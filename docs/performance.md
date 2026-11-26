# SpendSmart: performance and code quality (Objective 4)

Optimization pass with **no feature or visual changes**. All numbers come from `npm run build` (Vite 6) and
Lighthouse 13.6 (headless Chrome). Measured on 2026-11-26 against the production build served by Express
(`NODE_ENV=production`) on `http://localhost:4100`. Port 4000 was taken by a running dev server.

## 1. Bundle size

### Before

| File | Size | Gzip |
| --- | ---: | ---: |
| `index.html` | 0.96 kB | 0.50 kB |
| `assets/index.css` | 66.51 kB | 13.75 kB |
| `assets/index.js` (whole app, one file) | 769.62 kB | 221.11 kB |
| **JS downloaded on first visit** | **769.62 kB** | **221.11 kB** |

### After

| File | Before | After | Gzip (after) | Loaded |
| --- | ---: | ---: | ---: | --- |
| `index.html` | 0.96 kB | 1.85 kB | 0.83 kB | always |
| `assets/index.css` | 66.51 kB | 54.15 kB | 11.61 kB | always |
| `assets/Shared.css` | – | 12.49 kB | 2.92 kB | with the Shared page |
| `assets/index.js` (app shell, Landing, Login) | 769.62 kB | 68.15 kB | 23.12 kB | always |
| `assets/react-vendor.js` (react, react-dom, react-router-dom) | – | 164.06 kB | 53.66 kB | always (cached long-term) |
| `assets/charts.js` (recharts) | – | 434.49 kB | 116.81 kB | only with Dashboard |
| `assets/Dashboard.js` | – | 11.36 kB | 4.15 kB | preloaded after log-in |
| `assets/Shared.js` | – | 37.11 kB | 11.66 kB | on demand |
| `assets/Budgets.js` | – | 9.27 kB | 3.33 kB | on demand |
| `assets/Goals.js` | – | 8.37 kB | 3.03 kB | on demand |
| `assets/Settings.js` | – | 7.44 kB | 2.79 kB | on demand |
| `assets/Subscriptions.js` | – | 6.37 kB | 2.46 kB | on demand |
| `assets/AddPurchase.js` | – | 5.96 kB | 2.45 kB | on demand |
| `assets/Transactions.js` | – | 5.74 kB | 2.42 kB | on demand |
| `assets/PurchaseSaved.js` | – | 5.53 kB | 2.14 kB | on demand |
| `assets/Purchases.js` | – | 5.28 kB | 2.15 kB | on demand |
| `assets/ResetPassword.js` | – | 2.30 kB | 1.18 kB | on demand |
| `assets/AddMoneyForm.js` (shared by Goals/Shared) | – | 2.27 kB | 1.08 kB | on demand |
| `assets/useApi.js` (shared hook) | – | 0.58 kB | 0.39 kB | on demand |
| **JS downloaded on first visit (`/`, `/login`)** | **769.62 kB** | **232.21 kB** | **76.78 kB** | |

**Result:** a first visit downloads **70 % less JavaScript** (221 kB → 77 kB gzip). Lighthouse saw the JS
transfer go from 752 KiB to 77 KiB, and the whole page weight from 925 KiB to 175 KiB (gzip is now on too).

`index.html` grew by 0.9 kB because of the non-blocking font tags and the `<noscript>` message.

## 2. Optimizations

**Code splitting (client)**
- Every signed-in page (Dashboard, Transactions, AddPurchase, PurchaseSaved, Purchases, Budgets, Shared,
  Subscriptions, Goals, Settings, ResetPassword) is loaded with `React.lazy` (`client/src/pages/lazy.js`).
- Landing and Login stay in the main bundle because they are the first screens.
- The `<Suspense>` fallback sits inside `AppLayout`, so the sidebar and top bar stay visible while a page
  downloads. The fallback shows the existing `SkeletonRows` skeleton.
- `manualChunks` in `client/vite.config.js`:
  - `react-vendor` (react, react-dom, react-router-dom) only changes when a library is upgraded, so browsers
    keep it cached across deploys.
  - `charts` (recharts, the largest library) is downloaded only for the dashboard.
- The Dashboard chunk is preloaded as soon as a log-in succeeds (`preloadDashboard()` in `Login.jsx`), so the
  first page after logging in opens without waiting.
- A new `GET /api/auth/session` endpoint returns `{ user: null }` with status 200 when there is no session.
  Before, the app called a protected endpoint on startup, so every logged-out visit logged a 401 error in the
  console, which cost a Best-practices point.

**Static files and HTML**
- Google Fonts:
  - preconnect and `display=swap` are kept;
  - only the weights in use are requested (Caveat 700; Caveat 600 was never used; Poppins 400–700);
  - the stylesheet loads without blocking the first paint (`preload` + `media="print"` swap), with a
    `<noscript>` fallback.
- `index.html`: `lang="en"`, meta description, `theme-color` and a `<noscript>` message.
- `client/public/robots.txt` allows `/` and `/login` and blocks the signed-in pages and `/api/`.
- Landmarks: Landing, Login and ResetPassword now have a `<main>` element (no visual change).
- The decorative "DT" lettering on coins is drawn with CSS (`::before { content: attr(data-label) }`).
  Lighthouse was checking the contrast of this lettering even though it is `aria-hidden`, which made the
  accessibility score drop in some runs.

**Server (Express, production)**
- `compression` middleware: gzip for the API and the static files.
- Cache headers:
  - `/assets/*` (hashed file names): `Cache-Control: public, max-age=31536000, immutable`;
  - `index.html` (including the SPA fallback): `Cache-Control: no-cache`, so a deploy is picked up right away;
  - other public files (favicon, robots.txt): one hour.

**Dependencies**
- Every dependency in `client/package.json` and `server/package.json` was grepped and is used.
  `nodemailer` and `google-auth-library` are loaded with a dynamic `import()`.
- `multer` and `file-type` were removed (receipt upload was removed in the previous pass).
- Added: `compression` (server); ESLint and Prettier (root devDependencies).

**Not changed, on purpose**
- Source maps (`valid-source-maps` audit, informational): not shipped to production. They would expose the
  full source and double the download for no user benefit. Enable them with `build.sourcemap: true` for
  debugging.
- `bf-cache`: the app keeps a live session and notification polling, so the browser declines to store the
  page in the back/forward cache. Fixing this would change behaviour.
- The remaining render-blocking item is the app's own 11.6 kB CSS, which has to load before the first paint
  to avoid a flash of unstyled content.

## 3. Lighthouse

Pages: `/` (Landing) and `/login`. Presets: `desktop` and the default mobile preset (Moto G Power, slow 4G,
4× CPU throttling). Reports are in `docs/lighthouse/` (`before-*` and `after-run1..3-*`, HTML and JSON).

Scores are listed as Performance / Accessibility / Best practices / SEO. "After" is the **median of 3 runs**.

| Page | Preset | Before | After (median) | After runs (perf) |
| --- | --- | --- | --- | --- |
| `/` | desktop | 100 / 98 / 96 / 91 | **93 / 100 / 100 / 100** | 87, 100, 93 |
| `/` | mobile | 98 / 98 / 96 / 91 | **95 / 100 / 100 / 100** | 95, 95, 71 |
| `/login` | desktop | 99 / 98 / 96 / 91 | **100 / 100 / 100 / 100** | 100, 100, 100 |
| `/login` | mobile | 76 / 98 / 96 / 91 | **95 / 100 / 100 / 100** | 87, 95, 96 |

Key metrics (before → after, median run):

| Page / preset | FCP | LCP | TBT | CLS | Page weight | JS transfer |
| --- | --- | --- | --- | --- | --- | --- |
| `/` desktop | 0.55 s → 0.21 s | 0.55 s → 0.89–1.2 s | 0 → 23–293 ms | 0.019 → 0.016 | 925 → 175 KiB | 752 → 77 KiB |
| `/` mobile | 1.65 s → 0.76 s | 1.65 s → 2.8–2.9 s | 11 → 0–73 ms | 0.051 → 0.051 | 925 → 175 KiB | 752 → 77 KiB |
| `/login` desktop | 0.64 s → 0.20 s | 0.64 s → 0.20 s | 0 → 0 ms | 0.006 → 0.006 | 926 → 175 KiB | 752 → 77 KiB |
| `/login` mobile | 1.76 s → 0.75 s | **6.81 s → 2.98 s** | 0 → 3 ms | 0.009 → 0.009 | 926 → 175 KiB | 752 → 77 KiB |

**Reading the numbers**
- Accessibility, Best practices and SEO are 100 on every page and preset, in every run.
- First paint is about 2–3× faster everywhere, and login on mobile went from 76 to 95.
- The Landing page's performance score varies from run to run (71–100). The variance is not caused by
  JavaScript: in the slow runs, main-thread time is "Other"/style-layout/paint from the Landing animations
  (3D coin carousel, scroll reveals), plus one long "Unattributable" task. Script evaluation is ~100 ms.
- On `/`, LCP is now the hero text painted in Poppins after the web font arrives. Before, it was measured at
  first paint with the fallback font. This is why LCP looks later even though FCP is 2–3× earlier.
- The "before" numbers are a single run, and Lighthouse varies by several points between runs. Compare the
  sizes and metrics, not one score.

**Reproduce**
```bash
npm run build
cd server && PORT=4100 NODE_ENV=production node --env-file-if-exists=.env src/index.js   # second terminal
BASE=http://localhost:4100 bash scripts/lighthouse.sh mylabel   # → docs/lighthouse/mylabel-*.report.html
node scripts/lh-metrics.cjs docs/lighthouse/mylabel-*.report.json
```

**Dashboard (needs a logged-in session), in Chrome DevTools**
1. Run the production build (above) and open `http://localhost:4100/login` in Chrome. Log in with a test or
   demo account.
2. Go to `/dashboard`. Open DevTools (F12), then the **Lighthouse** tab.
3. Choose *Navigation*, the *Mobile* or *Desktop* device, and all categories. Click **Analyze page load**.
   DevTools keeps your session cookie, so the dashboard is measured logged in.
4. Use an Incognito window with no extensions (extensions slow the run down), and repeat 2–3 times.

## 4. ESLint and Prettier

**Files**
- `eslint.config.js` (flat config, ESLint 9):
  - `@eslint/js` recommended for everything;
  - for `client/**` (browser globals, JSX): `eslint-plugin-react` (recommended + jsx-runtime),
    `eslint-plugin-react-hooks` (rules-of-hooks, exhaustive-deps), `eslint-plugin-jsx-a11y` (recommended);
  - for `server/**`, `scripts/**` and the config files: Node globals;
  - `eslint-config-prettier` last, so no formatting rule clashes with Prettier.
- Rule choices:
  - `react/prop-types` is off (plain JS project).
  - `react/no-unescaped-entities` only forbids `>` and `}`. Apostrophes in text are valid JSX.
  - `no-unused-vars` ignores names that start with `_`.
- `.prettierrc`: `singleQuote`, `semi`, `printWidth: 120`, `trailingComma: "es5"`.
- `.prettierignore`: `dist`, `node_modules`, `coverage`.

**Root scripts**
```json
"lint": "eslint client/src server/src",
"lint:fix": "eslint client/src server/src --fix",
"format": "prettier --write client/src server/src"
```

**What was fixed** (after `lint:fix` + `format`, 24 errors were left and fixed by hand)
- Unused code: the `Icon` import in `Topbar.jsx`, the `query` import in `server/src/routes/subscriptions.js`,
  and the `INK` constant in `Insights.jsx`.
- Hook dependencies: four existing `eslint-disable … exhaustive-deps` comments were removed and the hooks
  fixed properly:
  - `Topbar`: `load` is now a `useCallback` on `toast`.
  - `GoogleButton`: `onError` is kept in a ref, like `onCredential`.
  - `Shared`: the invites `reload` is pulled into a stable variable.
  - `PlanModal`: the member lookup moved inside the effect.
- `jsx-a11y/no-autofocus` (3 places): replaced by focus effects that run when the field appears (code boxes,
  "Other" amount, new category). Behaviour is unchanged.
- `jsx-a11y/no-static-element-interactions` (2 places) is disabled on those lines only, with a comment:
  - the modal backdrop only catches outside clicks (Escape closes it from the keyboard);
  - the menu wrapper handles arrow keys for the buttons inside it.
- Comments were added where the logic isn't obvious:
  - how a balance is computed (`getSources` / the `source_balances` view);
  - the auth flow overview (top of `routes/auth.js`);
  - budget periods (`periodDates`, `budgetPeriod`);
  - the subscription job, which already had a full header comment.

**Final check:** `npm run lint` → **0 errors, 0 warnings**. `prettier --check` → all files formatted.
Smoke test (`npm run smoke -w server`) → **198 passed, 0 failed**.
