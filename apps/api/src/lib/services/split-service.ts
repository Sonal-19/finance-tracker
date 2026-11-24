import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  type SQL,
  sql,
} from "drizzle-orm";
import { db, type TX } from "$/db";
import {
  categoriesTable,
  type OwnShareMode,
  peopleTable,
  type SplitMethod,
  settlementsTable,
  sharedCategoryRulesTable,
  sharedSplitPrefsTable,
  splitGroupsTable,
  splitSharesTable,
  splitsTable,
  transactionsTable,
  userBlocksTable,
  usersTable,
} from "$/db/schema";
import { amountOf, formatAmount } from "$/lib/utils/money";
import { defaultAccountId } from "./account-service";
import { defaultBookId } from "./book-service";

/** `personId: null` = the user themself. `value` meaning depends on the method. */
export type Participant = { personId: number | null; value?: number };

type ShareResult =
  | {
      ok: true;
      shares: {
        personId: number | null;
        amount: number;
        value: number | null;
      }[];
    }
  | { ok: false; message: string };

/** Spreads the leftover (from rounding) one by one over the first rows. */
function spreadRemainder(amounts: number[], total: number) {
  let diff = total - amounts.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0 && amounts.length; i = (i + 1) % amounts.length) {
    const step = diff > 0 ? 1 : -1;
    amounts[i] = (amounts[i] ?? 0) + step;
    diff -= step;
  }
  return amounts;
}

/** Splits `total` between participants. Shares always add up exactly to the total. */
export function computeShares(
  total: number,
  method: SplitMethod,
  participants: Participant[],
): ShareResult {
  const n = participants.length;
  if (n === 0)
    return { ok: false, message: "Add at least one person to split with" };
  const seen = new Set(participants.map((p) => p.personId ?? "me"));
  if (seen.size !== n) return { ok: false, message: "Someone is listed twice" };

  const values = participants.map((p) => p.value ?? 0);
  let amounts: number[];
  switch (method) {
    case "equal":
      amounts = spreadRemainder(Array(n).fill(Math.floor(total / n)), total);
      break;
    case "exact": {
      amounts = values.map(Math.round);
      if (amounts.some((a) => a < 0))
        return { ok: false, message: "Amounts can't be negative" };
      const sum = amounts.reduce((a, b) => a + b, 0);
      if (sum !== total)
        return {
          ok: false,
          message: `Amounts add up to ${formatAmount(sum)} but the total is ${formatAmount(total)}`,
        };
      break;
    }
    case "percent": {
      const sum = values.reduce((a, b) => a + b, 0);
      if (values.some((v) => v < 0) || Math.abs(sum - 100) > 0.01)
        return {
          ok: false,
          message: `Percentages add up to ${+sum.toFixed(2)}%, not 100%`,
        };
      amounts = spreadRemainder(
        values.map((v) => Math.floor((total * v) / 100)),
        total,
      );
      break;
    }
    case "shares": {
      const sum = values.reduce((a, b) => a + b, 0);
      if (values.some((v) => v < 0) || sum <= 0)
        return { ok: false, message: "Give everyone a number of shares" };
      amounts = spreadRemainder(
        values.map((v) => Math.floor((total * v) / sum)),
        total,
      );
      break;
    }
  }
  return {
    ok: true,
    shares: participants.map((p, i) => ({
      personId: p.personId,
      amount: amounts[i] ?? 0,
      value: method === "equal" ? null : (values[i] ?? 0),
    })),
  };
}

/* ---------------- balances ---------------- */

export type Balance = {
  owedToMe: number;
  iOwe: number;
  received: number;
  paid: number;
  /** > 0: they owe the user. < 0: the user owes them. */
  net: number;
};

const empty = (): Balance => ({
  owedToMe: 0,
  iOwe: 0,
  received: 0,
  paid: 0,
  net: 0,
});

