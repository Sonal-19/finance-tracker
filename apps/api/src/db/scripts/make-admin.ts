import { eq } from "drizzle-orm";
import { db } from "$/db";
import { type UserRole, userRoles, usersTable } from "$/db/schema";
import { normalizeEmail } from "$/lib/utils";

// Usage: bun run --cwd apps/api db:make-admin <email> [user|admin]
// Sets a user's role. Admins get the system-config page.
const [emailArg, roleArg = "admin"] = process.argv.slice(2);
if (!emailArg || !userRoles.includes(roleArg as UserRole)) {
  console.error("usage: db:make-admin <email> [user|admin]");
  process.exit(1);
}

const [user] = await db
  .update(usersTable)
  .set({ role: roleArg as UserRole })
  .where(eq(usersTable.email, normalizeEmail(emailArg)))
  .returning({ id: usersTable.id, email: usersTable.email });

if (!user) {
  console.error(`No user with email ${emailArg}`);
  process.exit(1);
}
console.info(`✅ ${user.email} is now ${roleArg}`);
process.exit(0);
