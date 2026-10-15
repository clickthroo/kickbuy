import "server-only";
import postgres from "postgres";
import { env } from "./env";

// Both URLs point at Supabase's transaction pooler (Supavisor), which doesn't
// support prepared statements and can stall on pipelined queries. postgres.js
// pipelines up to 100 queries per connection by default once every
// connection is busy, which the dashboard's parallel queries trigger; so
// pipelining is switched off and queries queue for a free connection instead.
const options = { prepare: false, max: 5, max_pipeline: 1, idle_timeout: 20, connect_timeout: 10 } as const;

const globalForDb = globalThis as unknown as {
  kickioSql?: postgres.Sql;
  kickbuySql?: postgres.Sql;
};

// Read-only: the kickbuy_reader role can only SELECT from the `kickbuy` views
// in Kickio's database, and every transaction is read-only.
export function kickio(): postgres.Sql {
  return (globalForDb.kickioSql ??= postgres(env.kickioDatabaseUrl, options));
}

// KickBuy's own database (opportunities, scans, alerts, settings, users).
export function app(): postgres.Sql {
  return (globalForDb.kickbuySql ??= postgres(env.kickbuyDatabaseUrl, options));
}
