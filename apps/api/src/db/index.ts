import { type BunSQLQueryResultHKT, drizzle } from "drizzle-orm/bun-sql";
import type { PgAsyncTransaction } from "drizzle-orm/pg-core";
import { DATABASE_URL, DB_POOL_MAX } from "$/env";

// One pool for the process. Bun.SQL sends every parameterised query as a
// named prepared statement and reuses it per connection, so Postgres parses
// and plans each query shape once.
export const db = drizzle({
  connection: {
    url: DATABASE_URL,
    max: DB_POOL_MAX,
    // Give idle connections back to Postgres after 5 minutes.
    idleTimeout: 300,
    prepare: true,
  },
  logger: false,
});

export type DB = typeof db;
// biome-ignore lint/suspicious/noExplicitAny: relations are not used, manual joins only
export type TX = PgAsyncTransaction<BunSQLQueryResultHKT, any>;
