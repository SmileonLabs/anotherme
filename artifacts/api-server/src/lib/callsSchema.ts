import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureCallSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:calls-v1'))`);
  try {
    await db.execute(sql`ALTER TABLE calls ADD COLUMN IF NOT EXISTS media text NOT NULL DEFAULT 'audio'`);
    await db.execute(sql`
      UPDATE calls AS c
      SET media = 'video'
      FROM messages AS m
      WHERE m.type = 'call'
        AND m.content LIKE '%' || c.id::text || '%'
        AND m.content LIKE '%"media":"video"%'
        AND c.media <> 'video'
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:calls-v1'))`);
  }
}
