DROP INDEX IF EXISTS "star_profiles_unique_nft_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "star_profiles_active_nft_idx"
  ON "star_profiles" ("chain_id", "contract_address", "token_id")
  WHERE "ownership_status" = 'verified';

-- Historical STAR rows are retained after an NFT transfer. Only the current
-- verified owner may have an active row for the token.
