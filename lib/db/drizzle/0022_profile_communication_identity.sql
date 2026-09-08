ALTER TABLE "chat_room_members"
  ADD COLUMN IF NOT EXISTS "profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "chat_room_members_profile_id_idx" ON "chat_room_members" ("profile_id");

UPDATE "chat_room_members" m
SET "profile_id" = COALESCE(
  (SELECT acp."active_profile_id" FROM "active_character_profiles" acp WHERE acp."user_id" = m."user_id"),
  (SELECT cp."id" FROM "character_profiles" cp WHERE cp."owner_user_id" = m."user_id" ORDER BY cp."created_at" LIMIT 1)
)
WHERE m."profile_id" IS NULL;

ALTER TABLE "calls"
  ADD COLUMN IF NOT EXISTS "caller_profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "callee_profile_id" uuid REFERENCES "character_profiles"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "calls_caller_profile_created_at_idx" ON "calls" ("caller_profile_id", "created_at");
CREATE INDEX IF NOT EXISTS "calls_callee_profile_created_at_idx" ON "calls" ("callee_profile_id", "created_at");

UPDATE "calls" c
SET "caller_profile_id" = COALESCE(
      (SELECT acp."active_profile_id" FROM "active_character_profiles" acp WHERE acp."user_id" = c."caller_id"),
      (SELECT cp."id" FROM "character_profiles" cp WHERE cp."owner_user_id" = c."caller_id" ORDER BY cp."created_at" LIMIT 1)
    ),
    "callee_profile_id" = COALESCE(
      (SELECT acp."active_profile_id" FROM "active_character_profiles" acp WHERE acp."user_id" = c."callee_id"),
      (SELECT cp."id" FROM "character_profiles" cp WHERE cp."owner_user_id" = c."callee_id" ORDER BY cp."created_at" LIMIT 1)
    )
WHERE c."caller_profile_id" IS NULL OR c."callee_profile_id" IS NULL;
