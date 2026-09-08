UPDATE "character_profiles" AS "profile"
SET
  "profile_image_url" = NULL,
  "updated_at" = NOW()
FROM "users" AS "account"
WHERE
  "profile"."owner_user_id" = "account"."id"
  AND "profile"."type" = 'fan'
  AND "profile"."profile_image_url" IS NOT NULL
  AND "profile"."profile_image_url" = "account"."profile_image_url";
