CREATE TABLE IF NOT EXISTS "character_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "handle" text NOT NULL,
  "display_name" text NOT NULL,
  "profile_image_url" text,
  "status_message" text,
  "status" text DEFAULT 'active' NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "xp" integer DEFAULT 0 NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "character_profiles_type_check" CHECK ("type" IN ('fan', 'star', 'official_ai')),
  CONSTRAINT "character_profiles_status_check" CHECK ("status" IN ('active', 'locked', 'torimia', 'archived')),
  CONSTRAINT "character_profiles_level_check" CHECK ("level" >= 1),
  CONSTRAINT "character_profiles_xp_check" CHECK ("xp" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "character_profiles_handle_idx" ON "character_profiles" ("handle");
CREATE INDEX IF NOT EXISTS "character_profiles_owner_type_idx" ON "character_profiles" ("owner_user_id", "type", "created_at");
CREATE INDEX IF NOT EXISTS "character_profiles_status_idx" ON "character_profiles" ("status", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fan_character_profiles" (
  "profile_id" uuid PRIMARY KEY REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "legacy_fan_user_id" uuid NOT NULL REFERENCES "fan_profiles"("user_id") ON DELETE CASCADE,
  "customization" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "fan_character_profiles_legacy_idx" ON "fan_character_profiles" ("legacy_fan_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "star_character_profiles" (
  "profile_id" uuid PRIMARY KEY REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "star_profile_id" uuid NOT NULL REFERENCES "star_profiles"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "star_character_profiles_star_idx" ON "star_character_profiles" ("star_profile_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "official_ai_character_profiles" (
  "profile_id" uuid PRIMARY KEY REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "official_ai_account_id" uuid NOT NULL REFERENCES "official_ai_accounts"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "official_ai_character_profiles_account_idx" ON "official_ai_character_profiles" ("official_ai_account_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "active_character_profiles" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "active_profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "last_fan_profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL,
  "last_star_profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "character_profile_follows" (
  "follower_profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "followed_profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("follower_profile_id", "followed_profile_id"),
  CONSTRAINT "character_profile_follows_distinct_check" CHECK ("follower_profile_id" <> "followed_profile_id")
);
CREATE INDEX IF NOT EXISTS "character_profile_follows_followed_idx" ON "character_profile_follows" ("followed_profile_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "character_growth_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_key" text NOT NULL,
  "event_type" text NOT NULL,
  "xp_delta" integer DEFAULT 0 NOT NULL,
  "stat_changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "before_level" integer NOT NULL,
  "after_level" integer NOT NULL,
  "before_xp" integer NOT NULL,
  "after_xp" integer NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_growth_events_source_idx" ON "character_growth_events" ("source_key");
CREATE INDEX IF NOT EXISTS "character_growth_events_profile_created_idx" ON "character_growth_events" ("profile_id", "created_at");
--> statement-breakpoint
INSERT INTO "character_profiles" (
  "owner_user_id", "type", "handle", "display_name", "profile_image_url", "status_message", "level", "xp", "stats"
)
SELECT u."id", 'fan', 'fan-' || replace(u."id"::text, '-', ''), u."nickname", u."profile_image_url", u."status_message",
       COALESCE(f."level", 1), COALESCE(f."xp", 0), COALESCE(f."stats", '{}'::jsonb)
FROM "users" u
LEFT JOIN "fan_profiles" f ON f."user_id" = u."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "character_profiles" cp WHERE cp."owner_user_id" = u."id" AND cp."type" = 'fan'
);
--> statement-breakpoint
INSERT INTO "fan_character_profiles" ("profile_id", "legacy_fan_user_id")
SELECT cp."id", cp."owner_user_id"
FROM "character_profiles" cp
JOIN "fan_profiles" f ON f."user_id" = cp."owner_user_id"
WHERE cp."type" = 'fan'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "character_profiles" (
  "id", "owner_user_id", "type", "handle", "display_name", "profile_image_url", "status", "level", "xp", "stats", "metadata", "created_at", "updated_at"
)
SELECT sp."id", sp."user_id", 'star', 'star-' || replace(sp."id"::text, '-', ''), sp."display_name", sp."image_url",
       CASE WHEN sp."ownership_status" = 'verified' THEN 'active' ELSE 'locked' END,
       sp."level", sp."xp", sp."stats",
       jsonb_build_object('category', sp."category", 'starKey', sp."star_key", 'collectionId', sp."collection_id"),
       sp."created_at", sp."updated_at"
FROM "star_profiles" sp
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "star_character_profiles" ("profile_id", "star_profile_id")
SELECT cp."id", sp."id"
FROM "star_profiles" sp
JOIN "character_profiles" cp ON cp."id" = sp."id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "character_profiles" (
  "id", "owner_user_id", "type", "handle", "display_name", "profile_image_url", "status_message", "status", "metadata", "created_at", "updated_at"
)
SELECT oa."id", oa."official_user_id", 'official_ai', 'official-' || oa."slug", oa."display_name", oa."profile_image_url", oa."description",
       CASE WHEN oa."status" = 'published' THEN 'active' WHEN oa."status" = 'archived' THEN 'archived' ELSE 'locked' END,
       jsonb_build_object('accountKind', oa."account_kind", 'ipProfileId', oa."ip_profile_id"),
       oa."created_at", oa."updated_at"
FROM "official_ai_accounts" oa
WHERE oa."official_user_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "official_ai_character_profiles" ("profile_id", "official_ai_account_id")
SELECT cp."id", oa."id"
FROM "official_ai_accounts" oa
JOIN "character_profiles" cp ON cp."id" = oa."id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "active_character_profiles" ("user_id", "active_profile_id", "last_fan_profile_id", "last_star_profile_id")
SELECT u."id",
       COALESCE(active_star."id", fan."id"),
       fan."id",
       active_star."id"
FROM "users" u
JOIN LATERAL (
  SELECT cp."id" FROM "character_profiles" cp
  WHERE cp."owner_user_id" = u."id" AND cp."type" = 'fan'
  ORDER BY cp."created_at" LIMIT 1
) fan ON true
LEFT JOIN "user_play_modes" pm ON pm."user_id" = u."id"
LEFT JOIN LATERAL (
  SELECT cp."id" FROM "character_profiles" cp
  JOIN "star_profiles" sp ON sp."id" = cp."id"
  WHERE cp."owner_user_id" = u."id" AND cp."type" = 'star' AND sp."equipped_at" IS NOT NULL
  ORDER BY sp."equipped_at" DESC LIMIT 1
) active_star ON COALESCE(pm."current_mode", 'fan') = 'star'
ON CONFLICT ("user_id") DO NOTHING;
