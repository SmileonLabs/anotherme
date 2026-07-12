import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureDialogueEngineSchema(): Promise<void> {
  // Hot snapshot for persona dialogue. This row is intentionally compact so the
  // reply worker can load state without scanning ontology/graph data every turn.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dialogue_states (
      room_id uuid NOT NULL,
      persona_user_id uuid NOT NULL,
      target_user_id uuid NOT NULL,
      relationship_phase text NOT NULL DEFAULT 'first_contact',
      allowed_casualness text NOT NULL DEFAULT 'none',
      user_style text NOT NULL DEFAULT 'unknown',
      current_topic text,
      last_dialogue_act text,
      last_boundary_at timestamptz,
      recent_ai_openers jsonb NOT NULL DEFAULT '[]'::jsonb,
      repeated_failure_count integer NOT NULL DEFAULT 0,
      snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (room_id, persona_user_id, target_user_id)
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dialogue_states_persona_target_idx
      ON dialogue_states (persona_user_id, target_user_id)
  `);

  // Append-only turn log used for quality analysis and regression debugging.
  // The hot path should read the compact dialogue_states snapshot, not this log.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dialogue_turns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL,
      persona_user_id uuid NOT NULL,
      target_user_id uuid NOT NULL,
      user_message_id uuid,
      user_text text NOT NULL,
      intent text NOT NULL,
      emotion text NOT NULL,
      respect_signal text NOT NULL,
      dialogue_act text NOT NULL,
      fact_lookup_needed boolean NOT NULL DEFAULT false,
      reply_messages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      human_likeness_score integer NOT NULL DEFAULT 0,
      repetition_score integer NOT NULL DEFAULT 0,
      metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dialogue_turns_room_created_idx
      ON dialogue_turns (room_id, created_at DESC)
  `);

  // Queue-compatible table for the first implementation. It keeps the API
  // non-blocking: controllers enqueue and return, workers claim with SKIP LOCKED.
  // This can later be replaced by BullMQ/RabbitMQ without changing the pipeline.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS another_me_reply_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL,
      persona_user_id uuid NOT NULL,
      target_user_id uuid NOT NULL,
      latest_message_id uuid NOT NULL,
      user_input text NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      attempts integer NOT NULL DEFAULT 0,
      error text,
      available_at timestamptz NOT NULL DEFAULT now(),
      locked_at timestamptz,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS another_me_reply_jobs_status_available_idx
      ON another_me_reply_jobs (status, available_at, created_at)
  `);
}
