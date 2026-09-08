CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "before_json" jsonb,
  "after_json" jsonb,
  "reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "admin_audit_logs_actor_created_idx" ON "admin_audit_logs" ("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_created_idx" ON "admin_audit_logs" ("target_type", "target_id", "created_at");
