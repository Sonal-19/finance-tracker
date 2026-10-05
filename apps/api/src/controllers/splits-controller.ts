import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "$/db";
import {
  categoriesTable,
  ownShareModes,
  peopleTable,
  relations,
  settlementDirections,
  settlementsTable,
  sharedSplitDecisions,
  sharedSplitPrefsTable,
  splitGroupMembersTable,
  splitGroupsTable,
  splitMethods,
  splitSharesTable,
  splitsTable,
  transactionsTable,
  usersTable,
} from "$/db/schema";
import { resolveAccountId } from "$/lib/services/account-service";
import { resolveBookId } from "$/lib/services/book-service";
import { rateLimitService } from "$/lib/services/rate-limit-service";
import {
  balanceInRupees,
  computeShares,
  ownedDebitCategory,
  ownedGroup,
  ownedPeople,
  personBalances,
  syncSharedTransactions,
  syncShareTransaction,
  usersBlocking,
} from "$/lib/services/split-service";
import { ownedEventId } from "$/lib/services/transaction-service";
import {
  normalizeUsername,
  usernameService,
} from "$/lib/services/username-service";
import { fail, ok } from "$/lib/utils";
import { toPaise, toRupees } from "$/lib/utils/money";
import { today } from "$/lib/utils/period";
import { tEnum } from "$/lib/utils/schema";
import { protectedUser } from "$/pre-processor";

const tDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const tId = t.Object({ id: t.Numeric() });

function isFkViolation(e: unknown) {
  const err = e as {
    code?: string;
    errno?: string;
    cause?: { code?: string; errno?: string };
  };
  return [err.code, err.errno, err.cause?.code, err.cause?.errno].includes(
    "23503",
  );
}

/* ============================ splits: read helpers ============================ */

type SplitRow = typeof splitsTable.$inferSelect;

/** Splits with shares, names and the user's position in each. */
async function hydrateSplits(userId: number, rows: SplitRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const shares = await db
    .select({
      splitId: splitSharesTable.splitId,
      personId: splitSharesTable.personId,
      amount: splitSharesTable.amount,
      value: splitSharesTable.value,
      name: peopleTable.name,
    })
    .from(splitSharesTable)
    .leftJoin(peopleTable, eq(peopleTable.id, splitSharesTable.personId))
    .where(inArray(splitSharesTable.splitId, ids))
    .orderBy(splitSharesTable.id);
  const personIds = [
    ...new Set(
      rows.map((r) => r.paidByPersonId).filter((x): x is number => !!x),
    ),
  ];
  const groupIds = [
    ...new Set(rows.map((r) => r.groupId).filter((x): x is number => !!x)),
  ];
  const catIds = [
    ...new Set(rows.map((r) => r.categoryId).filter((x): x is number => !!x)),
  ];
  const [payers, groups, cats] = await Promise.all([
    ownedPeople(userId, personIds),
    groupIds.length
      ? db
          .select()
          .from(splitGroupsTable)
          .where(inArray(splitGroupsTable.id, groupIds))
      : [],
    catIds.length
      ? db
          .select()
          .from(categoriesTable)
          .where(inArray(categoriesTable.id, catIds))
      : [],
  ]);

  return rows.map((r) => {
    const mine = shares.filter((s) => s.splitId === r.id);
    const myShare = mine.find((s) => s.personId === null)?.amount ?? 0;
    const payer = payers.find((p) => p.id === r.paidByPersonId);
    const group = groups.find((g) => g.id === r.groupId);
    const cat = cats.find((c) => c.id === r.categoryId);
    return {
      id: r.id,
      description: r.description,
      date: r.date,
      total: toRupees(r.total),
      method: r.method,
      note: r.note,
      ownShare: r.ownShare,
      accountId: r.accountId,
      eventId: r.eventId,
      bookId: r.bookId,
      category: cat
        ? { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color }
        : null,
      group: group
        ? {
            id: group.id,
            name: group.name,
            icon: group.icon,
            color: group.color,
          }
        : null,
      paidBy: payer ? { id: payer.id, name: payer.name } : null,
      myShare: toRupees(myShare),
      /** + others owe the user this much from this bill, − the user owes the payer. */
      myEffect: payer ? -toRupees(myShare) : toRupees(r.total - myShare),
      shares: mine.map((s) => ({
        personId: s.personId,
        name: s.personId === null ? "You" : (s.name ?? "?"),
        amount: toRupees(s.amount),
        value: s.value,
      })),
    };
  });
}

