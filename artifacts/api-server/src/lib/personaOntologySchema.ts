import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensurePersonaOntologySchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:persona-ontology-v1'))`);
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS persona_profiles (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        archetype_key text NOT NULL DEFAULT 'forming',
        archetype_label text NOT NULL DEFAULT '형성 중인 자아',
        summary text,
        trait_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        communication_styles jsonb NOT NULL DEFAULT '[]'::jsonb,
        preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
        capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
        conflict_styles jsonb NOT NULL DEFAULT '[]'::jsonb,
        evidence_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
        source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
        source_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
        confidence integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'inferred',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE persona_profiles ADD COLUMN IF NOT EXISTS source_keys jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS persona_profiles_status_idx ON persona_profiles(status, updated_at)`);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:persona-ontology-v1'))`);
  }
}
