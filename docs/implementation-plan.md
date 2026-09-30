# Finance Tracker — Implementation Plan

> Status (2026-09-29): all items below are implemented. See README.md for how to run.

## Context
A new standalone personal-finance app at `~/Developer/Projects/finance-tracker`. Users sign up with
name + email (verified by OTP) + password, log in with email/password, reset a forgotten password by OTP,
and log out. Once in, they record **credit** (salary, freelance, refund…) and **debit** (rent, grocery,
medical, travel, food, shopping…) transactions by date, with full add/edit/delete. They can see
day/week/month/year summaries, charts, budgets, and more. Must be responsive, and feel like a native app on phones.

Decisions confirmed: folder `finance-tracker`; **INR ₹ only** (Indian grouping 1,00,000); OTP email via
**SMTP/nodemailer**; in development any OTP flow accepts **`123456`** (and the OTP is also logged).

Architecture is copied from `~/Developer/Projects/shimlawale-crm` (Bun workspaces, Elysia + Eden Treaty,
Drizzle 1.0 rc + local Postgres, Vite 8 + React 19 + TanStack Router/Query, Tailwind v4 + shadcn-style UI,
sonner, biome, TypeScript 7). Ports: **API 4300, Web 3300** (4000/3001/4200/3200/5173 already taken).

The first implementation step writes this plan into the project as `docs/implementation-plan.md`, plus a
`README.md` and `CLAUDE.md`.

## Feature scope
**Auth** — register (name, email → Send OTP → enter OTP + password), login, forgot password (email → OTP →
new password), logout, change password, edit profile. OTP: 6 digits, hashed, 10-min expiry, 60-s resend
cooldown, 5 verify attempts; dev accepts `123456`. Login rate-limited (5 / 15 min / IP).

**Transactions (CRUD)** — type credit/debit, amount, category, date, payment method (Cash, UPI, Bank,
Debit card, Credit card, Other), note. List grouped by date with day totals; filters (type, category,
payment method, date range, text search), infinite scroll; swipe/long-press actions on mobile.

**Categories** — defaults seeded per user on signup (Income: Salary, Freelance, Business, Interest,
Investment returns, Gift, Refund, Other. Expense: Room rent, Grocery, Food & dining, Medical, Travel,
Shopping, Bills & utilities, Fuel, Education, Entertainment, EMI/Loan, Insurance, Personal care, Other),
each with a lucide icon + colour. User can add/edit/delete custom ones (delete blocked if in use → offer reassign).

**Reports & charts** — period switcher **Day / Week (Mon–Sun) / Month / Year / Custom** with prev/next
arrows. Summary cards: income, expense, net, savings rate, avg daily spend, change vs previous period.
Charts (Recharts via shadcn chart wrapper): income-vs-expense bars over the period's buckets, spend-by-
category donut, cumulative spend trend line, top categories list, and a month calendar with per-day spend.

**Budgets** — monthly overall budget + per-category budgets; progress bars (green <80%, amber 80–100%,
red >100%); dashboard warnings when crossing 80% / 100%.

**Extras (finance-related additions)**
- Recurring transactions (monthly rent, salary, EMIs, subscriptions): daily/weekly/monthly/yearly rules,
  auto-posted by an hourly server job; pause/edit/delete.
- Savings goals: target amount + date, add contributions, progress ring.
- CSV export of filtered transactions.
- Dark / light / system theme.
- PWA: installable, app icon, offline shell.

## Architecture & layout
```
finance-tracker/
  package.json            # bun workspaces ["apps/*"], catalog versions copied from shimlawale-crm
  tsconfig.base.json  tsconfig.json  biome.jsonc  .gitignore  README.md  CLAUDE.md
  docs/implementation-plan.md
  .claude/launch.json     # api (bun --cwd apps/api dev, 4300), web (3300)
  apps/api/
    .env.example  drizzle.config.ts
    src/index.ts  env.ts  pre-processor.ts
    src/controllers/{index,auth,profile,transactions,categories,reports,budgets,recurring,goals}-controller.ts
    src/db/{index,connect}.ts  src/db/schema/{index, users/*.sql.ts, finance/*.sql.ts}
    src/db/seed/{index,default-categories,demo-data}.ts
    src/lib/services/{core-auth,otp,mail,rate-limit,recurring-job,report}-service.ts
    src/lib/utils/{index,schema,money,period}.ts
  apps/web/
    vite.config.ts (tanstackRouter, react, tailwindcss, vite-plugin-pwa; proxy /api → 4300)
    src/main.tsx  styles.css  lib/{api,utils,format}.ts  hooks/*  stores/{auth,theme}-store.ts
    src/components/ui/*  components/{common,app,charts,transactions,landing}/*
    src/routes/__root.tsx  index.tsx (landing)  forgot-password.tsx
    src/routes/_app.tsx (guarded shell) + _app/{dashboard,transactions,reports,budgets,categories,recurring,goals,settings}.tsx
```

