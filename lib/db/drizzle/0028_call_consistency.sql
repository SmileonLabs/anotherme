ALTER TABLE "calls" ADD COLUMN "attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "livekit_participant_count" integer;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "livekit_participant_deficit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "livekit_last_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "livekit_last_participant_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "livekit_reconciliation_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "call_message_repair_eligible_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "call_message_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "terminal_message_repair_eligible_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "terminal_message_finalized_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "calls_active_reconciliation_idx" ON "calls" USING btree ("livekit_last_observed_at", "livekit_reconciliation_claimed_at", "accepted_at") WHERE "calls"."status" = 'active';--> statement-breakpoint
CREATE INDEX "calls_call_message_pending_idx" ON "calls" USING btree ("call_message_repair_eligible_at") WHERE "calls"."call_message_repair_eligible_at" IS NOT NULL AND "calls"."chat_room_id" IS NOT NULL AND "calls"."call_message_created_at" IS NULL;--> statement-breakpoint
CREATE INDEX "calls_terminal_message_pending_idx" ON "calls" USING btree ("terminal_message_repair_eligible_at") WHERE "calls"."terminal_message_repair_eligible_at" IS NOT NULL AND "calls"."terminal_message_finalized_at" IS NULL AND "calls"."status" IN ('ended', 'declined', 'missed', 'cancelled', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX "calls_caller_attempt_unique_idx" ON "calls" USING btree ("caller_id", "attempt_id") WHERE "calls"."attempt_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "call_control_operations" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"call_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"attempt_id" uuid,
	"action" text NOT NULL,
	"result_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_control_operations_action_valid" CHECK ("call_control_operations"."action" IN ('end', 'cancel', 'decline', 'failed')),
	CONSTRAINT "call_control_operations_result_status_valid" CHECK ("call_control_operations"."result_status" IS NULL OR "call_control_operations"."result_status" IN ('ringing', 'active', 'ended', 'declined', 'missed', 'cancelled', 'failed'))
);--> statement-breakpoint
ALTER TABLE "call_control_operations" ADD CONSTRAINT "call_control_operations_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_control_operations" ADD CONSTRAINT "call_control_operations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_control_operations_call_created_idx" ON "call_control_operations" USING btree ("call_id", "created_at");--> statement-breakpoint
CREATE INDEX "call_control_operations_created_idx" ON "call_control_operations" USING btree ("created_at");