/* ============================ people ============================ */

const personBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 60 }),
  phone: t.Optional(t.Nullable(t.String({ maxLength: 20 }))),
  email: t.Optional(t.Nullable(t.String({ maxLength: 254 }))),
  relation: tEnum(relations),
});

const peopleController = new Elysia({
  name: "people_controller",
  prefix: "/people",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const [rows, balances] = await Promise.all([
      db
        .select({ person: peopleTable, username: usersTable.username })
        .from(peopleTable)
        .leftJoin(usersTable, eq(usersTable.id, peopleTable.linkedUserId))
        .where(eq(peopleTable.userId, user.id))
        .orderBy(peopleTable.name),
      personBalances(user.id),
    ]);
    return ok(
      rows.map(({ person: p, username }) => ({
        ...p,
        username,
        balance: balanceInRupees(balances.get(p.id)),
      })),
    );
  })
  .get(
    "/:id",
    async ({ user, params, status }) => {
      const [person] = await ownedPeople(user.id, [params.id]);
      if (!person) return status(404, fail("Person not found"));
      const shareSplitIds = db
        .select({ id: splitSharesTable.splitId })
        .from(splitSharesTable)
        .where(eq(splitSharesTable.personId, person.id));
      const [balances, splitRows, settlements] = await Promise.all([
        personBalances(user.id),
        db
          .select()
          .from(splitsTable)
          .where(
            and(
              eq(splitsTable.userId, user.id),
              or(
                eq(splitsTable.paidByPersonId, person.id),
                inArray(splitsTable.id, shareSplitIds),
              ),
            ),
          )
          .orderBy(desc(splitsTable.date), desc(splitsTable.id)),
        db
          .select()
          .from(settlementsTable)
          .where(
            and(
              eq(settlementsTable.userId, user.id),
              eq(settlementsTable.personId, person.id),
            ),
          )
          .orderBy(desc(settlementsTable.date), desc(settlementsTable.id)),
      ]);
      const splits = await hydrateSplits(user.id, splitRows);
      const activity = [
        ...splits.map((s) => {
          const theirShare =
            s.shares.find((x) => x.personId === person.id)?.amount ?? 0;
          // Effect on this person's balance with the user.
          const effect = s.paidBy?.id === person.id ? -s.myShare : theirShare;
          return {
            kind: "split" as const,
            key: `s${s.id}`,
            date: s.date,
            effect,
            split: s,
          };
        }),
        ...settlements.map((st) => ({
          kind: "settlement" as const,
          key: `p${st.id}`,
          date: st.date,
          effect:
            st.direction === "received"
              ? -toRupees(st.amount)
              : toRupees(st.amount),
          settlement: { ...st, amount: toRupees(st.amount) },
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return ok({
        person,
        balance: balanceInRupees(balances.get(person.id)),
        activity,
      });
    },
    { params: tId },
  )
  .post(
    "/",
    async ({ user, body }) => {
      const [row] = await db
        .insert(peopleTable)
        .values({
          ...body,
          name: body.name.trim(),
          phone: body.phone?.trim() || null,
          email: body.email?.trim() || null,
          userId: user.id,
        })
        .returning();
      return ok(
        { ...row!, balance: balanceInRupees(undefined) },
        `${row!.name} added`,
      );
    },
    { body: personBody },
  )
  /** Tag a platform user by exact @username: creates (or returns) the person linked to them. */
  .post(
    "/link",
    async ({ user, body, status }) => {
      if (!rateLimitService.hit(`tag:${user.id}`, 30, 60_000))
        return status(429, fail("Too many lookups. Try again shortly."));
      const targetId = usernameService.findUserId(
        normalizeUsername(body.username),
      );
      // Same message for unknown and blocked: don't reveal who blocked whom.
      const notFound = fail("No user found with that username");
      if (targetId === null) return status(404, notFound);
      if (targetId === user.id)
        return status(400, fail("You can't tag yourself"));
      if ((await usersBlocking(user.id, [targetId])).length)
        return status(404, notFound);
      const [target] = await db
        .select({ name: usersTable.name, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, targetId))
        .limit(1);
      if (!target) return status(404, notFound);
      await db
        .insert(peopleTable)
        .values({
          userId: user.id,
          linkedUserId: targetId,
          name: target.name,
          relation: "friend",
        })
        .onConflictDoNothing();
      const [row] = await db
        .select()
        .from(peopleTable)
        .where(
          and(
            eq(peopleTable.userId, user.id),
            eq(peopleTable.linkedUserId, targetId),
          ),
        )
        .limit(1);
      return ok(
        {
          ...row!,
          username: target.username,
          balance: balanceInRupees(undefined),
        },
        `@${target.username} added`,
      );
    },
    { body: t.Object({ username: t.String({ maxLength: 40 }) }) },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const [row] = await db
        .update(peopleTable)
        .set({
          ...body,
          ...(body.name && { name: body.name.trim() }),
          ...(body.phone !== undefined && {
            phone: body.phone?.trim() || null,
          }),
          ...(body.email !== undefined && {
            email: body.email?.trim() || null,
          }),
        })
        .where(
          and(eq(peopleTable.id, params.id), eq(peopleTable.userId, user.id)),
        )
        .returning();
      return row ? ok(row, "Saved") : status(404, fail("Person not found"));
    },
    { params: tId, body: t.Partial(personBody) },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      try {
        const [row] = await db
          .delete(peopleTable)
          .where(
            and(eq(peopleTable.id, params.id), eq(peopleTable.userId, user.id)),
          )
          .returning();
        return row
          ? ok(null, `${row.name} removed`)
          : status(404, fail("Person not found"));
      } catch (e) {
        if (isFkViolation(e))
          return status(
            409,
            fail(
              "This person has shared expenses or payments. Delete those first.",
            ),
          );
        throw e;
      }
    },
    { params: tId },
  );

/* ============================ groups ============================ */

const groupBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 60 }),
  icon: t.String({ pattern: "^[a-z0-9-]{1,40}$" }),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  memberIds: t.Array(t.Integer({ minimum: 1 }), { maxItems: 100 }),
});