### Files to copy/adapt from shimlawale-crm (`~/Developer/Projects/shimlawale-crm`)
- Root: `package.json` (catalog), `tsconfig.base.json`, `biome.jsonc`, `.gitignore`.
- API: `src/index.ts` (cors, security headers, `/health`, DB fallback, `export type Server`), `src/env.ts`,
  `src/pre-processor.ts` (`authProcessor` → rename `protectedAdmin` to `protectedUser` deriving `{ user }`),
  `src/lib/services/core-auth-service.ts` (opaque token + `auths` table + httpOnly cookie, rolling expiry),
  `src/lib/services/rate-limit-service.ts`, `src/lib/services/notify-service.ts` (nodemailer transport → `mail-service`),
  `src/lib/utils/{index,schema}.ts` (`ok`/`fail` envelope, `tEnum`), `src/db/{index,connect}.ts`, seed guard.
- Web: `src/lib/api.ts` (Eden `call`/`callMsg`/`ApiError`), `src/integrations/tanstack-query/root-provider.tsx`,
  `src/hooks/use-auth.ts`, `src/stores/auth-store.ts`, `src/components/ui/*`, `src/lib/utils.ts` (`cn`),
  `src/styles.css` tokens (add a real `.dark` palette), `main.tsx`, `__root.tsx`, guarded-layout pattern from `routes/_admin.tsx`.

## Database (Drizzle, callback-style `pgTable`, `$inferSelect` types)
- `users` — id, name, email (unique, lowercased), password_hash (`Bun.password`), monthly_budget_paise (nullable), timestamps.
- `auths` — sessions (as in shimlawale), user_id FK.
- `email_otps` — id, email, purpose (`register` | `reset_password`), code_hash, expires_at, attempts, consumed_at, created_at.
- `categories` — id, user_id, name, type (`credit`|`debit`), icon, color, is_default, unique(user_id, type, name).
- `transactions` — id, user_id, type, amount_paise (bigint, >0), category_id, date (pg `date`), payment_method enum, note, recurring_id (nullable), timestamps; index (user_id, date).
- `budgets` — id, user_id, category_id, amount_paise (monthly), unique(user_id, category_id).
- `recurring_rules` — id, user_id, type, amount_paise, category_id, payment_method, note, frequency enum, start_date, end_date?, next_run_date, is_active.
- `goals` — id, user_id, name, target_paise, saved_paise, target_date?, color; `goal_contributions` — goal_id, amount_paise, date, note.

Money stored as integer **paise**; `lib/utils/money.ts` converts; web `lib/format.ts` uses `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })`.
Every query is scoped by `user.id` from the session (never from the request body).

## API (all under `/api`, `{ success, message, data }` envelope, TypeBox `t` validation)
- `auth`: `POST register/send-otp {name,email}` → 409 if email exists; `POST register/verify {name,email,otp,password}` → create user, seed default categories, set session cookie; `POST login`; `POST logout`; `GET me`; `POST password/forgot {email}` (always 200 to avoid email enumeration); `POST password/reset {email,otp,password}` (revokes other sessions).
- `profile`: `PATCH /` (name, monthly budget), `POST /change-password`.
- `transactions`: `GET` (filters + cursor pagination), `POST`, `PATCH /:id`, `DELETE /:id`, `GET /export.csv`.
- `categories`: CRUD; `DELETE` with optional `reassignTo`.
- `reports`: `GET /summary?period=day|week|month|year|custom&date=&from=&to=` → totals, prev-period comparison, time buckets (hour→day for day/week/month, month for year; via `date_trunc`), category breakdown, top categories. `GET /calendar?month=` → per-day totals.
- `budgets`: `GET ?month=` (budgets joined with actual spend), `PUT` upsert, `DELETE /:id`.
- `recurring`: CRUD + pause/resume; `recurring-job-service` runs at boot and hourly, posting any due rules (idempotent via `next_run_date`).
- `goals`: CRUD + `POST /:id/contributions`.

