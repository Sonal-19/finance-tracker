import { type DB, db, type TX } from "$/db";
import { type UserRole, usersTable } from "$/db/schema";
import { seedDefaultAccounts } from "./account-service";
import { seedDefaultBooks } from "./book-service";
import { seedDefaultCategories } from "./default-categories";
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
