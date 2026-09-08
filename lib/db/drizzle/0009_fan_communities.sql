CREATE TABLE IF NOT EXISTS "fan_communities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "star_profile_id" uuid NOT NULL REFERENCES "public"."star_profiles"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_communities_star_profile_idx" ON "fan_communities" USING btree ("star_profile_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fan_community_members" (
  "community_id" uuid NOT NULL REFERENCES "public"."fan_communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'MEMBER',
  "joined_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fan_community_members_unique_idx" ON "fan_community_members" USING btree ("community_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_community_members_user_idx" ON "fan_community_members" USING btree ("user_id");