async function groupMembers(groupIds: number[]) {
  if (!groupIds.length) return [];
  return db
    .select({ groupId: splitGroupMembersTable.groupId, person: peopleTable })
    .from(splitGroupMembersTable)
    .innerJoin(peopleTable, eq(peopleTable.id, splitGroupMembersTable.personId))
    .where(inArray(splitGroupMembersTable.groupId, groupIds))
    .orderBy(peopleTable.name);
}

async function setMembers(
  userId: number,
  groupId: number,
  memberIds: number[],
) {
  const people = await ownedPeople(userId, [...new Set(memberIds)]);
  await db
    .delete(splitGroupMembersTable)
    .where(eq(splitGroupMembersTable.groupId, groupId));
  if (people.length)
    await db
      .insert(splitGroupMembersTable)
      .values(people.map((p) => ({ groupId, personId: p.id })));
}

const groupsController = new Elysia({
  name: "split_groups_controller",
  prefix: "/split-groups",
})
  .use(protectedUser)
  .get("/", async ({ user }) => {
    const groups = await db
      .select({
        group: splitGroupsTable,
        spent: sql<string>`coalesce((select sum(${splitsTable.total}) from ${splitsTable} where ${splitsTable.groupId} = "split_groups"."id"), 0)`,
      })
      .from(splitGroupsTable)
      .where(eq(splitGroupsTable.userId, user.id))
      .orderBy(desc(splitGroupsTable.createdAt));
    const members = await groupMembers(groups.map((g) => g.group.id));
    return ok(
      groups.map(({ group, spent }) => {
        return {
          ...group,
          totalSpent: toRupees(spent),
          members: members
            .filter((m) => m.groupId === group.id)
            .map((m) => m.person),
        };
      }),
    );
  })
  .get(
    "/:id",
    async ({ user, params, status }) => {
      const group = await ownedGroup(user.id, params.id);
      if (!group) return status(404, fail("Group not found"));
      const [members, balances, splitRows] = await Promise.all([
        groupMembers([group.id]),
        // Overall balance with each member (repayments are rarely tied to one group).
        personBalances(user.id),
        db
          .select()
          .from(splitsTable)
          .where(
            and(
              eq(splitsTable.userId, user.id),
              eq(splitsTable.groupId, group.id),
            ),
          )
          .orderBy(desc(splitsTable.date), desc(splitsTable.id)),
      ]);
      const splits = await hydrateSplits(user.id, splitRows);
      return ok({
        group,
        totalSpent: splits.reduce((a, s) => a + s.total, 0),
        myTotalShare: splits.reduce((a, s) => a + s.myShare, 0),
        paidByMe: splits
          .filter((s) => !s.paidBy)
          .reduce((a, s) => a + s.total, 0),
        members: members.map((m) => ({
          ...m.person,
          balance: balanceInRupees(balances.get(m.person.id)),
        })),
        splits,
      });
    },
    { params: tId },
  )
  .post(
    "/",
    async ({ user, body }) => {
      const [group] = await db
        .insert(splitGroupsTable)
        .values({
          name: body.name.trim(),
          icon: body.icon,
          color: body.color,
          userId: user.id,
        })
        .returning();
      await setMembers(user.id, group!.id, body.memberIds);
      return ok(group!, "Group created");
    },
    { body: groupBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body, status }) => {
      const group = await ownedGroup(user.id, params.id);
      if (!group) return status(404, fail("Group not found"));
      const { memberIds, ...rest } = body;
      if (Object.keys(rest).length)
        await db
          .update(splitGroupsTable)
          .set({ ...rest, ...(rest.name && { name: rest.name.trim() }) })
          .where(eq(splitGroupsTable.id, group.id));
      if (memberIds) await setMembers(user.id, group.id, memberIds);
      return ok(null, "Group updated");
    },
    { params: tId, body: t.Partial(groupBody) },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(splitGroupsTable)
        .where(
          and(
            eq(splitGroupsTable.id, params.id),
            eq(splitGroupsTable.userId, user.id),
          ),
        )
        .returning();
      return row
        ? ok(null, "Group deleted (its expenses and balances are kept)")
        : status(404, fail("Group not found"));
    },
    { params: tId },
  );

