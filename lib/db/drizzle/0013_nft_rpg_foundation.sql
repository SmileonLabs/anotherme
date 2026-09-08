CREATE TABLE IF NOT EXISTS "nft_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chain_id" integer NOT NULL,
  "contract_address" text NOT NULL,
  "rpc_url" text,
  "name" text NOT NULL,
  "ip_name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'character',
  "official_url" text,
  "metadata_url" text,
  "rights_status" text NOT NULL DEFAULT 'review_required',
  "status" text NOT NULL DEFAULT 'draft',
  "world_style" text,
  "role_name" text,
  "rpg_blueprint" jsonb,
  "ai_analysis" jsonb,
  "ai_analyzed_at" timestamptz,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "nft_collections_chain_contract_idx" ON "nft_collections" ("chain_id", "contract_address");
ALTER TABLE "star_profiles" ADD COLUMN IF NOT EXISTS "collection_id" uuid;
ALTER TABLE "star_profiles" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'idol';
ALTER TABLE "star_profiles" ADD COLUMN IF NOT EXISTS "ownership_status" text NOT NULL DEFAULT 'verified';
ALTER TABLE "star_profiles" ADD COLUMN IF NOT EXISTS "current_evolution_stage" text NOT NULL DEFAULT 'base';
ALTER TABLE "star_profiles" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
CREATE TABLE IF NOT EXISTS "nft_evolution_stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "collection_id" uuid NOT NULL REFERENCES "nft_collections"("id") ON DELETE CASCADE,
  "stage_key" text NOT NULL,
  "min_level" integer NOT NULL DEFAULT 1,
  "max_level" integer,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "image_url" text,
  "retained_traits" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "nft_evolution_collection_stage_idx" ON "nft_evolution_stages" ("collection_id", "stage_key");
