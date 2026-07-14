ALTER TABLE "star_feed_posts" ADD COLUMN IF NOT EXISTS "hashtags" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_feed_posts_hashtags_gin_idx" ON "star_feed_posts" USING gin ("hashtags");