/* ============================ splits ============================ */

const splitBody = t.Object({
  description: t.String({ minLength: 1, maxLength: 120 }),
  total: t.Number({ exclusiveMinimum: 0, maximum: 1_000_000_000 }),
  date: tDate,
  groupId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  /** null / omitted = the user paid */
  paidByPersonId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  method: tEnum(splitMethods),
  participants: t.Array(
    t.Object({
      personId: t.Nullable(t.Integer({ minimum: 1 })),
      value: t.Optional(t.Number({ minimum: 0 })),
    }),
    { minItems: 1, maxItems: 100 },
  ),
  categoryId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  /** `skipped` = don't book the user's own share as an expense. */
  ownShare: t.Optional(tEnum(ownShareModes)),
  /** Account your share is recorded against (null = default account). */
  accountId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  eventId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  /** Book your share is recorded in (null = default book). */
  bookId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  note: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
  /** Turn an existing plain transaction into this split (it's replaced by the user's share). */
  fromTransactionId: t.Optional(t.Integer({ minimum: 1 })),
});
type SplitBody = typeof splitBody.static;

/** Validates ownership + share maths. Returns the rows to write or an error message. */
async function prepareSplit(userId: number, body: SplitBody) {
  const personIds = [
    ...body.participants
      .map((p) => p.personId)
      .filter((x): x is number => x !== null),
    ...(body.paidByPersonId ? [body.paidByPersonId] : []),
  ];
  const unique = [...new Set(personIds)];
  const owned = await ownedPeople(userId, unique);
  if (owned.length !== unique.length)
    return { error: "Unknown person in this split" };
  const linked = owned.flatMap((p) => (p.linkedUserId ? [p.linkedUserId] : []));
  if ((await usersBlocking(userId, linked)).length)
    return { error: "Someone in this split has blocked you from tagging them" };
  if (body.groupId && !(await ownedGroup(userId, body.groupId)))
    return { error: "Group not found" };
  if (body.categoryId && !(await ownedDebitCategory(userId, body.categoryId)))
    return { error: "Pick an expense category" };
  if (body.accountId) {
    const account = await resolveAccountId(userId, body.accountId);
    if (!account.ok) return { error: account.message };
  }
  if (body.bookId) {
    const book = await resolveBookId(userId, body.bookId);
    if (!book.ok) return { error: book.message };
  }
  const event = await ownedEventId(userId, body.eventId);
  if (!event.ok) return { error: event.message };

  const meIn = body.participants.some((p) => p.personId === null);
  if (body.paidByPersonId && !meIn)
    return {
      error: "You're not part of this expense, so there's nothing to track",
    };
  if (
    !body.paidByPersonId &&
    !body.participants.some((p) => p.personId !== null)
  )
    return { error: "Add at least one person to split with" };

  const total = toPaise(body.total);
  const result = computeShares(total, body.method, body.participants);
  if (!result.ok) return { error: result.message };
  const myShare = result.shares.find((s) => s.personId === null)?.amount ?? 0;
  return { total, shares: result.shares, myShare };
}

