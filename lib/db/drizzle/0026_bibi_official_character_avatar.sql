UPDATE "users"
SET
  "profile_image_url" = NULL,
  "updated_at" = NOW()
WHERE "id" = '00000000-0000-4000-8000-00000000b1b1';
--> statement-breakpoint
UPDATE "official_ai_accounts"
SET
  "official_user_id" = '00000000-0000-4000-8000-00000000b1b1',
  "profile_image_url" = 'https://anothermeai.app/images/bibi-character-profile-v2.png',
  "updated_at" = NOW()
WHERE "slug" = 'bibi';
--> statement-breakpoint
INSERT INTO "character_profiles" (
  "id",
  "owner_user_id",
  "type",
  "handle",
  "display_name",
  "profile_image_url",
  "status_message",
  "status",
  "metadata",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  '00000000-0000-4000-8000-00000000b1b1',
  'official_ai',
  'official-' || "slug",
  "display_name",
  "profile_image_url",
  "description",
  CASE
    WHEN "status" = 'published' THEN 'active'
    WHEN "status" = 'archived' THEN 'archived'
    ELSE 'locked'
  END,
  jsonb_build_object('accountKind', "account_kind", 'ipProfileId', "ip_profile_id"),
  "created_at",
  NOW()
FROM "official_ai_accounts"
WHERE "slug" = 'bibi'
ON CONFLICT ("id") DO UPDATE SET
  "owner_user_id" = EXCLUDED."owner_user_id",
  "type" = EXCLUDED."type",
  "handle" = EXCLUDED."handle",
  "display_name" = EXCLUDED."display_name",
  "profile_image_url" = EXCLUDED."profile_image_url",
  "status_message" = EXCLUDED."status_message",
  "status" = EXCLUDED."status",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = NOW();
--> statement-breakpoint
INSERT INTO "official_ai_character_profiles" ("profile_id", "official_ai_account_id")
SELECT "id", "id"
FROM "official_ai_accounts"
WHERE "slug" = 'bibi'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "active_character_profiles" (
  "user_id",
  "active_profile_id",
  "last_star_profile_id",
  "updated_at"
)
SELECT
  '00000000-0000-4000-8000-00000000b1b1',
  "id",
  "id",
  NOW()
FROM "official_ai_accounts"
WHERE "slug" = 'bibi'
ON CONFLICT ("user_id") DO UPDATE SET
  "active_profile_id" = EXCLUDED."active_profile_id",
  "last_star_profile_id" = EXCLUDED."last_star_profile_id",
  "updated_at" = NOW();
