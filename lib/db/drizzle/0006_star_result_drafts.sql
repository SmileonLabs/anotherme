CREATE TABLE IF NOT EXISTS "star_result_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "star_profile_id" uuid REFERENCES "public"."star_profiles"("id") ON DELETE SET NULL,
  "source_type" text NOT NULL,
  "source_key" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "metadata" jsonb,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "published_post_id" uuid REFERENCES "public"."star_feed_posts"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_result_drafts_user_status_created_at_idx" ON "star_result_drafts" USING btree ("user_id", "status", "created_at");
