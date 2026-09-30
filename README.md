# Finance Tracker

Personal finance tracker: record **credit** (income) and **debit** (expense) transactions date-wise,
see day / week / month / year reports with charts, set budgets, automate recurring entries and
track savings goals. Responsive, installable (PWA), and built to feel like a native app on phones.

## Stack

| Layer | Tech |
| --- | --- |
| Runtime / workspaces | Bun workspaces (`apps/*`) |
| API | Elysia + TypeBox validation, Drizzle ORM (1.0 rc) + PostgreSQL, nodemailer |
| Web | Vite 8, React 19, TanStack Router (file-based) + Query, Eden Treaty client, Tailwind v4, Radix UI, Recharts, vaul (bottom sheets), sonner |
| Tooling | TypeScript 7, Biome |

## First run

```bash
createdb finance_tracker
cp apps/api/.env.example apps/api/.env
bun install
bun run --cwd apps/api db:push
bun run --cwd apps/api db:seed     # optional demo data
bun run dev                        # api :4300 + web :3300
```

Open http://localhost:3300.

- **Demo login** (after seeding): `demo@finance.local` / `Demo@1234`
- **Dev OTP**: outside production every OTP flow accepts **`123456`**; the real code is also
  printed in the API log. Set `SMTP_*` in `apps/api/.env` to send real emails.

## Features

- Sign up with name + email (OTP verified) + password, log in, forgot password (OTP), change password, log out, delete account
- Transactions CRUD with category, payment method (UPI, cash, bank, cards), date and note; search, filters, infinite scroll, undo delete, CSV export
- Enter an amount in **US dollars**: it's converted to rupees using that day's USD→INR rate (live for today, historical for past dates, or your own rate), saved in INR, and the original $ amount + rate are kept for reference
- **Split & share**: add friends, office colleagues, family/relatives or anyone; optional groups (trip, flat, office lunch); split a bill equally, by exact ₹, % or shares, paid by you or a friend; only your share counts as your expense; per-person and group balances, settle up (full/partial), WhatsApp reminders, and "Split with friends" on any existing expense
- **Accounts**: every transaction belongs to an account (bank, cash, credit card, wallet); opening balances, live balance per account, default account, archive, transfers between accounts (ATM withdrawal, card bill) that don't count as income/expense; filter transactions and reports by account
- **Events**: group spending on an occasion (festival visit, wedding, trip) across categories, with optional dates and budget; mark one as "Happening now" and every new transaction (and split) is tagged to it automatically
- Reports for Day / Week (Mon–Sun) / Month / Year / Custom with prev-period comparison, savings rate, average daily spend
- Charts: income vs expense bars (with table view), category donut, cumulative spending trend, spending calendar heatmap
- Budgets: overall monthly + per category, warnings at 80% and 100%
- Recurring rules (daily / weekly / monthly / yearly) posted automatically by an hourly job, with backfill
- Savings goals with contributions / withdrawals and a progress ring
- Custom categories (icon + colour), reassign transactions before deleting
- Light / dark / system theme, PWA install, mobile bottom tab bar + FAB + swipe-down sheets

## What's where

| Path | Purpose |
| --- | --- |
| `apps/api/src/controllers/*` | Route modules (`/api/auth`, `/transactions`, `/reports`, …) |
| `apps/api/src/db/schema/*` | Drizzle tables (money stored as integer **paise**) |
| `apps/api/src/lib/services/*` | Sessions, OTP, mail, reports, recurring job |
| `apps/web/src/routes/*` | Pages (`index` = landing + auth, `_app/*` = logged-in app) |
| `apps/web/src/hooks/use-finance.ts` | All queries and mutations |
| `docs/implementation-plan.md` | The original plan |
