import type { TX } from "$/db";
import {
  peopleTable,
  settlementsTable,
  splitGroupMembersTable,
  splitGroupsTable,
  splitSharesTable,
  splitsTable,
} from "$/db/schema";
import {
  computeShares,
  type Participant,
  syncShareTransaction,
} from "$/lib/services/split-service";
import { toPaise } from "$/lib/utils/money";
import { addDays } from "$/lib/utils/period";

/** Demo people, a trip group, a few shared bills and one repayment. */
export async function seedSplits(
  tx: TX,
  userId: number,
  cat: (name: string) => number,
  end: string,
  /** Goa trip event: the group's bills are tagged to it. */
  goaEventId: number,
) {
  const people = await tx
    .insert(peopleTable)
    .values([
      {
        userId,
        name: "Rahul Sharma",
        phone: "9876543210",
        relation: "friend" as const,
      },
      { userId, name: "Aman Verma", relation: "friend" as const },
      { userId, name: "Priya Nair", relation: "office" as const },
      { userId, name: "Karan Mehta", relation: "family" as const },
    ])
    .returning();
  const [rahul, aman, priya, karan] = people.map((p) => p.id) as [
    number,
    number,
    number,
    number,
  ];

  const [goa] = await tx
    .insert(splitGroupsTable)
    .values({ userId, name: "Goa trip", icon: "plane", color: "#0ea5e9" })
    .returning();
  await tx
    .insert(splitGroupMembersTable)
    .values(
      [rahul, aman, karan].map((personId) => ({ groupId: goa!.id, personId })),
    );

  const bills: {
    description: string;
    total: number;
    date: string;
    groupId: number | null;
    paidBy: number | null;
    category: string;
    participants: Participant[];
  }[] = [
    {
      description: "Hotel room (2 nights)",
      total: 8000,
      date: addDays(end, -6),
      groupId: goa!.id,
      paidBy: null,
      category: "Room rent",
      participants: [
        { personId: null },
        { personId: rahul },
        { personId: aman },
        { personId: karan },
      ],
    },
    {
      description: "Seafood dinner",
      total: 2400,
      date: addDays(end, -5),
      groupId: goa!.id,
      paidBy: rahul,
      category: "Food & dining",
      participants: [
        { personId: null },
        { personId: rahul },
        { personId: aman },
        { personId: karan },
      ],
    },
    {
      description: "Scooter rental",
      total: 1500,
      date: addDays(end, -5),
      groupId: goa!.id,
      paidBy: null,
      category: "Travel",
      participants: [
        { personId: null },
        { personId: rahul },
        { personId: aman },
      ],
    },
    {
      description: "Office team lunch",
      total: 1200,
      date: addDays(end, -2),
      groupId: null,
      paidBy: null,
      category: "Food & dining",
      participants: [{ personId: null }, { personId: priya }],
    },
  ];

  for (const b of bills) {
    const result = computeShares(toPaise(b.total), "equal", b.participants);
    if (!result.ok) throw new Error(result.message);
    const [split] = await tx
      .insert(splitsTable)
      .values({
        userId,
        groupId: b.groupId,
        description: b.description,
        total: toPaise(b.total),
        date: b.date,
        paidByPersonId: b.paidBy,
        method: "equal",
        categoryId: cat(b.category),
        eventId: b.groupId ? goaEventId : null,
      })
      .returning();
    await tx
      .insert(splitSharesTable)
      .values(result.shares.map((s) => ({ ...s, splitId: split!.id })));
    const mine = result.shares.find((s) => s.personId === null)?.amount ?? 0;
    await syncShareTransaction(tx, split!, mine, "upi");
  }

  await tx.insert(settlementsTable).values({
    userId,
    personId: aman,
    groupId: goa!.id,
    direction: "received",
    amount: toPaise(1000),
    date: addDays(end, -1),
    paymentMethod: "upi",
    note: "GPay",
  });
}
