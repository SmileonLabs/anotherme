import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureStarFeedSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:star-feed-v1'))`);
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS star_feed_posts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        kind text NOT NULL DEFAULT 'fan',
        source_key text UNIQUE,
        title text NOT NULL,
        body text NOT NULL,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS star_feed_reactions (
        post_id uuid NOT NULL REFERENCES star_feed_posts(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reaction_type text NOT NULL DEFAULT 'cheer',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS star_feed_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id uuid NOT NULL REFERENCES star_feed_posts(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_feed_posts_created_at_idx
      ON star_feed_posts(created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_feed_posts_kind_created_at_idx
      ON star_feed_posts(kind, created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_feed_posts_author_user_id_idx
      ON star_feed_posts(author_user_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS star_feed_reactions_post_user_idx
      ON star_feed_reactions(post_id, user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_feed_reactions_post_id_idx
      ON star_feed_reactions(post_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_feed_reactions_user_id_idx
      ON star_feed_reactions(user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_feed_comments_post_id_created_at_idx
      ON star_feed_comments(post_id, created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS star_feed_comments_user_id_idx
      ON star_feed_comments(user_id)
    `);

    await db.execute(sql`
      INSERT INTO star_feed_posts (kind, source_key, title, body, metadata, created_at, updated_at)
      VALUES
        (
          'official',
          'official:star-feed-welcome',
          'STAR 공식 피드가 열렸어요',
          '공식 콘텐츠, 이벤트, 팬덤 공지가 이 타임라인에 모입니다.',
          '{"seed":true}'::jsonb,
          now() - interval '3 minutes',
          now() - interval '3 minutes'
        ),
        (
          'fan',
          'official:fan-reaction-feed',
          '팬 응원 피드 준비 중',
          'FAN 모드의 응원글, 토크배틀 결과, 팬 활동이 STAR 세계에 반영됩니다.',
          '{"seed":true}'::jsonb,
          now() - interval '2 minutes',
          now() - interval '2 minutes'
        ),
        (
          'growth',
          'official:star-growth-log',
          'STAR 성장 기록 예고',
          'NFT 보유자가 장착한 STAR의 성장 로그와 토르미아 진행 기록이 이곳에 쌓일 예정입니다.',
          '{"seed":true}'::jsonb,
          now() - interval '1 minute',
          now() - interval '1 minute'
        )
      ON CONFLICT (source_key) DO NOTHING
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:star-feed-v1'))`);
  }
}
