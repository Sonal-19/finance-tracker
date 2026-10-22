import { sql } from "drizzle-orm";
import { db } from "$/db";

// One-off, safe to re-run: moves `users.shortcuts` into the `user_config`
// table and drops the column (db:push refuses to drop a non-empty one). Run it before db:push (the
// backend deploy does). Does nothing once the column is gone.
const [col] = await db.execute<{ exists: boolean }>(sql`
  select exists (
    select 1 from information_schema.columns
    where table_name = 'users' and column_name = 'shortcuts'
  ) as exists`);

if (!col?.exists) {
  console.info("✅ user_config: nothing to move");
  process.exit(0);
}

await db.transaction(async (tx) => {
  await tx.execute(sql`
    create table if not exists user_config (
      user_id integer primary key
        constraint user_config_user_id_users_id_fkey
        references users(id) on delete cascade,
      config jsonb not null,
      updated_at timestamp with time zone default now() not null
    )`);
  const moved = await tx.execute(sql`
    insert into user_config (user_id, config)
    select id, jsonb_build_object('SHORTCUTS', shortcuts)
    from users where shortcuts is not null
    on conflict (user_id) do update
      set config = user_config.config
        || jsonb_build_object('SHORTCUTS', excluded.config -> 'SHORTCUTS')
    returning user_id`);
  // Copied, so the column can go (db:push won't drop a non-empty one).
  await tx.execute(sql`alter table users drop column shortcuts`);
  console.info(`✅ user_config: moved shortcuts for ${moved.length} user(s)`);
});
process.exit(0);
