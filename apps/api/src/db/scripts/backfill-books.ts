/**
 * One-off, idempotent migration for existing data when books were added:
 * gives every user a default "Personal" book and puts every transaction and
 * recurring rule without a book into it. Run it BEFORE `db:push` on a DB
 * that already has data: it creates the `books` table and the nullable
 * `book_id` columns itself, and the later push then makes them NOT NULL and
 * adds the foreign keys and indexes. It also drops the old fixed
 * `payment_method` columns (the account is the payment method now), which
 * push won't do on its own because they hold data.
 * `bun run --cwd apps/api db:backfill-books`
 */
import { sql } from "drizzle-orm";
import { db } from "$/db";
import { DEFAULT_BOOK } from "$/lib/services/book-service";

await db.execute(sql`
  do $$ begin
    create type book_totals as enum ('included', 'separate');
  exception when duplicate_object then null; end $$
`);
await db.execute(sql`
  do $$ begin
    create type book_status as enum ('active', 'archived');
  exception when duplicate_object then null; end $$
`);
await db.execute(sql`
  create table if not exists books (
    id serial primary key,
    user_id integer not null references users(id) on delete cascade,
    name text not null,
    icon text not null default 'book-open',
    color text not null default '#7c3aed',
    note text,
    totals book_totals not null default 'included',
    status book_status not null default 'active',
    archived_at timestamptz,
    default_since timestamptz,
    created_at timestamptz not null default now(),
    constraint books_user_name unique (user_id, name)
  )
`);
await db.execute(sql`
  create unique index if not exists books_user_default_uq
    on books (user_id) where default_since is not null
`);

const created = await db.execute(sql`
  insert into books (user_id, name, icon, color, default_since)
  select u.id, ${DEFAULT_BOOK.name}, ${DEFAULT_BOOK.icon}, ${DEFAULT_BOOK.color}, now()
  from users u
  where not exists (select 1 from books b where b.user_id = u.id)
  returning id
`);

for (const table of ["transactions", "recurring_rules"]) {
  await db.execute(
    sql.raw(`alter table ${table} add column if not exists book_id integer`),
  );
  // Each user's default book, else their oldest one.
  await db.execute(
    sql.raw(`
      update ${table} t set book_id = (
        select b.id from books b where b.user_id = t.user_id
        order by b.default_since nulls last, b.id limit 1
      )
      where t.book_id is null
    `),
  );
}

for (const table of ["transactions", "recurring_rules", "settlements"])
  await db.execute(
    sql.raw(`alter table ${table} drop column if exists payment_method`),
  );
await db.execute(sql`drop type if exists payment_method`);

console.info(`✅ Books backfilled (${created.length} default book(s) created)`);
process.exit(0);
