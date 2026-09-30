import { type BunSQLQueryResultHKT, drizzle } from "drizzle-orm/bun-sql";
import type { PgAsyncTransaction } from "drizzle-orm/pg-core";
import { DATABASE_URL } from "$/env";

export const db = drizzle(DATABASE_URL, { logger: false });

export type DB = typeof db;
// biome-ignore lint/suspicious/noExplicitAny: relations are not used, manual joins only
export type TX = PgAsyncTransaction<BunSQLQueryResultHKT, any>;
