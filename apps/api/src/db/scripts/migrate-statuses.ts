/**
 * One-off, idempotent migration from boolean flags to status enums and
 * timestamps. Run with `bun run --cwd apps/api db:migrate-statuses` BEFORE
 * `db:push`: push would otherwise drop the boolean columns (and their data)
 * and add the new ones empty. After this script, push only adds indexes.
 *
 *   accounts.is_archived          → status ('active' | 'archived') + archived_at
 *   accounts.is_default           → default_since
 *   categories.is_default         → origin ('system' | 'custom')
 *   events.is_active              → active_since
 *   recurring_rules.is_active     → status ('active' | 'paused' | 'completed')
 *                                   + paused_at / completed_at
 *   splits.record_expense         → own_share ('recorded' | 'skipped')
 *   shared_split_prefs.added      → decision ('added' | 'skipped') + decided_at
 *   users.add_tagged_expenses     → tagged_expenses ('manual' | 'auto')
 */
import { sql } from "drizzle-orm";
import { db } from "$/db";

const enumType = (name: string, values: string[]) =>
  sql.raw(`do $$ begin
    create type ${name} as enum (${values.map((v) => `'${v}'`).join(", ")});
  exception when duplicate_object then null; end $$`);

/** Runs `body` only while `table.column` (the old boolean) still exists. */
const whileColumn = (table: string, column: string, body: string) =>
  sql.raw(`do $$ begin
    if exists (
      select 1 from information_schema.columns
      where table_schema = current_schema()
        and table_name = '${table}' and column_name = '${column}'
    ) then
      ${body}
    end if;
  end $$`);

await db.transaction(async (tx) => {
  await tx.execute(enumType("account_status", ["active", "archived"]));
  await tx.execute(enumType("category_origin", ["system", "custom"]));
  await tx.execute(
    enumType("recurring_status", ["active", "paused", "completed"]),
  );
  await tx.execute(enumType("own_share_mode", ["recorded", "skipped"]));
  await tx.execute(enumType("shared_split_decision", ["added", "skipped"]));
  await tx.execute(enumType("tagged_expense_mode", ["manual", "auto"]));

  /* ---------------- accounts ---------------- */
  await tx.execute(sql`
    alter table accounts
      add column if not exists status account_status not null default 'active',
      add column if not exists archived_at timestamptz,
      add column if not exists default_since timestamptz`);
  await tx.execute(
    whileColumn(
      "accounts",
      "is_archived",
      `update accounts set status = 'archived', archived_at = now()
         where is_archived;
       alter table accounts drop column is_archived;`,
    ),
  );
  // One default per user, even if the old flag was somehow set on several.
  await tx.execute(
    whileColumn(
      "accounts",
      "is_default",
      `update accounts set default_since = created_at
         where id in (
           select distinct on (user_id) id from accounts
           where is_default and status = 'active'
           order by user_id, id
         );
       alter table accounts drop column is_default;`,
    ),
  );

  /* ---------------- categories ---------------- */
  await tx.execute(sql`
    alter table categories
      add column if not exists origin category_origin not null default 'custom'`);
  await tx.execute(
    whileColumn(
      "categories",
      "is_default",
      `update categories set origin = 'system' where is_default;
       alter table categories drop column is_default;`,
    ),
  );

  /* ---------------- events ---------------- */
  await tx.execute(sql`
    alter table events add column if not exists active_since timestamptz`);
  await tx.execute(
    whileColumn(
      "events",
      "is_active",
      `update events set active_since = now()
         where id in (
           select distinct on (user_id) id from events
           where is_active order by user_id, id desc
         );
       alter table events drop column is_active;`,
    ),
  );

  /* ---------------- recurring rules ---------------- */
  await tx.execute(sql`
    alter table recurring_rules
      add column if not exists status recurring_status not null default 'active',
      add column if not exists paused_at timestamptz,
      add column if not exists completed_at timestamptz`);
  // An inactive rule whose schedule ran past its end date finished on its
  // own; any other inactive rule was paused by the user.
  await tx.execute(
    whileColumn(
      "recurring_rules",
      "is_active",
      `update recurring_rules set status = 'completed', completed_at = updated_at
         where not is_active and end_date is not null and next_run_date > end_date;
       update recurring_rules set status = 'paused', paused_at = updated_at
         where not is_active and status = 'active';
       alter table recurring_rules drop column is_active;`,
    ),
  );

  /* ---------------- splits ---------------- */
  await tx.execute(sql`
    alter table splits
      add column if not exists own_share own_share_mode not null default 'recorded'`);
  await tx.execute(
    whileColumn(
      "splits",
      "record_expense",
      `update splits set own_share = 'skipped' where not record_expense;
       alter table splits drop column record_expense;`,
    ),
  );

  /* ---------------- shared split prefs ---------------- */
  await tx.execute(sql`
    alter table shared_split_prefs
      add column if not exists decision shared_split_decision,
      add column if not exists decided_at timestamptz not null default now()`);
  await tx.execute(
    whileColumn(
      "shared_split_prefs",
      "added",
      `update shared_split_prefs
         set decision = case when added then 'added' else 'skipped' end::shared_split_decision;
       alter table shared_split_prefs drop column added;`,
    ),
  );
  await tx.execute(sql`
    alter table shared_split_prefs alter column decision set not null`);

  /* ---------------- users ---------------- */
  await tx.execute(sql`
    alter table users
      add column if not exists tagged_expenses tagged_expense_mode not null default 'manual'`);
  await tx.execute(
    whileColumn(
      "users",
      "add_tagged_expenses",
      `update users set tagged_expenses = 'auto' where add_tagged_expenses;
       alter table users drop column add_tagged_expenses;`,
    ),
  );

  // Replaced by `transactions_category_idx`. Dropped here so `db:push` only
  // has indexes to create and never has to ask "renamed or new?".
  await tx.execute(sql`drop index if exists transactions_user_category_idx`);
});

console.info("✅ Booleans migrated to statuses and timestamps");
process.exit(0);