/** Per-person balances between the user and each person, optionally within one group. */
export async function personBalances(userId: number, groupId?: number) {
  const S = splitsTable;
  const SS = splitSharesTable;
  const ST = settlementsTable;
  const inGroup = (
    col: typeof S.groupId | typeof ST.groupId,
  ): SQL | undefined => (groupId ? eq(col, groupId) : undefined);

  const [owed, owe, settled] = await Promise.all([
    // User paid → each person's share is owed to the user.
    db
      .select({ personId: SS.personId, total: sql<string>`sum(${SS.amount})` })
      .from(SS)
      .innerJoin(S, eq(S.id, SS.splitId))
      .where(
        and(
          eq(S.userId, userId),
          isNull(S.paidByPersonId),
          isNotNull(SS.personId),
          inGroup(S.groupId),
        ),
      )
      .groupBy(SS.personId),
    // A person paid → the user's own share is owed to them.
    db
      .select({
        personId: S.paidByPersonId,
        total: sql<string>`sum(${SS.amount})`,
      })
      .from(SS)
      .innerJoin(S, eq(S.id, SS.splitId))
      .where(
        and(
          eq(S.userId, userId),
          isNotNull(S.paidByPersonId),
          isNull(SS.personId),
          inGroup(S.groupId),
        ),
      )
      .groupBy(S.paidByPersonId),
    db
      .select({
        personId: ST.personId,
        direction: ST.direction,
        total: sql<string>`sum(${ST.amount})`,
      })
      .from(ST)
      .where(and(eq(ST.userId, userId), inGroup(ST.groupId)))
      .groupBy(ST.personId, ST.direction),
  ]);

  const map = new Map<number, Balance>();
  const get = (id: number) => {
    let b = map.get(id);
    if (!b) {
      b = empty();
      map.set(id, b);
    }
    return b;
  };
  for (const r of owed)
    if (r.personId) get(r.personId).owedToMe += Number(r.total);
  for (const r of owe) if (r.personId) get(r.personId).iOwe += Number(r.total);
  for (const r of settled) {
    const b = get(r.personId);
    if (r.direction === "received") b.received += Number(r.total);
    else b.paid += Number(r.total);
  }
  for (const b of map.values())
    b.net = b.owedToMe - b.iOwe - b.received + b.paid;
  return map;
}

export const balanceInRupees = (b: Balance | undefined) => {
  const x = b ?? empty();
  return {
    owedToMe: amountOf(x.owedToMe),
    iOwe: amountOf(x.iOwe),
    received: amountOf(x.received),
    paid: amountOf(x.paid),
    net: amountOf(x.net),
  };
};

/* ---------------- ownership checks ---------------- */

export async function ownedPeople(userId: number, ids: number[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(peopleTable)
    .where(and(eq(peopleTable.userId, userId), inArray(peopleTable.id, ids)));
}

export async function ownedGroup(userId: number, id: number) {
  const [g] = await db
    .select()
    .from(splitGroupsTable)
    .where(
      and(eq(splitGroupsTable.id, id), eq(splitGroupsTable.userId, userId)),
    )
    .limit(1);
  return g;
}

export async function ownedDebitCategory(userId: number, id: number) {
  const [c] = await db
    .select()
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.id, id),
        eq(categoriesTable.userId, userId),
        eq(categoriesTable.type, "debit"),
      ),
    )
    .limit(1);
  return c;
}

/* ---------------- the user's own share as a transaction ---------------- */

/**
 * Keeps exactly one debit transaction per split for the user's own share
 * (so reports and budgets count only what the user actually consumed), or
 * none when the user isn't in the split / chose not to record it.
 */
export async function syncShareTransaction(
  tx: TX,
  split: {
    id: number;
    userId: number;
    description: string;
    date: string;
    categoryId: number | null;
    ownShare: OwnShareMode;
    accountId: number | null;
    eventId: number | null;
    bookId: number | null;
  },
  myShare: number,
) {
  const accountId =
    split.accountId ?? (await defaultAccountId(split.userId, tx));
  const bookId = split.bookId ?? (await defaultBookId(split.userId, tx));
  const [existing] = await tx
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.splitId, split.id))
    .limit(1);
  const want =
    split.ownShare === "recorded" && myShare > 0 && split.categoryId !== null;
  if (!want) {
    if (existing)
      await tx
        .delete(transactionsTable)
        .where(eq(transactionsTable.id, existing.id));
    return;
  }
  const values = {
    amount: myShare,
    categoryId: split.categoryId!,
    date: split.date,
    note: `Split: ${split.description}`,
    accountId,
    bookId,
    eventId: split.eventId,
  };
  if (existing) {
    await tx
      .update(transactionsTable)
      .set(values)
      .where(eq(transactionsTable.id, existing.id));
  } else {
    await tx.insert(transactionsTable).values({
      ...values,
      userId: split.userId,
      type: "debit",
      splitId: split.id,
    });
  }
}

