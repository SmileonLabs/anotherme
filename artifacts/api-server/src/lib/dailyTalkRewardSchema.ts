import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureDailyTalkRewardSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:daily-talk-reward-v1'))`);
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS talk_analysis_enabled boolean NOT NULL DEFAULT true`);
    await db.execute(sql`ALTER TABLE star_feed_posts ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'PUBLIC'`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS daily_talk_rewards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reward_date date NOT NULL,
        status text NOT NULL DEFAULT 'PENDING',
        title text,
        mood text,
        keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
        diary text,
        summary text,
        scores_json jsonb,
        abuse_json jsonb,
        grade text,
        quality_score integer NOT NULL DEFAULT 0,
        spam_risk integer NOT NULL DEFAULT 0,
        pvt_amount integer NOT NULL DEFAULT 0,
        visibility text NOT NULL DEFAULT 'PRIVATE',
        feed_post_id uuid REFERENCES star_feed_posts(id) ON DELETE SET NULL,
        idempotency_key text NOT NULL,
        rewarded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pvt_wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pvt_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount integer NOT NULL,
        type text NOT NULL,
        source text NOT NULL,
        source_id text NOT NULL,
        description text,
        balance_after integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS daily_talk_rewards_user_date_idx
      ON daily_talk_rewards(user_id, reward_date)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS daily_talk_rewards_idempotency_key_idx
      ON daily_talk_rewards(idempotency_key)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS daily_talk_rewards_user_created_at_idx
      ON daily_talk_rewards(user_id, created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS daily_talk_rewards_feed_post_id_idx
      ON daily_talk_rewards(feed_post_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pvt_wallets_user_id_idx
      ON pvt_wallets(user_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pvt_transactions_source_unique_idx
      ON pvt_transactions(source, source_id, type)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS pvt_transactions_user_created_at_idx
      ON pvt_transactions(user_id, created_at)
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:daily-talk-reward-v1'))`);
  }
}
