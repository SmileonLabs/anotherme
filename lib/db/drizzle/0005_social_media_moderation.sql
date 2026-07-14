ALTER TABLE "star_feed_posts" ADD COLUMN IF NOT EXISTS "media" jsonb;--> statement-breakpoint
ALTER TABLE "star_feed_posts" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'PUBLISHED';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_feed_posts_status_created_at_idx" ON "star_feed_posts" USING btree ("status", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "star_feed_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "public"."star_feed_posts"("id") ON DELETE CASCADE,
  "reporter_user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "details" text,
  "status" text NOT NULL DEFAULT 'OPEN',
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "star_feed_reports_post_reporter_idx" ON "star_feed_reports" USING btree ("post_id", "reporter_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_feed_reports_status_created_at_idx" ON "star_feed_reports" USING btree ("status", "created_at");
