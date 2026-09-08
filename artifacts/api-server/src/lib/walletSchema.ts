import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureWalletSchema(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('anotherme:wallets-v1'))`);
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wallet_address text NOT NULL,
        chain_id integer NOT NULL DEFAULT 1,
        verified_at timestamptz,
        nft_verified_at timestamptz,
        last_checked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS wallet_verification_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wallet_address text NOT NULL,
        nonce text NOT NULL UNIQUE,
        message text NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_wallet_address_idx
      ON user_wallets(wallet_address)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_wallets_user_id_idx
      ON user_wallets(user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_wallets_user_id_nft_verified_idx
      ON user_wallets(user_id, nft_verified_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS wallet_challenges_user_wallet_idx
      ON wallet_verification_challenges(user_id, wallet_address)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS wallet_challenges_expires_at_idx
      ON wallet_verification_challenges(expires_at)
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtext('anotherme:wallets-v1'))`);
  }
}
