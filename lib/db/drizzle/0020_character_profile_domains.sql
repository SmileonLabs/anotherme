ALTER TABLE "character_profiles"
  ADD COLUMN IF NOT EXISTS "job_key" text,
  ADD COLUMN IF NOT EXISTS "job_stage" integer NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "fan_character_profiles_legacy_idx";
ALTER TABLE "fan_character_profiles"
  ALTER COLUMN "legacy_fan_user_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "generation" integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "fan_character_profiles_legacy_idx"
  ON "fan_character_profiles" ("legacy_fan_user_id");

CREATE TABLE IF NOT EXISTS "character_profile_quest_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "quest_key" text NOT NULL,
  "quest_type" text NOT NULL,
  "period_key" text NOT NULL,
  "progress" integer NOT NULL DEFAULT 0,
  "target" integer NOT NULL DEFAULT 1,
  "completed_at" timestamptz,
  "reward_claimed_at" timestamptz,
  "reward_xp" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_profile_quest_period_idx"
  ON "character_profile_quest_progress" ("profile_id", "quest_key", "period_key");
CREATE INDEX IF NOT EXISTS "character_profile_quest_type_idx"
  ON "character_profile_quest_progress" ("profile_id", "quest_type");

CREATE TABLE IF NOT EXISTS "character_profile_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "achievement_key" text NOT NULL,
  "unlocked_at" timestamptz NOT NULL DEFAULT now(),
  "reward_claimed_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_profile_achievement_idx"
  ON "character_profile_achievements" ("profile_id", "achievement_key");

CREATE TABLE IF NOT EXISTS "character_profile_inventory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "item_key" text NOT NULL,
  "item_type" text NOT NULL DEFAULT 'material',
  "quantity" integer NOT NULL DEFAULT 0 CHECK ("quantity" >= 0),
  "equipped" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_profile_inventory_item_idx"
  ON "character_profile_inventory" ("profile_id", "item_key");
CREATE INDEX IF NOT EXISTS "character_profile_inventory_profile_idx"
  ON "character_profile_inventory" ("profile_id", "updated_at");

CREATE TABLE IF NOT EXISTS "character_profile_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "actor_profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL,
  "type" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "character_profile_notifications_profile_idx"
  ON "character_profile_notifications" ("profile_id", "read_at", "created_at");
