CREATE TABLE IF NOT EXISTS "avatar_catalog_items" (
  "item_key" text PRIMARY KEY NOT NULL,
  "avatar_type" text NOT NULL,
  "collection_key" text,
  "gender" text,
  "slot" text NOT NULL,
  "class_stage" integer DEFAULT 0 NOT NULL,
  "job_key" text,
  "display_name" text NOT NULL,
  "asset_path" text NOT NULL,
  "layer_order" integer DEFAULT 0 NOT NULL,
  "price_star_point" integer DEFAULT 0 NOT NULL,
  "purchasable" boolean DEFAULT false NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'published' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "avatar_catalog_avatar_type_check" CHECK ("avatar_type" IN ('fan', 'star')),
  CONSTRAINT "avatar_catalog_gender_check" CHECK ("gender" IS NULL OR "gender" IN ('man', 'woman')),
  CONSTRAINT "avatar_catalog_slot_check" CHECK ("slot" IN ('background', 'base', 'head', 'wear', 'effect', 'full_skin', 'star_form')),
  CONSTRAINT "avatar_catalog_class_stage_check" CHECK ("class_stage" >= 0 AND "class_stage" <= 3),
  CONSTRAINT "avatar_catalog_price_check" CHECK ("price_star_point" >= 0)
);
CREATE INDEX IF NOT EXISTS "avatar_catalog_type_slot_idx" ON "avatar_catalog_items" ("avatar_type", "slot", "status");
CREATE INDEX IF NOT EXISTS "avatar_catalog_collection_stage_idx" ON "avatar_catalog_items" ("collection_key", "class_stage");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "character_avatar_loadouts" (
  "profile_id" uuid PRIMARY KEY NOT NULL REFERENCES "character_profiles"("id") ON DELETE CASCADE,
  "background_key" text,
  "base_key" text,
  "head_key" text,
  "wear_key" text,
  "effect_key" text,
  "full_skin_key" text,
  "star_form_key" text,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "character_avatar_loadouts_updated_idx" ON "character_avatar_loadouts" ("updated_at");
--> statement-breakpoint
WITH fan_defaults AS (
  SELECT
    f."profile_id",
    CASE
      WHEN lower(COALESCE(f."customization"->>'gender', '')) = 'man'
        OR COALESCE(f."customization"->>'genderExpression', '') LIKE '%남%'
      THEN 'man' ELSE 'woman'
    END AS gender,
    f."customization"
  FROM "fan_character_profiles" f
  JOIN "character_profiles" cp ON cp."id" = f."profile_id" AND cp."type" = 'fan'
), resolved AS (
  SELECT
    "profile_id",
    gender,
    CASE WHEN "customization"->>'baseKey' LIKE 'fan.base.' || gender || '.%' THEN "customization"->>'baseKey' ELSE 'fan.base.' || gender || '.001' END AS base_key,
    CASE
      WHEN "customization"->>'headKey' LIKE 'fan.head.' || gender || '.%' THEN "customization"->>'headKey'
      WHEN "customization"->>'hairStyle' = '웨이브' THEN 'fan.head.' || gender || '.002'
      WHEN "customization"->>'hairStyle' = '숏' THEN 'fan.head.' || gender || '.003'
      WHEN "customization"->>'hairStyle' = '내추럴' THEN 'fan.head.' || gender || '.004'
      ELSE 'fan.head.' || gender || '.001'
    END AS head_key,
    CASE WHEN "customization"->>'wearKey' LIKE 'fan.wear.' || gender || '.%' THEN "customization"->>'wearKey' ELSE 'fan.wear.' || gender || '.001' END AS wear_key
  FROM fan_defaults
)
INSERT INTO "character_avatar_loadouts" ("profile_id", "background_key", "base_key", "head_key", "wear_key")
SELECT "profile_id", 'fan.background.001', base_key, head_key, wear_key FROM resolved
ON CONFLICT ("profile_id") DO NOTHING;
--> statement-breakpoint
UPDATE "character_profiles" cp
SET "profile_image_url" = 'anotherme-avatar:v1:fan:' || concat_ws(',', l."background_key", l."base_key", l."head_key", l."wear_key"),
    "updated_at" = NOW()
FROM "character_avatar_loadouts" l
WHERE cp."id" = l."profile_id" AND cp."type" = 'fan';
--> statement-breakpoint
INSERT INTO "character_profile_inventory" ("profile_id", "item_key", "item_type", "quantity", "equipped")
SELECT l."profile_id", keys."item_key", 'avatar', 1, true
FROM "character_avatar_loadouts" l
CROSS JOIN LATERAL unnest(ARRAY[l."base_key", l."head_key", l."wear_key"]) AS keys("item_key")
JOIN "character_profiles" cp ON cp."id" = l."profile_id" AND cp."type" = 'fan'
WHERE keys."item_key" IS NOT NULL
ON CONFLICT ("profile_id", "item_key") DO UPDATE SET "quantity" = 1, "equipped" = true, "updated_at" = NOW();
