import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "$/db";
import {
  categoriesTable,
  peopleTable,
  personSharesTable,
  type SelectPersonShare,
  type SelectSettlementClaim,
  settlementClaimsTable,
  settlementsTable,
  splitGroupsTable,
  splitSharesTable,
  splitsTable,
} from "$/db/schema";
import { amountOf } from "$/lib/utils/money";
import { isExpired } from "./share-service";
import { balanceInRupees, personBalances } from "./split-service";

const P = personSharesTable;

/** Bills and payments a person's page lists at most (newest first). */
export const PERSON_SHARE_ROW_LIMIT = 2000;

export const personShareCookieName = (s: SelectPersonShare) => `pshare_${s.id}`;

/** The owner's view of a link: no password hash, no cookie secret. */
export const serializePersonShare = ({
  passwordHash,
  secret: _secret,
  userId: _userId,
  ...s
}: SelectPersonShare) => ({
  ...s,
  protection: passwordHash ? ("password" as const) : ("open" as const),
  expired: isExpired(s),
});

/** A link with its person, or undefined when unknown or expired. */
export async function findPersonShare(token: string) {
  const [row] = await db
    .select({ share: P, person: peopleTable })
    .from(P)
    .innerJoin(peopleTable, eq(peopleTable.id, P.personId))
    .where(eq(P.token, token))
    .limit(1);
  if (!row || isExpired(row.share)) return undefined;
  return row;
}

/**
 * Everything between the owner and one person, from the person's side:
 * every bill they were on or paid, payments both ways, a running balance
 * and the balance now. `effect` / `net` > 0 = the person owes the owner.
 * Bills a third person paid are listed, but don't move this balance (the
 * same rule as `personBalances`).
 */
