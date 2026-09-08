ALTER TABLE "messages" ADD COLUMN "call_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_call_id_unique_idx" ON "messages" USING btree ("call_id") WHERE "messages"."call_id" IS NOT NULL;--> statement-breakpoint
WITH call_cards AS (
	SELECT
		m.id AS message_id,
		c.id AS call_id,
		row_number() OVER (PARTITION BY c.id ORDER BY m.created_at DESC, m.id DESC) AS position
	FROM messages AS m
	JOIN calls AS c
		ON c.id::text = substring(m.content FROM '"callId":"([0-9a-fA-F-]{36})"')
	WHERE m.type = 'call'
)
UPDATE messages AS m
SET call_id = call_cards.call_id
FROM call_cards
WHERE m.id = call_cards.message_id
	AND call_cards.position = 1;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action NOT VALID;
