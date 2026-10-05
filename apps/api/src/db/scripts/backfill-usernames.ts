/**
 * One-off, idempotent migration for existing users when usernames were added:
 * derives each missing username from the email's local part (lowercased,
 * invalid chars → `_`, collisions get `_2`, `_3`… in user-id order). Run it
 * BEFORE `db:push` on a DB that already has users: it adds the column as
 * nullable itself, and the later push then makes it NOT NULL + UNIQUE.
 * `bun run --cwd apps/api db:backfill-usernames`
 */
import { asc, eq, sql } from "drizzle-orm";
import { db } from "$/db";
import { usersTable } from "$/db/schema";
import {
  uniqueUsername,
  usernameFromEmail,
} from "$/lib/services/username-service";

await db.execute(sql`alter table users add column if not exists username text`);
const users = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    username: usersTable.username,
  })
  .from(usersTable)
  .orderBy(asc(usersTable.id));
const taken = new Set(users.flatMap((u) => (u.username ? [u.username] : [])));
let count = 0;
for (const u of users) {
  if (u.username) continue;
  const username = uniqueUsername(usernameFromEmail(u.email), taken);
  taken.add(username);
  await db.update(usersTable).set({ username }).where(eq(usersTable.id, u.id));
  count++;
}
console.info(`✅ Usernames backfilled for ${count} user(s)`);
process.exit(0);
