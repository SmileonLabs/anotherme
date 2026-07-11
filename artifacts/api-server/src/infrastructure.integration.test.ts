import { afterAll, describe, expect, it } from "vitest";

const runInfrastructureTests = process.env.RUN_INFRA_INTEGRATION === "1";
const dependencies = runInfrastructureTests
  ? {
      ...(await import("@workspace/db")),
      ...(await import("./lib/redis")),
    }
  : null;

describe("migrated infrastructure", () => {
  if (!runInfrastructureTests) {
    it.skip("requires RUN_INFRA_INTEGRATION=1", () => {});
    return;
  }

  const { pool, closeRedisClients, redisReady } = dependencies!;

  afterAll(async () => {
    await closeRedisClients();
    await pool.end();
  });

  it("has the migrated core schema and Drizzle ledger", async () => {
    const [{ tableCount }] = (await pool.query<{ tableCount: number }>(`
      SELECT count(*)::int AS "tableCount"
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `)).rows;
    const [{ migrationCount }] = (await pool.query<{ migrationCount: number }>(`
      SELECT count(*)::int AS "migrationCount"
      FROM drizzle.__drizzle_migrations
    `)).rows;
    const [{ exists }] = (await pool.query<{ exists: string | null }>(`
      SELECT to_regclass('public.messages') AS "exists"
    `)).rows;

    expect(tableCount).toBeGreaterThanOrEqual(59);
    expect(migrationCount).toBeGreaterThan(0);
    expect(exists).toBe("messages");
  });

  it("can reach Redis through the production readiness client", async () => {
    await expect(redisReady()).resolves.toBe(true);
  });
});
