ALTER TABLE "star_feed_posts" ADD COLUMN IF NOT EXISTS "repost_of_post_id" uuid REFERENCES "public"."star_feed_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_feed_posts_repost_of_post_id_idx" ON "star_feed_posts" USING btree ("repost_of_post_id");
