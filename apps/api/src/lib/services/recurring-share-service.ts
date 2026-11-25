import { and, eq, inArray, ne } from "drizzle-orm";
import { db, type TX } from "$/db";
import {
  categoriesTable,
  peopleTable,
  recurringRulesTable,
  recurringSharesTable,
  type SelectRecurringRule,
  type SelectRecurringShare,
  usersTable,
} from "$/db/schema";
import { amountOf, formatAmount } from "$/lib/utils/money";
import { recurringService } from "./recurring-service";
import { deliver } from "./reminder-service";
import {
  matchSharedCategory,
  sharedCategoryId,
  usersBlocking,
} from "./split-service";
import { ownedCategory } from "./transaction-service";

const R = recurringRulesTable;
const S = recurringSharesTable;

export const FREQ_TEXT = {
  daily: "every day",
  weekly: "every week",
  monthly: "every month",
  yearly: "every year",
} as const;

export const dateText = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type Owner = { id: number; name: string; username?: string | null };

const ownerLabel = (o: Owner) =>
  o.username ? `${o.name} (@${o.username})` : o.name;

async function userById(id: number): Promise<Owner | undefined> {
  const [u] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return u;
}

/** "Rent" / the category's name when the rule has no label. */
async function ruleTitle(
  rule: Pick<SelectRecurringRule, "note" | "categoryId">,
) {
  if (rule.note?.trim()) return rule.note.trim();
  const [c] = await db
    .select({ name: categoriesTable.name })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, rule.categoryId))
    .limit(1);
  return c?.name ?? "Recurring entry";
}

