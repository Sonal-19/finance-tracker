import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "$/db";
import { peopleTable, splitSharesTable, splitsTable } from "$/db/schema";
import { formatAmount } from "$/lib/utils/money";
import { dateText } from "./recurring-share-service";
import { deliver } from "./reminder-service";

/** A split as its tagged users see it: their share each, by user id. */
export type SplitSnapshot = {
  id: number;
  description: string;
  date: string;
  total: number;
  shares: Map<number, number>;
};

type Owner = { name: string; username?: string | null };

const URL = "/split?tab=shared";

/** Reads what tagged users currently see of a split (null = gone). */
export async function splitSnapshot(
  ownerId: number,
  splitId: number,
): Promise<SplitSnapshot | null> {
  const [split] = await db
    .select({
      id: splitsTable.id,
      description: splitsTable.description,
      date: splitsTable.date,
      total: splitsTable.total,
    })
    .from(splitsTable)
    .where(and(eq(splitsTable.id, splitId), eq(splitsTable.userId, ownerId)))
    .limit(1);
  if (!split) return null;
  const rows = await db
    .select({
      userId: peopleTable.linkedUserId,
      amount: splitSharesTable.amount,
    })
    .from(splitSharesTable)
    .innerJoin(peopleTable, eq(peopleTable.id, splitSharesTable.personId))
    .where(
      and(
        eq(splitSharesTable.splitId, splitId),
        isNotNull(peopleTable.linkedUserId),
      ),
    );
  return {
    ...split,
    shares: new Map(rows.map((r) => [r.userId!, r.amount])),
  };
}

const send = (userId: number, splitId: number, title: string, body: string) =>
  deliver({
    userId,
    kind: "shared",
    url: URL,
    dedupeKey: `split:${splitId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    title,
    body,
  }).catch((err) => console.error("[SplitNotify] failed", err));

/**
 * Tells every tagged user what the owner's change to a split meant for
 * them: added to it, removed from it, deleted, or exactly what changed
 * (their share, the total, the date, the name).
 */
export async function notifySplitChange(
  owner: Owner,
  before: SplitSnapshot | null,
  after: SplitSnapshot | null,
) {
  const who = owner.username
    ? `${owner.name} (@${owner.username})`
    : owner.name;
  const users = new Set([
    ...(before?.shares.keys() ?? []),
    ...(after?.shares.keys() ?? []),
  ]);
  const jobs: Promise<unknown>[] = [];
  for (const userId of users) {
    const was = before?.shares.get(userId);
    const now = after?.shares.get(userId);
    if (before && was !== undefined && !after) {
      jobs.push(
        send(
          userId,
          before.id,
          `${who} deleted "${before.description}"`,
          `Your share of ${formatAmount(was)} from ${dateText(before.date)} is no longer shared with you (and is gone from your expenses if you'd added it).`,
        ),
      );
    } else if (after && now !== undefined && was === undefined) {
      jobs.push(
        send(
          userId,
          after.id,
          before
            ? `${who} added you to "${after.description}"`
            : `${who} split "${after.description}" with you`,
          `Your share ${formatAmount(now)} of ${formatAmount(after.total)} · ${dateText(after.date)}.`,
        ),
      );
    } else if (before && after && was !== undefined && now === undefined) {
      jobs.push(
        send(
          userId,
          after.id,
          `${who} removed you from "${before.description}"`,
          `Your share of ${formatAmount(was)} is no longer on it.`,
        ),
      );
    } else if (before && after && was !== undefined && now !== undefined) {
      const lines: string[] = [];
      if (now !== was)
        lines.push(`Your share ${formatAmount(was)} → ${formatAmount(now)}`);
      if (after.total !== before.total)
        lines.push(
          `Total ${formatAmount(before.total)} → ${formatAmount(after.total)}`,
        );
      if (after.date !== before.date)
        lines.push(`Date ${dateText(before.date)} → ${dateText(after.date)}`);
      if (after.description !== before.description)
        lines.push(`Renamed to "${after.description}"`);
      if (lines.length)
        jobs.push(
          send(
            userId,
            after.id,
            `${who} changed "${before.description}"`,
            `${lines.join(". ")}.`,
          ),
        );
    }
  }
  await Promise.all(jobs);
}

/** One note when an existing person is tagged and past splits reach them. */
export function notifyTagged(owner: Owner, userId: number, splits: number) {
  const who = owner.username
    ? `${owner.name} (@${owner.username})`
    : owner.name;
  return send(
    userId,
    0,
    `${who} tagged you`,
    splits
      ? `${splits} shared ${splits === 1 ? "expense is" : "expenses are"} now in Split & share → Shared with me.`
      : "Expenses they split with you will show in Split & share → Shared with me.",
  );
}
