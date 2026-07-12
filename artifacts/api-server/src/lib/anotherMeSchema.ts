import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureAnotherMeSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:summon-v1'))`);
  try {
    await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_kind text NOT NULL DEFAULT 'user'`);
    await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS another_me_session_id uuid`);
    await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata jsonb`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS messages_room_author_kind_idx ON messages (room_id, author_kind)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS another_me_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        summon_enabled boolean NOT NULL DEFAULT false,
        default_wait_minutes integer NOT NULL DEFAULT 5,
        allow_friends boolean NOT NULL DEFAULT true,
        allow_family boolean NOT NULL DEFAULT true,
        allow_work boolean NOT NULL DEFAULT false,
        allow_unknown boolean NOT NULL DEFAULT false,
        auto_reply_enabled boolean NOT NULL DEFAULT true,
        sensitive_reply_blocked boolean NOT NULL DEFAULT true,
        tone_sync_enabled boolean NOT NULL DEFAULT true,
        default_tone_sync_level text NOT NULL DEFAULT 'MEDIUM',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS another_me_settings_user_id_idx ON another_me_settings (user_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS another_me_room_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        summon_enabled boolean,
        wait_minutes integer,
        tone_sync_level text,
        relationship_type text NOT NULL DEFAULT 'UNKNOWN',
        auto_reply_level text NOT NULL DEFAULT 'standard',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS another_me_room_settings_user_room_idx ON another_me_room_settings (user_id, room_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS another_me_room_settings_room_idx ON another_me_room_settings (room_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS another_me_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        summoned_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'ACTIVE',
        summoned_at timestamptz NOT NULL DEFAULT now(),
        dismissed_at timestamptz,
        dismissed_by_user_id uuid REFERENCES users(id),
        last_activity_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS another_me_sessions_room_status_idx ON another_me_sessions (room_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS another_me_sessions_owner_status_idx ON another_me_sessions (owner_user_id, status)`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS another_me_sessions_active_owner_room_idx
      ON another_me_sessions (owner_user_id, room_id)
      WHERE status = 'ACTIVE'
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS another_me_tone_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        relationship_type text NOT NULL,
        tone_summary text,
        honorific_style text NOT NULL DEFAULT 'MIXED',
        average_message_length integer NOT NULL DEFAULT 0,
        emoji_usage_level integer NOT NULL DEFAULT 0,
        laughter_usage_level integer NOT NULL DEFAULT 0,
        formality_level integer NOT NULL DEFAULT 50,
        warmth_level integer NOT NULL DEFAULT 50,
        humor_level integer NOT NULL DEFAULT 50,
        common_phrases_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        forbidden_phrases_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS another_me_tone_profiles_user_relationship_idx ON another_me_tone_profiles (user_id, relationship_type)`);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:summon-v1'))`);
  }
}