async function getSplit(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(splitsTable)
    .where(and(eq(splitsTable.id, id), eq(splitsTable.userId, userId)))
    .limit(1);
  if (!row) return null;
  const [split] = await hydrateSplits(userId, [row]);
  return split ?? null;
}

const splitsController = new Elysia({
  name: "splits_controller",
  prefix: "/splits",
})
  .use(protectedUser)
  .get(
    "/",
    async ({ user, query }) => {
      const rows = await db
        .select()
        .from(splitsTable)
        .where(
          and(
            eq(splitsTable.userId, user.id),
            query.groupId ? eq(splitsTable.groupId, query.groupId) : undefined,
          ),
        )
        .orderBy(desc(splitsTable.date), desc(splitsTable.id))
        .limit(query.limit ?? 50);
      return ok(await hydrateSplits(user.id, rows));
    },
    {
      query: t.Object({
        groupId: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
      }),
    },
  )
  /** Splits other users tagged me on (read-only), with whether my copy is booked. */
  .get("/shared", async ({ user }) => {
    const rows = await db
      .select({
        id: splitsTable.id,
        description: splitsTable.description,
        date: splitsTable.date,
        total: splitsTable.total,
        myShare: splitSharesTable.amount,
        ownerName: usersTable.name,
        ownerUsername: usersTable.username,
        copyId: transactionsTable.id,
      })
      .from(splitSharesTable)
      .innerJoin(peopleTable, eq(peopleTable.id, splitSharesTable.personId))
      .innerJoin(splitsTable, eq(splitsTable.id, splitSharesTable.splitId))
      .innerJoin(usersTable, eq(usersTable.id, splitsTable.userId))
      .leftJoin(
        transactionsTable,
        and(
          eq(transactionsTable.sharedSplitId, splitsTable.id),
          eq(transactionsTable.userId, user.id),
        ),
      )
      .where(eq(peopleTable.linkedUserId, user.id))
      .orderBy(desc(splitsTable.date), desc(splitsTable.id));
    return ok(
      rows.map(({ copyId, total, myShare, ...r }) => ({
        ...r,
        total: toRupees(total),
        myShare: toRupees(myShare),
        /** Whether my share is booked as an expense in my own books. */
        decision: copyId !== null ? ("added" as const) : ("skipped" as const),
      })),
    );
  })
  .put(
    "/shared/:id/decision",
    async ({ user, params, body, status }) => {
      const [split] = await db
        .select({
          id: splitsTable.id,
          userId: splitsTable.userId,
          description: splitsTable.description,
          date: splitsTable.date,
        })
        .from(splitsTable)
        .innerJoin(
          splitSharesTable,
          eq(splitSharesTable.splitId, splitsTable.id),
        )
        .innerJoin(peopleTable, eq(peopleTable.id, splitSharesTable.personId))
        .where(
          and(
            eq(splitsTable.id, params.id),
            eq(peopleTable.linkedUserId, user.id),
          ),
        )
        .limit(1);
      if (!split) return status(404, fail("Split not found"));
      await db.transaction(async (tx) => {
        await tx
          .insert(sharedSplitPrefsTable)
          .values({
            splitId: split.id,
            userId: user.id,
            decision: body.decision,
          })
          .onConflictDoUpdate({
            target: [
              sharedSplitPrefsTable.splitId,
              sharedSplitPrefsTable.userId,
            ],
            set: { decision: body.decision, decidedAt: new Date() },
          });
        await syncSharedTransactions(tx, split, user.id);
      });
      return ok(
        { decision: body.decision },
        body.decision === "added"
          ? "Added to your expenses"
          : "Removed from your expenses",
      );
    },
    { params: tId, body: t.Object({ decision: tEnum(sharedSplitDecisions) }) },
  )
  .get("/summary", async ({ user }) => {
    const balances = await personBalances(user.id);
    let owedToYou = 0;
    let youOwe = 0;
    for (const b of balances.values()) {
      if (b.net > 0) owedToYou += b.net;
      else youOwe -= b.net;
    }
    return ok({
      owedToYou: toRupees(owedToYou),
      youOwe: toRupees(youOwe),
      net: toRupees(owedToYou - youOwe),
    });
  })
  .get(
    "/:id",
    async ({ user, params, status }) => {
      const split = await getSplit(user.id, params.id);
      return split ? ok(split) : status(404, fail("Split not found"));
    },
    { params: tId },
  )
  .post(
    "/",
    async ({ user, body, status }) => {
      const prep = await prepareSplit(user.id, body);
      if ("error" in prep) return status(400, fail(prep.error!));

      let accountId = body.accountId ?? null;
      let eventId = body.eventId ?? null;
      let bookId = body.bookId ?? null;
      if (body.fromTransactionId) {
        const [src] = await db
          .select()
          .from(transactionsTable)
          .where(
            and(
              eq(transactionsTable.id, body.fromTransactionId),
              eq(transactionsTable.userId, user.id),
            ),
          )
          .limit(1);
        if (src?.type !== "debit" || src.splitId)
          return status(400, fail("That transaction can't be split"));
        // Keep the original transaction's account, event and book unless changed.
        if (body.accountId === undefined) accountId = src.accountId;
        if (body.eventId === undefined) eventId = src.eventId;
        if (body.bookId === undefined) bookId = src.bookId;
      }

      const id = await db.transaction(async (tx) => {
        const [split] = await tx
          .insert(splitsTable)
          .values({
            userId: user.id,
            groupId: body.groupId ?? null,
            description: body.description.trim(),
            total: prep.total,
            date: body.date,
            paidByPersonId: body.paidByPersonId ?? null,
            method: body.method,
            categoryId: body.categoryId ?? null,
            ownShare: body.ownShare ?? "recorded",
            accountId,
            eventId,
            bookId,
            note: body.note?.trim() || null,
          })
          .returning();
        await tx
          .insert(splitSharesTable)
          .values(prep.shares.map((s) => ({ ...s, splitId: split!.id })));
        if (body.fromTransactionId)
          await tx
            .delete(transactionsTable)
            .where(eq(transactionsTable.id, body.fromTransactionId));
        await syncShareTransaction(tx, split!, prep.myShare);
        await syncSharedTransactions(tx, split!);
        return split!.id;
      });
      return ok(await getSplit(user.id, id), "Expense split");
    },
    { body: splitBody },
  )
  .put(
    "/:id",
    async ({ user, params, body, status }) => {
      const existing = await getSplit(user.id, params.id);
      if (!existing) return status(404, fail("Split not found"));
      const prep = await prepareSplit(user.id, body);
      if ("error" in prep) return status(400, fail(prep.error!));
      await db.transaction(async (tx) => {
        const [split] = await tx
          .update(splitsTable)
          .set({
            groupId: body.groupId ?? null,
            description: body.description.trim(),
            total: prep.total,
            date: body.date,
            paidByPersonId: body.paidByPersonId ?? null,
            method: body.method,
            categoryId: body.categoryId ?? null,
            ownShare: body.ownShare ?? "recorded",
            accountId: body.accountId ?? null,
            eventId: body.eventId ?? null,
            bookId: body.bookId ?? null,
            note: body.note?.trim() || null,
          })
          .where(eq(splitsTable.id, params.id))
          .returning();
        await tx
          .delete(splitSharesTable)
          .where(eq(splitSharesTable.splitId, params.id));
        await tx
          .insert(splitSharesTable)
          .values(prep.shares.map((s) => ({ ...s, splitId: params.id })));
        await syncShareTransaction(tx, split!, prep.myShare);
        await syncSharedTransactions(tx, split!);
      });
      return ok(await getSplit(user.id, params.id), "Split updated");
    },
    { params: tId, body: t.Omit(splitBody, ["fromTransactionId"]) },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      // Cascades to shares and to the user's share transaction.
      const [row] = await db
        .delete(splitsTable)
        .where(
          and(eq(splitsTable.id, params.id), eq(splitsTable.userId, user.id)),
        )
        .returning();
      return row
        ? ok(null, "Split deleted")
        : status(404, fail("Split not found"));
    },
    { params: tId },
  );