const notify = (
  userId: number,
  shareId: number,
  event: string,
  title: string,
  body: string,
  url = "/recurring",
) =>
  deliver({
    userId,
    kind: "shared",
    url,
    dedupeKey: `rshare:${shareId}:${event}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    title,
    body,
  }).catch((err) => console.error("[RecurringShare] notify failed", err));

/** Who a rule is shared with (owner's view). */
export async function sharesOfRules(ruleIds: number[]) {
  if (!ruleIds.length) return [];
  const rows = await db
    .select({
      share: S,
      name: peopleTable.name,
      username: usersTable.username,
    })
    .from(S)
    .innerJoin(peopleTable, eq(peopleTable.id, S.personId))
    .innerJoin(usersTable, eq(usersTable.id, S.userId))
    .where(inArray(S.ruleId, ruleIds))
    .orderBy(peopleTable.name);
  return rows.map(({ share, name, username }) => ({
    id: share.id,
    ruleId: share.ruleId,
    personId: share.personId,
    name,
    username,
    amount: amountOf(share.amount),
    status: share.status,
    decidedAt: share.decidedAt,
  }));
}

/** For rules that are someone else's shared rule: who shares it (copy view). */
export async function sourcesOfCopies(copyIds: number[]) {
  if (!copyIds.length) return [];
  return db
    .select({
      shareId: S.id,
      copyRuleId: S.copyRuleId,
      ownerName: usersTable.name,
      ownerUsername: usersTable.username,
      ownerAmount: R.amount,
    })
    .from(S)
    .innerJoin(usersTable, eq(usersTable.id, S.ownerId))
    .innerJoin(R, eq(R.id, S.ruleId))
    .where(inArray(S.copyRuleId, copyIds));
}

/** The share behind a rule that is a tagged user's copy, if it is one. */
export async function shareOfCopy(copyRuleId: number) {
  const [s] = await db
    .select()
    .from(S)
    .where(eq(S.copyRuleId, copyRuleId))
    .limit(1);
  return s;
}

export async function hasShares(ruleId: number) {
  const [s] = await db
    .select({ id: S.id })
    .from(S)
    .where(eq(S.ruleId, ruleId))
    .limit(1);
  return !!s;
}

/** Invitations waiting for the user, with the category their copy would get. */
export async function incomingShares(userId: number) {
  const rows = await db
    .select({
      share: S,
      rule: R,
      ownerName: usersTable.name,
      ownerUsername: usersTable.username,
      category: {
        id: categoriesTable.id,
        name: categoriesTable.name,
        icon: categoriesTable.icon,
        color: categoriesTable.color,
      },
    })
    .from(S)
    .innerJoin(R, eq(R.id, S.ruleId))
    .innerJoin(usersTable, eq(usersTable.id, S.ownerId))
    .innerJoin(categoriesTable, eq(categoriesTable.id, R.categoryId))
    .where(
      and(
        eq(S.userId, userId),
        eq(S.status, "pending"),
        ne(R.status, "completed"),
      ),
    )
    .orderBy(S.createdAt);
  const out = [];
  for (const r of rows) {
    const match =
      r.rule.type === "debit"
        ? await matchSharedCategory(db, userId, r.rule.categoryId)
        : null;
    out.push({
      id: r.share.id,
      amount: amountOf(r.share.amount),
      ownerName: r.ownerName,
      ownerUsername: r.ownerUsername,
      createdAt: r.share.createdAt,
      rule: {
        type: r.rule.type,
        amount: amountOf(r.rule.amount),
        note: r.rule.note,
        frequency: r.rule.frequency,
        startDate: r.rule.startDate,
        endDate: r.rule.endDate,
        nextRunDate: r.rule.nextRunDate,
        status: r.rule.status,
      },
      /** The owner's category (for display and matching). */
      category: r.category,
      suggestedCategoryId: match?.categoryId ?? null,
    });
  }
  return out;
}

type ShareItem = { personId: number; amount: number; reinvite?: boolean };

/**
 * Replaces who a rule is shared with: new people are invited, removed ones
 * lose the share (their copy is paused, see `endShare`), changed amounts
 * reach their copy. Declined people stay declined unless `reinvite`.
 */
export async function setShares(
  owner: Owner,
  rule: SelectRecurringRule,
  items: ShareItem[],
): Promise<{ ok: true; invited: number } | { ok: false; message: string }> {
  const ids = [...new Set(items.map((i) => i.personId))];
  if (ids.length !== items.length)
    return { ok: false, message: "A person is listed twice" };
  const people = ids.length
    ? await db
        .select()
        .from(peopleTable)
        .where(
          and(eq(peopleTable.userId, owner.id), inArray(peopleTable.id, ids)),
        )
    : [];
  if (people.length !== ids.length)
    return { ok: false, message: "Person not found" };
  for (const p of people) {
    if (!p.linkedUserId || p.linkedUserId === owner.id)
      return {
        ok: false,
        message: `${p.name} isn't tagged with a username yet. Tag them on their page first.`,
      };
  }
  const blocking = new Set(
    await usersBlocking(
      owner.id,
      people.map((p) => p.linkedUserId!),
    ),
  );
  const blocked = people.find((p) => blocking.has(p.linkedUserId!));
  if (blocked)
    return { ok: false, message: `${blocked.name} can't be shared with` };

  const existing = await db.select().from(S).where(eq(S.ruleId, rule.id));
  const title = await ruleTitle(rule);
  const who = ownerLabel(owner);
  const kind = rule.type === "credit" ? "income" : "expense";
  const sched = `${FREQ_TEXT[rule.frequency]}, next on ${dateText(rule.nextRunDate)}`;
  let invited = 0;

  for (const s of existing)
    if (!ids.includes(s.personId))
      await endShare(s, owner, title, "stopped sharing");

  for (const item of items) {
    const person = people.find((p) => p.id === item.personId)!;
    const s = existing.find((e) => e.personId === item.personId);
    const invite = (id: number) =>
      notify(
        person.linkedUserId!,
        id,
        "invite",
        `${who} shared "${title}" with you`,
        `Recurring ${kind} · your share ${formatAmount(item.amount)} ${sched}. Accept to add it to your recurring entries.`,
      );
    if (!s) {
      const [row] = await db
        .insert(S)
        .values({
          ruleId: rule.id,
          ownerId: owner.id,
          personId: person.id,
          userId: person.linkedUserId!,
          amount: item.amount,
        })
        .returning();
      invited++;
      await invite(row!.id);
      continue;
    }
    if (s.status === "declined") {
      if (!item.reinvite) {
        if (s.amount !== item.amount)
          await db.update(S).set({ amount: item.amount }).where(eq(S.id, s.id));
        continue;
      }
      await db
        .update(S)
        .set({
          status: "pending",
          amount: item.amount,
          decidedAt: null,
          copyRuleId: null,
        })
        .where(eq(S.id, s.id));
      invited++;
      await invite(s.id);
      continue;
    }
    if (s.amount === item.amount) continue;
    await db.update(S).set({ amount: item.amount }).where(eq(S.id, s.id));
    if (s.status === "accepted" && s.copyRuleId) {
      await db
        .update(R)
        .set({ amount: item.amount })
        .where(eq(R.id, s.copyRuleId));
      await notify(
        s.userId,
        s.id,
        "amount",
        `${who} changed your share of "${title}"`,
        `Your share: ${formatAmount(s.amount)} → ${formatAmount(item.amount)} ${FREQ_TEXT[rule.frequency]}, from ${dateText(rule.nextRunDate)}.`,
      );
    }
  }
  return { ok: true, invited };
}

/** Ends one share: a running copy is paused (it stays in the tagged user's
 * recurring list, theirs to resume or delete) and they're told why. */
