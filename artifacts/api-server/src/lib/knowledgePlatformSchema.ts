import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureKnowledgePlatformSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:knowledge-platform-v1'))`);
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        source_type text NOT NULL,
        title text NOT NULL,
        url text,
        body text,
        status text NOT NULL DEFAULT 'draft',
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        collected_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
        content text NOT NULL,
        checksum text,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_extraction_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        source_id uuid REFERENCES knowledge_sources(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'queued',
        error text,
        stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_review_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        source_id uuid REFERENCES knowledge_sources(id) ON DELETE SET NULL,
        job_id uuid REFERENCES knowledge_extraction_jobs(id) ON DELETE SET NULL,
        item_type text NOT NULL,
        graph_id text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_review_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        review_item_id uuid REFERENCES knowledge_review_items(id) ON DELETE CASCADE,
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action text NOT NULL,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_ai_memories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        memory_type text NOT NULL DEFAULT 'preference',
        text text NOT NULL,
        privacy_scope text NOT NULL DEFAULT 'user_private',
        status text NOT NULL DEFAULT 'approved',
        confidence integer NOT NULL DEFAULT 100,
        source text NOT NULL DEFAULT 'manual',
        graph_memory_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        trigger_type text NOT NULL DEFAULT 'manual',
        condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        message_template text NOT NULL,
        cooldown_hours integer NOT NULL DEFAULT 24,
        max_per_user integer NOT NULL DEFAULT 1,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_campaign_deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id uuid NOT NULL REFERENCES ai_campaigns(id) ON DELETE CASCADE,
        target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_id uuid REFERENCES chat_rooms(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'queued',
        error text,
        delivered_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_sources_tenant_status_idx ON knowledge_sources(tenant_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_sources_created_by_idx ON knowledge_sources(created_by_user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_documents_source_idx ON knowledge_documents(source_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_extraction_jobs_tenant_status_idx ON knowledge_extraction_jobs(tenant_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_review_items_tenant_status_idx ON knowledge_review_items(tenant_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_review_items_source_idx ON knowledge_review_items(source_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_review_items_item_type_status_idx ON knowledge_review_items(item_type, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS knowledge_review_events_item_idx ON knowledge_review_events(review_item_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS user_ai_memories_user_status_idx ON user_ai_memories(user_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_campaigns_tenant_status_idx ON ai_campaigns(tenant_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_campaign_deliveries_campaign_target_idx ON ai_campaign_deliveries(campaign_id, target_user_id)`);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:knowledge-platform-v1'))`);
  }
}
