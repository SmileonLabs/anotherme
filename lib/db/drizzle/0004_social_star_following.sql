ALTER TABLE "star_feed_posts" ADD COLUMN IF NOT EXISTS "author_star_profile_id" uuid REFERENCES "public"."star_profiles"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_feed_posts_author_star_profile_id_idx" ON "star_feed_posts" USING btree ("author_star_profile_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "star_profile_follows" (
  "follower_user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "star_profile_id" uuid NOT NULL REFERENCES "public"."star_profiles"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "star_profile_follows_follower_profile_idx" ON "star_profile_follows" USING btree ("follower_user_id", "star_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_profile_follows_profile_created_at_idx" ON "star_profile_follows" USING btree ("star_profile_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_profile_follows_follower_created_at_idx" ON "star_profile_follows" USING btree ("follower_user_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "star_feed_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "star_profile_id" uuid REFERENCES "public"."star_profiles"("id") ON DELETE SET NULL,
  "post_id" uuid REFERENCES "public"."star_feed_posts"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_feed_activities_user_created_at_idx" ON "star_feed_activities" USING btree ("user_id", "created_at");
