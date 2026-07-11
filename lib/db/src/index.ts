import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawConnectionTimeout = Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? "3000");
const connectionTimeoutMillis =
  Number.isFinite(rawConnectionTimeout) && rawConnectionTimeout > 0 ? rawConnectionTimeout : 3000;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis });
export const db = drizzle(pool, { schema });

export * from "./schema";
