CREATE TABLE "call_user_locks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"call_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "room_termination_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "room_terminated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "call_user_locks" ADD CONSTRAINT "call_user_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_user_locks" ADD CONSTRAINT "call_user_locks_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
WITH ranked_live_calls AS (
	SELECT
		c.id,
		row_number() OVER (
			PARTITION BY participant.user_id
			ORDER BY (c.status = 'active') DESC, c.created_at DESC, c.id DESC
		) AS position
	FROM "calls" c
	CROSS JOIN LATERAL (VALUES (c.caller_id), (c.callee_id)) AS participant(user_id)
	WHERE c.status IN ('ringing', 'active')
), conflicting_calls AS (
	SELECT DISTINCT id FROM ranked_live_calls WHERE position > 1
)
UPDATE "calls" c
SET "status" = 'failed',
	"ended_at" = COALESCE(c."ended_at", now()),
	"updated_at" = now()
FROM conflicting_calls conflicts
WHERE c.id = conflicts.id;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "calls"
		GROUP BY "room_name"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'cannot add calls_room_name_unique_idx: duplicate calls.room_name values require manual reconciliation';
	END IF;
END $$;--> statement-breakpoint
INSERT INTO "call_user_locks" ("user_id", "call_id")
SELECT "caller_id", "id" FROM "calls" WHERE "status" IN ('ringing', 'active')
UNION ALL
SELECT "callee_id", "id" FROM "calls" WHERE "status" IN ('ringing', 'active');--> statement-breakpoint
CREATE INDEX "call_user_locks_call_id_idx" ON "call_user_locks" USING btree ("call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_room_name_unique_idx" ON "calls" USING btree ("room_name");--> statement-breakpoint
CREATE INDEX "calls_callee_status_created_at_idx" ON "calls" USING btree ("callee_id","status","created_at");--> statement-breakpoint
CREATE INDEX "calls_status_created_at_idx" ON "calls" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "calls_room_termination_pending_idx" ON "calls" USING btree ("room_termination_attempted_at","ended_at") WHERE "calls"."room_terminated_at" IS NULL AND "calls"."status" IN ('ended', 'declined', 'missed', 'cancelled', 'failed');--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_media_valid" CHECK ("calls"."media" IN ('audio', 'video')) NOT VALID;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_status_valid" CHECK ("calls"."status" IN ('ringing', 'active', 'ended', 'declined', 'missed', 'cancelled', 'failed')) NOT VALID;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_distinct_participants" CHECK ("calls"."caller_id" <> "calls"."callee_id") NOT VALID;
