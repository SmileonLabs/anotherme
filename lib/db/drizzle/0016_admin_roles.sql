CREATE TABLE IF NOT EXISTS "admin_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "granted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "admin_roles_user_role_idx" UNIQUE ("user_id", "role")
);
CREATE INDEX IF NOT EXISTS "admin_roles_user_idx" ON "admin_roles" ("user_id");
