import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureChatFeaturesSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:chat-features-v1'))`);
  try {
    await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id uuid`);
    await db.execute(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
    await db.execute(sql`ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS pinned_message_id uuid`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_deletions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deleted_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS message_deletions_message_id_user_id_idx
      ON message_deletions (message_id, user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_deletions_user_id_idx
      ON message_deletions (user_id)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_stickers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS message_stickers_message_id_user_id_idx
      ON message_stickers (message_id, user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_stickers_message_id_idx
      ON message_stickers (message_id)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_link_previews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        url text NOT NULL,
        domain text,
        title text,
        description text,
        image_url text,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS message_link_previews_message_id_idx
      ON message_link_previews (message_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_link_previews_status_idx
      ON message_link_previews (status)
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:chat-features-v1'))`);
  }
}
