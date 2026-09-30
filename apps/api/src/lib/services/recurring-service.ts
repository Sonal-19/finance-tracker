import { and, eq, lte } from "drizzle-orm";
import { db } from "$/db";
import {
  type Frequency,
  recurringRulesTable,
  type SelectRecurringRule,
  transactionsTable,
} from "$/db/schema";
import { addDays, addMonths, today } from "$/lib/utils/period";

/** Next occurrence after `date`. Monthly/yearly keep the start date's day-of-month. */
export function nextOccurrence(
  freq: Frequency,
  date: string,
  startDate: string,
) {
  const anchorDay = Number(startDate.slice(8, 10));
  switch (freq) {
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addDays(date, 7);
    case "monthly":
      return addMonths(date, 1, anchorDay);
    case "yearly":
      return addMonths(date, 12, anchorDay);
  }
}

/** Posts every due occurrence of a rule up to today. Returns how many were posted. */
async function postDue(rule: SelectRecurringRule, upTo: string) {
  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .select()
      .from(recurringRulesTable)
      .where(eq(recurringRulesTable.id, rule.id))
      .for("update");
    if (!fresh?.isActive) return 0;

    let next = fresh.nextRunDate;
    let posted = 0;
    const values: (typeof transactionsTable.$inferInsert)[] = [];
    while (
      next <= upTo &&
      (!fresh.endDate || next <= fresh.endDate) &&
      posted < 400
    ) {
      values.push({
        userId: fresh.userId,
        type: fresh.type,
        amount: fresh.amount,
        categoryId: fresh.categoryId,
        accountId: fresh.accountId,
        paymentMethod: fresh.paymentMethod,
        note: fresh.note,
        date: next,
        recurringId: fresh.id,
      });
      next = nextOccurrence(fresh.frequency, next, fresh.startDate);
      posted++;
    }
    if (values.length) await tx.insert(transactionsTable).values(values);
    const finished = !!fresh.endDate && next > fresh.endDate;
    await tx
      .update(recurringRulesTable)
      .set({ nextRunDate: next, ...(finished && { isActive: false }) })
      .where(eq(recurringRulesTable.id, fresh.id));
    return posted;
  });
}

class RecurringService {
  #timer: ReturnType<typeof setInterval> | null = null;

  async runDue(userId?: number) {
    const now = today();
    const rules = await db
      .select()
      .from(recurringRulesTable)
      .where(
        and(
          eq(recurringRulesTable.isActive, true),
          lte(recurringRulesTable.nextRunDate, now),
          userId ? eq(recurringRulesTable.userId, userId) : undefined,
        ),
      );
    let total = 0;
    for (const rule of rules) {
      try {
        total += await postDue(rule, now);
      } catch (error) {
        console.error(`recurring rule ${rule.id} failed`, error);
      }
    }
    if (total) console.info(`[recurring] posted ${total} transaction(s)`);
    return total;
  }

  startSchedule() {
    if (this.#timer) return;
    this.runDue().catch(console.error);
    this.#timer = setInterval(
      () => this.runDue().catch(console.error),
      60 * 60 * 1000,
    );
    if (typeof this.#timer === "object" && "unref" in this.#timer)
      this.#timer.unref();
  }
}

export const recurringService = new RecurringService();
