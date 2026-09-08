import { pool } from "@workspace/db";

async function connectPool() {
  return pool.connect();
}

type PoolClient = Awaited<ReturnType<typeof connectPool>>;

const DEFAULT_LARGE_RELATION_BYTES = 1024n * 1024n * 1024n;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

function approved(name: string): boolean {
  return process.env[name]?.trim() === "1";
}

function positiveBigIntEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    console.error(`${name} must be a positive integer byte count`);
    process.exit(2);
  }
  return BigInt(raw);
}

const largeRelationBytes = positiveBigIntEnv(
  "CALL_MIGRATION_LARGE_RELATION_BYTES",
  DEFAULT_LARGE_RELATION_BYTES,
);
const liveCallsApproved = approved("CALL_MIGRATION_ALLOW_LIVE_CALLS");
const largeRelationsApproved = approved("CALL_MIGRATION_ALLOW_LARGE_RELATIONS");

// pg exposes overloaded callback and Promise forms for connect(); ReturnType
// selects the callback overload (`void`) under some TypeScript versions.
let client: PoolClient | undefined;
let transactionOpen = false;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  transactionOpen = true;
  await client.query("SET LOCAL lock_timeout = '1s'");
  await client.query("SET LOCAL statement_timeout = '5s'");
  const calls = await client.query(`
    SELECT
      count(*)::bigint::text AS calls,
      count(*) FILTER (WHERE status = 'ringing')::bigint::text AS ringing,
      count(*) FILTER (WHERE status = 'active')::bigint::text AS active,
      count(*) FILTER (
        WHERE status IN ('ended', 'declined', 'missed', 'cancelled', 'failed')
      )::bigint::text AS terminal,
      pg_total_relation_size('calls')::bigint::text AS "relationBytes"
    FROM calls
  `);
  const messages = await client.query(`
    SELECT
      count(*) FILTER (WHERE call_id IS NOT NULL)::bigint::text AS "callMessages",
      pg_total_relation_size('messages')::bigint::text AS "relationBytes"
    FROM messages
  `);
  await client.query("ROLLBACK");
  transactionOpen = false;

  const callSummary = calls.rows[0] as {
    calls: string;
    ringing: string;
    active: string;
    terminal: string;
    relationBytes: string;
  };
  const messageSummary = messages.rows[0] as {
    callMessages: string;
    relationBytes: string;
  };
  const liveCallCount = BigInt(callSummary.ringing) + BigInt(callSummary.active);
  const oversizedRelations = [
    ["calls", BigInt(callSummary.relationBytes)] as const,
    ["messages", BigInt(messageSummary.relationBytes)] as const,
  ].filter(([, bytes]) => bytes >= largeRelationBytes);

  console.log(JSON.stringify({
    calls: callSummary,
    messages: messageSummary,
    policy: {
      largeRelationBytes: largeRelationBytes.toString(),
      liveCallsApproved,
      largeRelationsApproved,
    },
  }));

  const blocked: string[] = [];
  if (liveCallCount > 0n && !liveCallsApproved) {
    blocked.push("live_calls_require_CALL_MIGRATION_ALLOW_LIVE_CALLS=1");
  }
  if (oversizedRelations.length > 0 && !largeRelationsApproved) {
    blocked.push("large_relations_require_CALL_MIGRATION_ALLOW_LARGE_RELATIONS=1");
  }
  if (blocked.length > 0) {
    console.error(`migration_readiness_blocked:${blocked.join(",")}`);
    process.exitCode = 3;
  }
} catch (error) {
  const directCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : null;
  const nestedCode =
    error instanceof AggregateError &&
    error.errors[0] &&
    typeof error.errors[0] === "object" &&
    "code" in error.errors[0]
      ? String(error.errors[0].code)
      : null;
  // Never print the connection string, host or driver message from an
  // operational readiness probe.
  console.error(directCode ?? nestedCode ?? "query_failed");
  process.exitCode = 1;
} finally {
  if (transactionOpen) {
    await client?.query("ROLLBACK").catch(() => undefined);
  }
  client?.release();
  await pool.end().catch(() => undefined);
}
