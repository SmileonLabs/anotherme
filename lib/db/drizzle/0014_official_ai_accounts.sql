CREATE TABLE IF NOT EXISTS "official_ai_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "account_kind" text DEFAULT 'ip_character' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "description" text,
  "profile_image_url" text,
  "official_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_profile_id" text,
  "knowledge_tenant_id" text,
  "persona_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "channel_config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "safety_policy_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "official_ai_accounts_status_idx" ON "official_ai_accounts" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "official_ai_accounts_ip_idx" ON "official_ai_accounts" ("ip_profile_id");
CREATE INDEX IF NOT EXISTS "official_ai_accounts_user_idx" ON "official_ai_accounts" ("official_user_id");
INSERT INTO "users" ("id", "clerk_id", "email", "nickname", "profile_image_url", "status_message")
VALUES (
  '00000000-0000-4000-8000-00000000b1b1',
  'official:bibi',
  'bibi.official@anotherme.local',
  'BIBI Official',
  NULL,
  'BIBI Official 준비 계정입니다. 응답에는 AI 라벨이 표시돼요.'
)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "official_ai_accounts" ("slug", "display_name", "account_kind", "status", "description", "knowledge_tenant_id", "official_user_id")
VALUES ('bibi', '비비', 'ip_character', 'published', 'AnotherMe 공식 AI 캐릭터 계정', 'bibi', '00000000-0000-4000-8000-00000000b1b1')
ON CONFLICT ("slug") DO NOTHING;