async function endShare(
  s: SelectRecurringShare,
  owner: Owner,
  title: string,
  why: "stopped sharing" | "deleted the rule" | "untagged you",
) {
  await db.transaction(async (tx) => {
    if (s.copyRuleId)
      await tx
        .update(R)
        .set({ status: "paused", pausedAt: new Date() })
        .where(and(eq(R.id, s.copyRuleId), eq(R.status, "active")));
    await tx.delete(S).where(eq(S.id, s.id));
  });
  if (s.status === "declined") return;
  const who = ownerLabel(owner);
  await notify(
    s.userId,
    s.id,
    "ended",
    `${who} ${why === "deleted the rule" ? "deleted" : "stopped sharing"} "${title}"`,
    s.status === "accepted"
      ? "Your copy is paused and nothing more will be added. Resume or delete it in Recurring."
      : "The invitation was withdrawn.",
  );
}

/** Before the owner deletes a rule: every share ends. */
export async function endSharesOfRule(owner: Owner, rule: SelectRecurringRule) {
  const shares = await db.select().from(S).where(eq(S.ruleId, rule.id));
  if (!shares.length) return;
  const title = await ruleTitle(rule);
  for (const s of shares) await endShare(s, owner, title, "deleted the rule");
}

/** A person's shares, read before they're untagged or removed. */
export function sharesOfPerson(ownerId: number, personId: number) {
  return db
    .select({ share: S, rule: R })
    .from(S)
    .innerJoin(R, eq(R.id, S.ruleId))
    .where(and(eq(S.ownerId, ownerId), eq(S.personId, personId)));
}

/** Ends shares read with `sharesOfPerson` (copies pause, users are told). */
export async function endSharesOf(
  owner: Owner,
  rows: Awaited<ReturnType<typeof sharesOfPerson>>,
) {
  for (const { share, rule } of rows)
    await endShare(share, owner, await ruleTitle(rule), "untagged you");
}

/** The tagged user accepts: their own rule is created for their share. */
export async function acceptShare(
  userId: number,
  shareId: number,
  pick: { categoryId?: number; accountId: number; bookId: number },
): Promise<
  { ok: true; ruleId: number } | { ok: false; code: 400 | 404; message: string }
> {
  const [row] = await db
    .select({ share: S, rule: R })
    .from(S)
    .innerJoin(R, eq(R.id, S.ruleId))
    .where(and(eq(S.id, shareId), eq(S.userId, userId)))
    .limit(1);
  if (!row || row.share.status !== "pending")
    return { ok: false, code: 404, message: "Invitation not found" };
  const { share, rule } = row;
  if (rule.status === "completed")
    return { ok: false, code: 400, message: "This recurring entry has ended" };

  let categoryId = pick.categoryId;
  if (categoryId) {
    const cat = await ownedCategory(userId, categoryId, rule.type);
    if (!cat.ok) return { ok: false, code: 400, message: cat.message };
  } else if (rule.type === "debit") {
    categoryId =
      (await matchSharedCategory(db, userId, rule.categoryId))?.categoryId ??
      (await db.transaction((tx) => sharedCategoryId(tx, userId)));
  } else return { ok: false, code: 400, message: "Pick a category" };

  const copyId = await db.transaction(async (tx: TX) => {
    const [fresh] = await tx
      .select()
      .from(S)
      .where(eq(S.id, share.id))
      .for("update");
    if (fresh?.status !== "pending") return null;
    const [copy] = await tx
      .insert(R)
      .values({
        userId,
        type: rule.type,
        amount: share.amount,
        categoryId: categoryId!,
        accountId: pick.accountId,
        bookId: pick.bookId,
        note: rule.note,
        frequency: rule.frequency,
        startDate: rule.startDate,
        endDate: rule.endDate,
        // From the owner's next one on: nothing already past is posted.
        nextRunDate: rule.nextRunDate,
        status: rule.status,
        pausedAt: rule.status === "paused" ? new Date() : null,
      })
      .returning({ id: R.id });
    await tx
      .update(S)
      .set({ status: "accepted", copyRuleId: copy!.id, decidedAt: new Date() })
      .where(eq(S.id, share.id));
    return copy!.id;
  });
  if (!copyId) return { ok: false, code: 404, message: "Invitation not found" };

  const me = await userById(userId);
  await notify(
    share.ownerId,
    share.id,
    "accepted",
    `${me ? ownerLabel(me) : "Someone"} accepted "${await ruleTitle(rule)}"`,
    `Their share of ${formatAmount(share.amount)} now repeats ${FREQ_TEXT[rule.frequency]} in their own account.`,
  );
  return { ok: true, ruleId: copyId };
}

