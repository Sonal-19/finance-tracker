import { pgEnum } from "drizzle-orm/pg-core";

/** credit = money in (income), debit = money out (expense). */
export const txnTypes = ["credit", "debit"] as const;
export type TxnType = (typeof txnTypes)[number];
export const txnTypeEnum = pgEnum("txn_type", txnTypes);

export const frequencies = ["daily", "weekly", "monthly", "yearly"] as const;
export type Frequency = (typeof frequencies)[number];
export const frequencyEnum = pgEnum("frequency", frequencies);
