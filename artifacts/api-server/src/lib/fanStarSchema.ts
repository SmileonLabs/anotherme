import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureFanStarSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:fan-star-v1'))`);
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fan_profiles (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        level integer NOT NULL DEFAULT 1,
        xp integer NOT NULL DEFAULT 0,
        stats jsonb NOT NULL DEFAULT '{"fanPower":0,"supportPower":0,"empathy":0,"story":0}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_play_modes (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        current_mode text NOT NULL DEFAULT 'fan',
        star_unlocked boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS star_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wallet_address text NOT NULL,
        chain_id integer NOT NULL,
        contract_address text NOT NULL,
        token_id text NOT NULL,
        star_key text NOT NULL,
        display_name text NOT NULL,
        image_url text,
        stage text NOT NULL DEFAULT 'aspiring',
        level integer NOT NULL DEFAULT 1,
        xp integer NOT NULL DEFAULT 0,
        stats jsonb NOT NULL DEFAULT '{"charm":0,"stagePresence":0,"bond":0,"lore":0}'::jsonb,
        equipped_at timestamptz,
        verified_at timestamptz,
        torimia_opened_at timestamptz,
        promoted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`ALTER TABLE star_profiles ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'aspiring'`);
    await db.execute(sql`ALTER TABLE star_profiles ADD COLUMN IF NOT EXISTS torimia_opened_at timestamptz`);
    await db.execute(sql`ALTER TABLE star_profiles ADD COLUMN IF NOT EXISTS promoted_at timestamptz`);
    await db.execute(sql`
      UPDATE star_profiles
      SET stage = 'aspiring'
      WHERE stage IS NULL OR stage NOT IN ('aspiring', 'promoted')
    `);

    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.life_quests') IS NOT NULL THEN
          ALTER TABLE life_quests
            ADD COLUMN IF NOT EXISTS star_profile_id uuid REFERENCES star_profiles(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS star_growth_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        star_profile_id uuid NOT NULL REFERENCES star_profiles(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_key text NOT NULL UNIQUE,
        event_type text NOT NULL,
        xp_delta integer NOT NULL DEFAULT 0,
        stat_changes jsonb,
        reason text,
        metadata jsonb,
        before_level integer NOT NULL DEFAULT 1,
        after_level integer NOT NULL DEFAULT 1,
        before_xp integer NOT NULL DEFAULT 0,
        after_xp integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS star_profiles_unique_nft_idx
      ON star_profiles(chain_id, contract_address, token_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_profiles_user_id_equipped_idx
      ON star_profiles(user_id, equipped_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_growth_events_star_created_at_idx
      ON star_growth_events(star_profile_id, created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_growth_events_user_created_at_idx
      ON star_growth_events(user_id, created_at)
    `);

    await db.execute(sql`
      UPDATE user_play_modes
      SET current_mode = 'fan'
      WHERE current_mode NOT IN ('fan', 'star')
         OR (current_mode = 'star' AND star_unlocked = false)
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:fan-star-v1'))`);
  }
}