export async function declineShare(userId: number, shareId: number) {
  const [row] = await db
    .update(S)
    .set({ status: "declined", decidedAt: new Date() })
    .where(
      and(eq(S.id, shareId), eq(S.userId, userId), eq(S.status, "pending")),
    )
    .returning();
  if (!row) return false;
  const [rule] = await db.select().from(R).where(eq(R.id, row.ruleId)).limit(1);
  const me = await userById(userId);
  if (rule)
    await notify(
      row.ownerId,
      row.id,
      "declined",
      `${me ? ownerLabel(me) : "Someone"} declined "${await ruleTitle(rule)}"`,
      `They won't get your shared recurring entry. You can invite them again from Recurring → Share.`,
    );
  return true;
}

/** The tagged user deletes their copy: the share becomes declined. */
export async function leaveShare(userId: number, copyRuleId: number) {
  const [row] = await db
    .update(S)
    .set({ status: "declined", decidedAt: new Date(), copyRuleId: null })
    .where(and(eq(S.copyRuleId, copyRuleId), eq(S.userId, userId)))
    .returning();
  if (!row) return;
  const [rule] = await db.select().from(R).where(eq(R.id, row.ruleId)).limit(1);
  const me = await userById(userId);
  if (rule)
    await notify(
      row.ownerId,
      row.id,
      "left",
      `${me ? ownerLabel(me) : "Someone"} left "${await ruleTitle(rule)}"`,
      "They deleted their copy of your shared recurring entry.",
    );
}

/** Fields the owner controls on a copy; the tagged user can't edit them. */
export const OWNER_FIELDS = [
  "type",
  "amount",
  "frequency",
  "startDate",
  "endDate",
  "note",
] as const;

/**
 * After the owner edited a rule: the change reaches every copy (schedule,
 * label, pause/resume, and shares scaled with the amount) and each tagged
 * user who accepted is told exactly what changed.
 */
export async function syncOwnerEdit(
  owner: Owner,
  before: SelectRecurringRule,
  after: SelectRecurringRule,
) {
  const shares = await db
    .select()
    .from(S)
    .where(and(eq(S.ruleId, after.id), ne(S.status, "declined")));
  if (!shares.length) return;
  const restart = after.startDate !== before.startDate;
  const statusChanged =
    after.status !== before.status && after.status !== "completed";
  const amountChanged = after.amount !== before.amount;
  const lines: string[] = [];
  if (after.frequency !== before.frequency)
    lines.push(
      `Repeats ${FREQ_TEXT[before.frequency]} → ${FREQ_TEXT[after.frequency]}`,
    );
  if (restart) lines.push(`Restarts from ${dateText(after.startDate)}`);
  if (after.endDate !== before.endDate)
    lines.push(
      after.endDate
        ? `Ends on ${dateText(after.endDate)}`
        : "No end date any more",
    );
  if ((after.note ?? "") !== (before.note ?? ""))
    lines.push(after.note ? `Renamed to "${after.note}"` : "Label removed");
  if (statusChanged)
    lines.push(
      after.status === "paused"
        ? "Paused: nothing is added until it's resumed"
        : "Resumed",
    );

  const title = await ruleTitle(before);
  const who = ownerLabel(owner);
  for (const s of shares) {
    const amount = amountChanged
      ? Math.max(
          1,
          Math.round((s.amount * after.amount) / Math.max(1, before.amount)),
        )
      : s.amount;
    if (amount !== s.amount)
      await db.update(S).set({ amount }).where(eq(S.id, s.id));
    if (s.status !== "accepted" || !s.copyRuleId) continue;
    await db
      .update(R)
      .set({
        amount,
        frequency: after.frequency,
        endDate: after.endDate,
        note: after.note,
        ...(restart && {
          startDate: after.startDate,
          nextRunDate: after.startDate,
        }),
        ...(statusChanged && {
          status: after.status,
          pausedAt: after.status === "paused" ? new Date() : null,
        }),
      })
      .where(and(eq(R.id, s.copyRuleId), eq(R.userId, s.userId)));
    const mine =
      amount !== s.amount
        ? [
            `Your share ${formatAmount(s.amount)} → ${formatAmount(amount)} (total ${formatAmount(before.amount)} → ${formatAmount(after.amount)})`,
          ]
        : [];
    // A copy resumed after a pause catches up on what it missed.
    if (statusChanged && after.status === "active")
      await recurringService.runDue(s.userId);
    const all = [...mine, ...lines];
    if (all.length)
      await notify(
        s.userId,
        s.id,
        "edit",
        `${who} changed "${title}"`,
        `${all.join(". ")}.`,
      );
  }
}
