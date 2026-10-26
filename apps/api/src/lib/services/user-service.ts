import { eq } from "drizzle-orm";
import { type DB, db, type TX } from "$/db";
import { type UserRole, usersTable } from "$/db/schema";
import { seedDefaultAccounts } from "./account-service";
import { attachmentKeysOf, deleteStoredObjects } from "./attachment-service";
import { seedDefaultBooks } from "./book-service";
import { coreAuthService } from "./core-auth-service";
import { seedDefaultCategories } from "./default-categories";
import { userCacheService } from "./user-cache-service";
import { userConfigService } from "./user-config-service";
import { usernameService } from "./username-service";

/**
 * Inserts a user with their default categories, payment methods and books,
 * and registers the username. Shared by sign-up, admin-created users and
 * the seed. `email` and `username` must already be normalised and checked;
 * the unique indexes still reject a duplicate (see `isUniqueViolation`).
 */
export async function createUser(
  input: {
    name: string;
    email: string;
    username: string;
    password: string;
    role?: UserRole;
  },
  tx?: DB | TX,
) {
  const passwordHash = await Bun.password.hash(input.password);
  const run = async (t: DB | TX) => {
    const [u] = await t
      .insert(usersTable)
      .values({
        name: input.name,
        email: input.email,
        username: input.username,
        passwordHash,
        role: input.role ?? "user",
      })
      .returning();
    if (!u) throw new Error("user insert failed");
    await seedDefaultCategories(t, u.id);
    await seedDefaultAccounts(t, u.id);
    await seedDefaultBooks(t, u.id);
    return u;
  };
  const user = tx ? await run(tx) : await db.transaction(run);
  usernameService.set(user.id, user.username);
  return user;
}

/**
 * Deletes a user and everything they own (rows cascade), signs them out and
 * forgets them in every cache. Shared by self-deletion and the admin console.
 */
export async function deleteUser(user: { id: number; username: string }) {
  await coreAuthService.revokeAllForUser(user.id);
  // The attachment rows cascade away with the user, so note their files first.
  const storedKeys = await attachmentKeysOf(user.id);
  await db.delete(usersTable).where(eq(usersTable.id, user.id));
  userCacheService.invalidate(user.id);
  userConfigService.invalidate(user.id);
  usernameService.remove(user.username);
  deleteStoredObjects(storedKeys).catch(console.error);
}
