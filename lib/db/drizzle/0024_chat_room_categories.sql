ALTER TABLE "chat_rooms"
  ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'private';

UPDATE "chat_rooms"
SET "category" = CASE
  WHEN "type" = 'battle' THEN 'talk_battle'
  WHEN "type" = 'dungeon' THEN 'growth_rpg'
  WHEN "type" = 'direct' THEN 'direct'
  ELSE COALESCE(NULLIF("category", ''), 'casual')
END;

CREATE INDEX IF NOT EXISTS "chat_rooms_type_category_updated_at_idx"
  ON "chat_rooms" ("type", "category", "updated_at");

-- Legacy rooms predate profile-scoped chat membership. Bind them to the
-- account's current character so chat avatars never fall back to account photos.
UPDATE "chat_room_members" AS member
SET "profile_id" = active_profile."active_profile_id"
FROM "active_character_profiles" AS active_profile
WHERE member."profile_id" IS NULL
  AND active_profile."user_id" = member."user_id";

-- Early FAN profile initialization copied the private member account photo.
-- Clear only exact copies so an independently selected character image remains.
UPDATE "character_profiles" AS profile
SET "profile_image_url" = NULL
FROM "users" AS account
WHERE profile."owner_user_id" = account."id"
  AND profile."type" = 'fan'
  AND profile."profile_image_url" IS NOT NULL
  AND profile."profile_image_url" = account."profile_image_url";
