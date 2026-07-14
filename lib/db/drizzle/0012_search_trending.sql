CREATE TABLE IF NOT EXISTS "search_query_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "normalized_term" text NOT NULL,
  "term_hash" text NOT NULL,
  "user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "result_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_query_logs_term_created_at_idx" ON "search_query_logs" USING btree ("normalized_term", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_query_logs_created_at_idx" ON "search_query_logs" USING btree ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_trending_blocks" (
  "normalized_term" text PRIMARY KEY,
  "reason" text NOT NULL DEFAULT 'manual',
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
