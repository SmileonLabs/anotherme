ALTER TABLE "star_feed_posts"
  ADD COLUMN IF NOT EXISTS "author_profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "star_feed_posts_author_profile_id_idx" ON "star_feed_posts" ("author_profile_id");
--> statement-breakpoint
ALTER TABLE "star_feed_reactions"
  ADD COLUMN IF NOT EXISTS "profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL;
ALTER TABLE "star_feed_comments"
  ADD COLUMN IF NOT EXISTS "profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "sender_profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "messages_sender_profile_id_idx" ON "messages" ("sender_profile_id");
--> statement-breakpoint
UPDATE "star_feed_posts" p
SET "author_profile_id" = COALESCE(
  (SELECT cp."id" FROM "character_profiles" cp WHERE cp."id" = p."author_star_profile_id" AND cp."owner_user_id" = p."author_user_id"),
  (SELECT cp."id" FROM "character_profiles" cp WHERE cp."owner_user_id" = p."author_user_id" AND cp."type" = 'fan' ORDER BY cp."created_at" LIMIT 1)
)
WHERE p."author_profile_id" IS NULL AND p."author_user_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "messages" m
SET "sender_profile_id" = COALESCE(
  (SELECT acp."active_profile_id" FROM "active_character_profiles" acp WHERE acp."user_id" = m."sender_id"),
  (SELECT cp."id" FROM "character_profiles" cp WHERE cp."owner_user_id" = m."sender_id" AND cp."type" = 'fan' ORDER BY cp."created_at" LIMIT 1)
)
WHERE m."sender_profile_id" IS NULL;