/* ---------------- tagged users' copies of a split ---------------- */

export const SHARED_CATEGORY = {
  name: "Shared expenses",
  icon: "users",
  color: "#0d9488",
} as const;

/** The tagged user's "Shared expenses" debit category, created on first use. */
export async function sharedCategoryId(tx: TX, userId: number) {
  const find = () =>
    tx
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.userId, userId),
          eq(categoriesTable.type, "debit"),
          eq(categoriesTable.name, SHARED_CATEGORY.name),
        ),
      )
      .limit(1);
  const [existing] = await find();
  if (existing) return existing.id;
  await tx
    .insert(categoriesTable)
    .values({ ...SHARED_CATEGORY, userId, type: "debit" })
    .onConflictDoNothing();
  return (await find())[0]!.id;
}

/** How a tagged user's copy found its category: `picked` by them for that
 * split, a `remembered` rule, the `same_name` as the owner's, or
 * `unmatched` (it falls back to "Shared expenses" and the web asks). */
export type SharedCategoryMatch =
  | "picked"
  | "remembered"
  | "same_name"
  | "unmatched";

/**
 * The tagged user's category for a split whose owner filed it under
 * `sourceCategoryId`: a rule they saved for it, else their own expense
 * category of the same name (any case), else none.
 */
export async function matchSharedCategory(
  q: TX | typeof db,
  userId: number,
  sourceCategoryId: number | null,
): Promise<{ categoryId: number; match: SharedCategoryMatch } | null> {
  if (!sourceCategoryId) return null;
  const [rule] = await q
    .select({ categoryId: sharedCategoryRulesTable.categoryId })
    .from(sharedCategoryRulesTable)
    .where(
      and(
        eq(sharedCategoryRulesTable.userId, userId),
        eq(sharedCategoryRulesTable.sourceCategoryId, sourceCategoryId),
      ),
    )
    .limit(1);
  if (rule) return { categoryId: rule.categoryId, match: "remembered" };
  const source = sql`(select lower(trim(${categoriesTable.name})) from ${categoriesTable} where ${categoriesTable.id} = ${sourceCategoryId})`;
  const [same] = await q
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.userId, userId),
        eq(categoriesTable.type, "debit"),
        sql`lower(trim(${categoriesTable.name})) = ${source}`,
      ),
    )
    .orderBy(categoriesTable.id)
    .limit(1);
  return same ? { categoryId: same.id, match: "same_name" } : null;
}

/** Saves "their category X is my category Y" for the next splits. */
export async function rememberSharedCategory(
  q: TX | typeof db,
  userId: number,
  sourceCategoryId: number,
  categoryId: number,
) {
  await q
    .insert(sharedCategoryRulesTable)
    .values({ userId, sourceCategoryId, categoryId })
    .onConflictDoUpdate({
      target: [
        sharedCategoryRulesTable.userId,
        sharedCategoryRulesTable.sourceCategoryId,
      ],
      set: { categoryId, createdAt: new Date() },
    });
}

/**
 * After a rule is saved, moves the user's other copies from that owner
 * category that are still sitting in "Shared expenses" (and weren't picked
 * by hand) to the new category. Returns how many moved.
 */
export async function refileFallbackCopies(
  tx: TX,
  userId: number,
  sourceCategoryId: number,
  categoryId: number,
) {
  const [fallback] = await tx
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.userId, userId),
        eq(categoriesTable.type, "debit"),
        eq(categoriesTable.name, SHARED_CATEGORY.name),
      ),
    )
    .limit(1);
  if (!fallback || fallback.id === categoryId) return 0;
  const T = transactionsTable;
  const rows = await tx
    .update(T)
    .set({ categoryId })
    .where(
      and(
        eq(T.userId, userId),
        eq(T.categoryId, fallback.id),
        // Spelled out: columns inside sql`` lose their table in an update.
        sql`"transactions"."shared_split_id" in (select s."id" from "splits" s where s."category_id" = ${sourceCategoryId})`,
        sql`not exists (select 1 from "shared_split_prefs" p where p."split_id" = "transactions"."shared_split_id" and p."user_id" = ${userId} and p."category_id" is not null)`,
      ),
    )
    .returning({ id: T.id });
  return rows.length;
}

