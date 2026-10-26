import { eq } from "drizzle-orm";
import { db } from "$/db";
import {
  type AdminPermission,
  adminGrantsTable,
  adminPermissions,
  type SelectUser,
} from "$/db/schema";

type Person = Pick<SelectUser, "id" | "role" | "masterSince">;

export const isMaster = (u: Pick<SelectUser, "masterSince">) =>
  u.masterSince !== null;

/** What an admin may do: everything for the master, else their grants. */
export async function adminPermissionsOf(
  user: Person,
): Promise<AdminPermission[]> {
  if (isMaster(user)) return [...adminPermissions];
  if (user.role !== "admin") return [];
  const rows = await db
    .select({ permission: adminGrantsTable.permission })
    .from(adminGrantsTable)
    .where(eq(adminGrantsTable.userId, user.id));
  return rows.map((r) => r.permission);
}

/** Message for a missing permission, or null when the admin has it. */
export async function lacks(user: Person, permission: AdminPermission) {
  return (await adminPermissionsOf(user)).includes(permission)
    ? null
    : "You don't have permission to do that";
}

/**
 * Why `actor` can't change `target`'s account, or null when they can.
 * The master is untouchable (except by themself, where the action allows
 * it), and only the master manages other admins.
 */
export function targetProblem(actor: Person, target: Person) {
  if (isMaster(target) && actor.id !== target.id)
    return "Only the master admin can change their own account";
  if (target.role === "admin" && !isMaster(actor) && actor.id !== target.id)
    return "Only the master admin can manage other admins";
  return null;
}
