UPDATE "star_feed_reactions" r
SET "profile_id" = COALESCE(
  (SELECT acp."active_profile_id" FROM "active_character_profiles" acp WHERE acp."user_id" = r."user_id"),
  (SELECT cp."id" FROM "character_profiles" cp WHERE cp."owner_user_id" = r."user_id" AND cp."type" = 'fan' ORDER BY cp."created_at" LIMIT 1)
)
WHERE r."profile_id" IS NULL;

DELETE FROM "star_feed_reactions" WHERE "profile_id" IS NULL;
DROP INDEX IF EXISTS "star_feed_reactions_post_user_idx";
ALTER TABLE "star_feed_reactions" ALTER COLUMN "profile_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "star_feed_reactions_post_profile_idx"
  ON "star_feed_reactions" ("post_id", "profile_id");