/** Which of `linkedIds` have blocked `ownerId` from tagging them. */
export async function usersBlocking(ownerId: number, linkedIds: number[]) {
  if (!linkedIds.length) return [];
  const rows = await db
    .select({ id: userBlocksTable.userId })
    .from(userBlocksTable)
    .where(
      and(
        eq(userBlocksTable.blockedUserId, ownerId),
        inArray(userBlocksTable.userId, linkedIds),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Keeps each tagged user's own copy of the split in step: one debit
 * transaction (`shared_split_id`) for their share when they want it (their
 * per-split decision, else their `tagged_expenses` setting), none otherwise.
 * A new copy goes to the category `matchSharedCategory` finds, else
 * "Shared expenses". An existing copy only has amount/date/note refreshed,
 * so a category or account the tagged user changed sticks. Pass
 * `onlyUserId` to refresh one user, and `categoryId` (theirs) to move that
 * user's copy to a category they just picked.
 */
export async function syncSharedTransactions(
  tx: TX,
  split: {
    id: number;
    userId: number;
    description: string;
    date: string;
    categoryId: number | null;
  },
  onlyUserId?: number,
  categoryId?: number,
) {
  const tagged = await tx
    .select({
      userId: usersTable.id,
      mode: usersTable.taggedExpenses,
      amount: splitSharesTable.amount,
      decision: sharedSplitPrefsTable.decision,
      picked: sharedSplitPrefsTable.categoryId,
    })
    .from(splitSharesTable)
    .innerJoin(peopleTable, eq(peopleTable.id, splitSharesTable.personId))
    .innerJoin(usersTable, eq(usersTable.id, peopleTable.linkedUserId))
    .leftJoin(
      sharedSplitPrefsTable,
      and(
        eq(sharedSplitPrefsTable.splitId, split.id),
        eq(sharedSplitPrefsTable.userId, usersTable.id),
      ),
    )
    .where(eq(splitSharesTable.splitId, split.id));

  // People removed from the split lose their copy.
  if (!onlyUserId) {
    const ids = tagged.map((t) => t.userId);
    await tx
      .delete(transactionsTable)
      .where(
        and(
          eq(transactionsTable.sharedSplitId, split.id),
          ids.length ? notInArray(transactionsTable.userId, ids) : undefined,
        ),
      );
  }

  for (const t of tagged) {
    if (onlyUserId && t.userId !== onlyUserId) continue;
    const [existing] = await tx
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.sharedSplitId, split.id),
          eq(transactionsTable.userId, t.userId),
        ),
      )
      .limit(1);
    const add = t.decision ? t.decision === "added" : t.mode === "auto";
    const want = add && t.amount > 0;
    if (!want) {
      if (existing)
        await tx
          .delete(transactionsTable)
          .where(eq(transactionsTable.id, existing.id));
      continue;
    }
    const values = {
      amount: t.amount,
      date: split.date,
      note: `Split: ${split.description}`,
      ...(categoryId && onlyUserId === t.userId && { categoryId }),
    };
    if (existing) {
      await tx
        .update(transactionsTable)
        .set(values)
        .where(eq(transactionsTable.id, existing.id));
    } else {
      await tx.insert(transactionsTable).values({
        ...values,
        userId: t.userId,
        type: "debit",
        categoryId:
          values.categoryId ??
          t.picked ??
          (await matchSharedCategory(tx, t.userId, split.categoryId))
            ?.categoryId ??
          (await sharedCategoryId(tx, t.userId)),
        accountId: await defaultAccountId(t.userId, tx),
        bookId: await defaultBookId(t.userId, tx),
        sharedSplitId: split.id,
      });
    }
  }
}
