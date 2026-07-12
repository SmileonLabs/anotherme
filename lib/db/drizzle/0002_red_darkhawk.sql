ALTER TABLE "messages" ADD COLUMN "client_message_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_room_id_sender_id_client_message_id_unique_idx" ON "messages" USING btree ("room_id","sender_id","client_message_id") WHERE "messages"."client_message_id" IS NOT NULL;--> statement-breakpoint
WITH ranked_blocks AS (
	SELECT id, row_number() OVER (
		PARTITION BY blocker_user_id, blocked_user_id
		ORDER BY created_at ASC, id ASC
	) AS row_number
	FROM blocked_users
)
DELETE FROM blocked_users AS blocked
USING ranked_blocks
WHERE blocked.id = ranked_blocks.id
	AND ranked_blocks.row_number > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_users_blocker_user_id_blocked_user_id_unique_idx" ON "blocked_users" USING btree ("blocker_user_id","blocked_user_id");--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_user_id_blocker_user_id_idx" ON "blocked_users" USING btree ("blocked_user_id","blocker_user_id");--> statement-breakpoint
CREATE INDEX "calls_caller_status_created_at_idx" ON "calls" USING btree ("caller_id","status","created_at");
