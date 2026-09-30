# Finance Tracker

Bun workspaces monorepo: `apps/api` (Elysia + Drizzle + Postgres) and `apps/web` (Vite + React 19 + TanStack Router/Query).
Architecture mirrors `~/Developer/Projects/shimlawale-crm`.

- Ports: API **4300**, web **3300** (Vite proxies `/api`). DB: `finance_tracker` on local Postgres.
- Commands: `bun run dev`, `bun run typecheck`, `bun run lint`, `bun run --cwd apps/api db:push | db:seed`.
- Money is stored in **paise** (bigint) and sent over the API in rupees (`lib/utils/money.ts`). Currency is INR only, formatted `en-IN`.
- Dates are date-only `yyyy-MM-dd` strings in `Asia/Kolkata`; Eden is created with `parseDate: false` so they stay strings.
- Every response uses the `ok()` / `fail()` envelope; the web unwraps it with `call()` / `callMsg()` from `src/lib/api.ts`.
- Logged-in routes use `protectedUser` and are grouped in `controllers/index.ts` so its scoped hooks don't hit `/auth/*`.
- Every query must filter by the session `user.id`, never an id from the request body.
- Dev OTP: `123456` is accepted whenever `NODE_ENV !== "production"`.
- Chart series colours: income `--chart-income` (teal), expense `--chart-expense` (orange), validated for colour-blind separation. Text uses `text-income` / `text-expense` with +/− signs.
- Phones (<768px): bottom tab bar + FAB, forms open in `ResponsiveSheet` (vaul drawer); desktop gets a sidebar and dialogs.
- Foreign currency (USD only for now): the client sends `amount` + `currency: "USD"` (+ optional `fxRate`); the server converts via `fx-service.ts` (open.er-api.com live, frankfurter.dev historical, `FX_FALLBACK_USD_INR` last resort) and stores INR in `amount`, plus `original_amount` / `original_currency` / `fx_rate`. All totals and reports use INR only.
- Split & share (`splits-controller.ts`, `split-service.ts`): people (no accounts), optional groups, splits with per-person shares (`person_id` null = the user), settlements. Balances are between the user and each person only. The user's own share is a normal debit transaction with `split_id` set (cascade-deleted with the split) and is kept in sync by `syncShareTransaction`; edit it via the split, not directly. Share maths lives in `computeShares` (server) and `previewShares` (web) and must stay identical.
- Accounts: `transactions.account_id` and `recurring_rules.account_id` are NOT NULL; omit `accountId` in the API to use the default account (`resolveAccountId`). Balance = opening + credits − debits − transfers out + transfers in (`accountBalances`). Transfers live in their own table and never appear in income/expense reports. Accounts with history are archived, not deleted.
- Events: optional `event_id` on transactions and splits. One event per user can be `is_active`; the web form defaults new entries to it; it auto-deactivates after its end date. Existing DBs created before accounts need `bun run --cwd apps/api db:backfill-accounts` between the nullable and NOT NULL pushes.
