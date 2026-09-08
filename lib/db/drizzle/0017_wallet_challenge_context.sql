ALTER TABLE "wallet_verification_challenges"
  ADD COLUMN IF NOT EXISTS "chain_id" integer DEFAULT 56 NOT NULL;
--> statement-breakpoint
ALTER TABLE "wallet_verification_challenges"
  ADD COLUMN IF NOT EXISTS "domain" text DEFAULT 'anothermeai.app' NOT NULL;
--> statement-breakpoint
ALTER TABLE "wallet_verification_challenges"
  ADD COLUMN IF NOT EXISTS "uri" text DEFAULT 'https://anothermeai.app' NOT NULL;