/* ============================ settlements ============================ */

const settlementsController = new Elysia({
  name: "settlements_controller",
  prefix: "/settlements",
})
  .use(protectedUser)
  .post(
    "/",
    async ({ user, body, status }) => {
      const [person] = await ownedPeople(user.id, [body.personId]);
      if (!person) return status(404, fail("Person not found"));
      if (body.groupId && !(await ownedGroup(user.id, body.groupId)))
        return status(404, fail("Group not found"));
      await db.insert(settlementsTable).values({
        userId: user.id,
        personId: person.id,
        groupId: body.groupId ?? null,
        direction: body.direction,
        amount: toPaise(body.amount),
        date: body.date ?? today(),
        note: body.note?.trim() || null,
      });
      return ok(
        null,
        body.direction === "received"
          ? `Recorded ₹${body.amount} from ${person.name}`
          : `Recorded ₹${body.amount} paid to ${person.name}`,
      );
    },
    {
      body: t.Object({
        personId: t.Integer({ minimum: 1 }),
        groupId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
        direction: tEnum(settlementDirections),
        amount: t.Number({ exclusiveMinimum: 0, maximum: 1_000_000_000 }),
        date: t.Optional(tDate),
        note: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const [row] = await db
        .delete(settlementsTable)
        .where(
          and(
            eq(settlementsTable.id, params.id),
            eq(settlementsTable.userId, user.id),
          ),
        )
        .returning();
      return row
        ? ok(null, "Payment removed")
        : status(404, fail("Payment not found"));
    },
    { params: tId },
  );

export const splitControllers = new Elysia({ name: "split_controllers" })
  .use(peopleController)
  .use(groupsController)
  .use(splitsController)
  .use(settlementsController);
