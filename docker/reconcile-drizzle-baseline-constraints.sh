#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || "${BASELINE_STAGING_VERIFIED:-}" != "1" ]]; then
  echo "Refusing constraint reconciliation. Validate the production restore in staging first."
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL is required}"

if ! command -v node >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  echo "node and psql are required to reconcile baseline constraints."
  exit 1
fi

# Node's pg accepts useLibpqCompat, but PostgreSQL client tools reject it.
psql_database_url="$(node -e '
  const url = new URL(process.argv[1]);
  url.searchParams.delete("useLibpqCompat");
  url.searchParams.delete("uselibpqcompat");
  process.stdout.write(url.toString());
' "$DATABASE_URL")"

psql "$psql_database_url" --set ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.star_growth_events'::regclass
      AND conname = 'star_growth_events_source_key_unique'
  ) THEN
    ALTER TABLE public.star_growth_events
      ADD CONSTRAINT star_growth_events_source_key_unique UNIQUE (source_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.star_feed_posts'::regclass
      AND conname = 'star_feed_posts_source_key_unique'
  ) THEN
    ALTER TABLE public.star_feed_posts
      ADD CONSTRAINT star_feed_posts_source_key_unique UNIQUE (source_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wallet_verification_challenges'::regclass
      AND conname = 'wallet_verification_challenges_nonce_unique'
  ) THEN
    ALTER TABLE public.wallet_verification_challenges
      ADD CONSTRAINT wallet_verification_challenges_nonce_unique UNIQUE (nonce);
  END IF;
END $$;

COMMIT;
SQL

echo "Reconciled baseline unique constraints. Run the catalog verifier before registering the Drizzle baseline."