export async function personShareEntries(
  share: SelectPersonShare,
  ownerName: string,
) {
  const userId = share.userId;
  const personId = share.personId;
  const onBill = db
    .select({ id: splitSharesTable.splitId })
    .from(splitSharesTable)
    .where(eq(splitSharesTable.personId, personId));
  const [balances, splitRows, settlementRows] = await Promise.all([
    personBalances(userId),
    db
      .select({
        split: splitsTable,
        group: {
          id: splitGroupsTable.id,
          name: splitGroupsTable.name,
          icon: splitGroupsTable.icon,
          color: splitGroupsTable.color,
        },
        category: {
          name: categoriesTable.name,
          icon: categoriesTable.icon,
          color: categoriesTable.color,
        },
      })
      .from(splitsTable)
      .leftJoin(splitGroupsTable, eq(splitGroupsTable.id, splitsTable.groupId))
      .leftJoin(categoriesTable, eq(categoriesTable.id, splitsTable.categoryId))
      .where(
        and(
          eq(splitsTable.userId, userId),
          or(
            eq(splitsTable.paidByPersonId, personId),
            inArray(splitsTable.id, onBill),
          ),
        ),
      )
      .orderBy(desc(splitsTable.date), desc(splitsTable.id))
      .limit(PERSON_SHARE_ROW_LIMIT),
    db
      .select()
      .from(settlementsTable)
      .where(
        and(
          eq(settlementsTable.userId, userId),
          eq(settlementsTable.personId, personId),
        ),
      )
      .orderBy(desc(settlementsTable.date), desc(settlementsTable.id))
      .limit(PERSON_SHARE_ROW_LIMIT),
  ]);

  const splitIds = splitRows.map((r) => r.split.id);
  const shareRows = splitIds.length
    ? await db
        .select({
          splitId: splitSharesTable.splitId,
          personId: splitSharesTable.personId,
          amount: splitSharesTable.amount,
          name: peopleTable.name,
        })
        .from(splitSharesTable)
        .leftJoin(peopleTable, eq(peopleTable.id, splitSharesTable.personId))
        .where(inArray(splitSharesTable.splitId, splitIds))
        .orderBy(splitSharesTable.id)
    : [];
  const payerIds = [
    ...new Set(
      splitRows
        .map((r) => r.split.paidByPersonId)
        .filter((x): x is number => !!x && x !== personId),
    ),
  ];
  const payers = payerIds.length
    ? await db
        .select({ id: peopleTable.id, name: peopleTable.name })
        .from(peopleTable)
        .where(
          and(
            eq(peopleTable.userId, userId),
            inArray(peopleTable.id, payerIds),
          ),
        )
    : [];
  const showOthers = share.participants === "shown";

  const bills = splitRows.map(({ split: s, group, category }) => {
    const shares = shareRows.filter((x) => x.splitId === s.id);
    const yours = shares.find((x) => x.personId === personId)?.amount ?? 0;
    const owners = shares.find((x) => x.personId === null)?.amount ?? 0;
    const paidBy =
      s.paidByPersonId === null
        ? { kind: "owner" as const, name: ownerName }
        : s.paidByPersonId === personId
          ? { kind: "you" as const, name: "You" }
          : {
              kind: "other" as const,
              name: showOthers
                ? (payers.find((p) => p.id === s.paidByPersonId)?.name ??
                  "Someone")
                : "Someone else",
            };
    const effect =
      paidBy.kind === "owner" ? yours : paidBy.kind === "you" ? -owners : 0;
    return {
      kind: "split" as const,
      key: `s${s.id}`,
      id: s.id,
      date: s.date,
      description: s.description,
      note: s.note,
      method: s.method,
      total: amountOf(s.total),
      group,
      category,
      paidBy,
      yourShare: amountOf(yours),
      ownerShare: amountOf(owners),
      effect: amountOf(effect),
      people: shares.length,
      shares: showOthers
        ? shares.map((x) => ({
            who:
              x.personId === null
                ? ("owner" as const)
                : x.personId === personId
                  ? ("you" as const)
                  : ("other" as const),
            name:
              x.personId === null
                ? ownerName
                : x.personId === personId
                  ? "You"
                  : (x.name ?? "Someone"),
            amount: amountOf(x.amount),
          }))
        : [],
    };
  });
  const payments = settlementRows.map((st) => ({
    kind: "settlement" as const,
    key: `p${st.id}`,
    id: st.id,
    date: st.date,
    /** From the viewer's side. */
    direction:
      st.direction === "received"
        ? ("you_paid" as const)
        : ("you_received" as const),
    amount: amountOf(st.amount),
    note: st.note,
    effect:
      st.direction === "received" ? -amountOf(st.amount) : amountOf(st.amount),
  }));

  // Oldest first to build the running balance, then newest first to show.
  const ordered = [...bills, ...payments].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? a.id - b.id : a.kind === "split" ? -1 : 1),
  );
  let running = 0;
  const activity = ordered
    .map((a) => {
      running += a.effect;
      return { ...a, balanceAfter: Math.round(running) };
    })
    .reverse();

  const b = balanceInRupees(balances.get(personId));
  return {
    activity,
    truncated:
      splitRows.length >= PERSON_SHARE_ROW_LIMIT ||
      settlementRows.length >= PERSON_SHARE_ROW_LIMIT,
    groups: [
      ...new Map(
        bills.flatMap((x) => (x.group ? [[x.group.id, x.group]] : [])),
      ).values(),
    ],
    totals: {
      bills: bills.length,
      /** What the bills cost the viewer in all. */
      yourShare: bills.reduce((n, x) => n + x.yourShare, 0),
      /** From bills: what they owe the owner / the owner owes them. */
      youOwe: b.owedToMe,
      owedToYou: b.iOwe,
      /** Money that changed hands. */
      youPaid: b.received,
      youReceived: b.paid,
      /** > 0 = the viewer owes the owner. */
      net: b.net,
    },
  };
}

export function recordPersonShareView(share: SelectPersonShare) {
  db.update(P)
    .set({
      viewCount: sql`${P.viewCount} + 1`,
      lastViewedAt: new Date(),
      updatedAt: share.updatedAt,
    })
    .where(eq(P.id, share.id))
    .catch(console.error);
}

/* ---------- "I've paid you back" ---------- */

export const MAX_PENDING_SETTLEMENT_CLAIMS = 10;

export const serializeSettlementClaim = (c: SelectSettlementClaim) => ({
  id: c.id,
  personId: c.personId,
  amount: c.amount,
  reference: c.reference,
  note: c.note,
  status: c.status,
  createdAt: c.createdAt,
});

export async function pendingClaimsOfPersonShare(shareId: number) {
  const C = settlementClaimsTable;
  return db
    .select({ id: C.id, amount: C.amount, createdAt: C.createdAt })
    .from(C)
    .where(and(eq(C.shareId, shareId), eq(C.status, "pending")))
    .orderBy(desc(C.id));
}
