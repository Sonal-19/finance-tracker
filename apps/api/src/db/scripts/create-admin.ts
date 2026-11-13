import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "$/db";
import { adminGrantsTable, usersTable } from "$/db/schema";
import { createUser } from "$/lib/services/user-service";
import {
  normalizeUsername,
  validateUsername,
} from "$/lib/services/username-service";
import { normalizeEmail } from "$/lib/utils";

// Usage: bun run --cwd apps/api db:create-admin <email> <username> [name] [--master]
// Creates an admin account (or promotes an existing one with that email).
// The password comes from ADMIN_PASSWORD (which also resets an existing
// account's), else a new account gets a random one, printed once; change it
// in Settings after signing in. `--master` makes them the master admin (the
// one who changes roles and grants other admins permissions), replacing any
// current master.
const args = process.argv.slice(2);
const master = args.includes("--master");
const [emailArg, usernameArg, ...nameParts] = args.filter(
  (a) => a !== "--master",
);
if (!emailArg || !usernameArg) {
  console.error("usage: db:create-admin <email> <username> [name] [--master]");
  process.exit(1);
}
const email = normalizeEmail(emailArg);
const username = normalizeUsername(usernameArg);
const invalid = validateUsername(username);
if (invalid) {
  console.error(`Username "${usernameArg}": ${invalid}`);
  process.exit(1);
}

/** Hands the master role to `id`; the unique index allows only one. */
async function makeMaster(id: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ masterSince: null })
      .where(and(isNotNull(usersTable.masterSince), ne(usersTable.id, id)));
    await tx
      .update(usersTable)
      .set({ masterSince: sql`coalesce(${usersTable.masterSince}, now())` })
      .where(eq(usersTable.id, id));
    await tx.delete(adminGrantsTable).where(eq(adminGrantsTable.userId, id));
  });
}

const [existing] = await db
  .select({ id: usersTable.id })
  .from(usersTable)
  .where(eq(usersTable.email, email));
if (existing) {
  // ADMIN_PASSWORD also replaces the existing password.
  const newPassword = process.env.ADMIN_PASSWORD;
  await db
    .update(usersTable)
    .set({
      role: "admin",
      ...(newPassword && {
        passwordHash: await Bun.password.hash(newPassword),
      }),
    })
    .where(eq(usersTable.id, existing.id));
  if (master) await makeMaster(existing.id);
  console.info(
    `✅ ${email} already existed and is now ${master ? "the master admin" : "an admin"}${newPassword ? " with the new password" : ""}`,
  );
  process.exit(0);
}

const password =
  process.env.ADMIN_PASSWORD ||
  Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url");
const user = await createUser({
  name: nameParts.join(" ") || "Admin",
  email,
  username,
  password,
  role: "admin",
});
if (master) await makeMaster(user.id);
console.info(
  `✅ Created ${master ? "master admin" : "admin"} @${user.username} <${user.email}>`,
);
if (!process.env.ADMIN_PASSWORD) console.info(`   Password: ${password}`);
process.exit(0);