`otp-service`: generate 6-digit code, hash with `Bun.password`, send via `mail-service`; `verify()` returns true for `123456` when `!IS_PROD`; when SMTP is unset in dev, log the code with `console.info`.

## Web UI
- **Landing `/`** — hero ("Track every rupee"), feature grid (income/expense tracking, reports & charts, budgets, recurring, goals, secure OTP signup), screenshot-style preview, and an auth card with **Login / Register** tabs (register is 2-step: details → OTP + password; 6-box OTP input). "Forgot password?" → `/forgot-password` (email → OTP + new password). Logged-in users visiting `/` are redirected to `/dashboard`.
- **App shell `_app.tsx`** — desktop: left sidebar + top bar with user menu (Profile, Theme, Logout). Mobile (<lg): compact top bar + **fixed bottom tab bar** (Home, Transactions, **＋** FAB centre, Reports, More), safe-area insets (`env(safe-area-inset-*)`, `viewport-fit=cover`), add/edit forms open as **bottom sheets** (vaul `Drawer`) on mobile and dialogs on desktop, 44px touch targets, `overscroll-behavior`, no hover-only actions, active-press feedback, page-level transitions with `motion`.
- **Dashboard** — this month's income/expense/net/balance cards, budget-usage bar + warnings, mini income-vs-expense chart, category donut, recent 5 transactions, upcoming recurring items, goal progress.
- **Transactions** — search + filter chips, date-grouped list with day totals, edit/delete (delete confirm + undo toast), CSV export.
- **Reports** — period segmented control + prev/next, summary cards, charts listed above, calendar view.
- **Budgets, Categories, Recurring, Goals, Settings** (profile, change password, theme, logout) pages; on mobile these live under "More".
- Libraries added beyond shimlawale: `recharts`, `vaul`, `vite-plugin-pwa`, `input-otp`. Dates via `date-fns` (week starts Monday).

## Build order
1. Scaffold repo (`git init`), root configs, `docs/implementation-plan.md`, README, CLAUDE.md, `.claude/launch.json`; `createdb finance_tracker`.
2. API core: env, db, schema, migrations, auth + OTP + mail, session middleware.
3. Web core: Vite/Tailwind/router/query, UI kit, theme, landing + auth flows, guarded shell with mobile bottom nav.
4. Categories + transactions CRUD (API + UI).
5. Reports API + charts, dashboard.
6. Budgets, recurring job, goals, CSV export.
7. PWA manifest/icons, polish, seed demo user with ~3 months of sample transactions (`demo@finance.local` / `Demo@1234`).

## Verification
- `bun run typecheck` and `bun run lint` clean.
- `bun run --cwd apps/api db:push && bun run --cwd apps/api db:seed`.
- `preview_start` api + web; in the browser pane: register a new user with OTP `123456` → lands on dashboard; logout; login; forgot-password with `123456` → login with new password.
- Add credit + debit transactions, edit, delete; check day/week/month/year totals on Reports match the list; charts render; budget warnings trigger at 80%/100%; recurring rule dated today posts a transaction after restart; CSV downloads.
- `resize_window` mobile preset: bottom tab bar, FAB bottom sheet, no horizontal scroll; dark mode check; screenshots as proof.

---

## Phase 2 (2026-09-29): Accounts, transfers & events

**Accounts** — where money lives (bank, cash, credit card, wallet, other). Every transaction and
recurring rule has a required `account_id`; payment method (UPI/card/cash…) stays as *how* you paid.
Each account has an opening balance; balance = opening + credits − debits − transfers out + transfers in.
One default account per user (new users get "Bank account" (default) + "Cash"). Accounts with
history are archived instead of deleted. Dashboard "Total balance" = sum of active account balances.
Transactions, reports and CSV can be filtered by account.

**Transfers** — separate `transfers` table (from → to, amount, date, note). Not income or expense,
so reports/budgets ignore them; they only move account balances (ATM withdrawal, card bill payment).

**Events** — optional `event_id` on transactions and splits (split share inherits it). Event has
name, icon, colour, optional start/end dates, optional budget, and an "active" flag (one at a time):
while active, new transactions default to it. Dates suggest the event for transactions in range.
Event page: spent vs budget, category breakdown, day-by-day, transaction list.

Split settlements don't touch account balances: only your share leaves your account as expense,
so once everyone has settled the account balance matches reality.

Migration: add `account_id` nullable → backfill (create default accounts per user; cash payments →
Cash account, the rest → default) → make NOT NULL.
