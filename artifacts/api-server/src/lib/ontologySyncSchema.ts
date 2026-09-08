import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureOntologySyncSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:ontology-sync-v1'))`);
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ontology_sync_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_type text NOT NULL,
        source_id text NOT NULL,
        source_key text NOT NULL,
        payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        last_error text,
        available_at timestamptz NOT NULL DEFAULT now(),
        locked_at timestamptz,
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ontology_sync_jobs_source_key_idx ON ontology_sync_jobs(source_key)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ontology_sync_jobs_status_available_idx ON ontology_sync_jobs(status, available_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ontology_sync_jobs_user_created_idx ON ontology_sync_jobs(user_id, created_at)`);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:ontology-sync-v1'))`);
  }
}
