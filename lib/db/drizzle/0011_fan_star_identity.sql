ALTER TABLE "star_feed_posts" ADD COLUMN IF NOT EXISTS "target_star_profile_id" uuid REFERENCES "public"."star_profiles"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_feed_posts_target_star_profile_id_idx" ON "star_feed_posts" USING btree ("target_star_profile_id");
