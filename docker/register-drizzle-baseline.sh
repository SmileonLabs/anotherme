#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || "${BASELINE_STAGING_VERIFIED:-}" != "1" ]]; then
  echo "Refusing to register a production baseline. Restore and validate production in staging first."
  echo "After approval, run: BASELINE_STAGING_VERIFIED=1 bash docker/register-drizzle-baseline.sh --confirm"
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL is required}"

# Node's pg accepts useLibpqCompat, but PostgreSQL client tools reject it.
psql_database_url="$(node -e '
  const url = new URL(process.argv[1]);
  url.searchParams.delete("useLibpqCompat");
  url.searchParams.delete("uselibpqcompat");
  process.stdout.write(url.toString());
' "$DATABASE_URL")"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$root/lib/db/drizzle/0000_eminent_silvermane.sql"
journal="$root/lib/db/drizzle/meta/_journal.json"

if [[ ! -f "$migration" || ! -f "$journal" ]]; then
  echo "Baseline migration or journal is missing."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1 || ! command -v sha256sum >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo "psql, sha256sum, and node are required to register a baseline."
  exit 1
fi

DATABASE_URL="$psql_database_url" node "$root/docker/verify-drizzle-baseline-catalog.mjs"

ledger_exists="$(psql "$psql_database_url" --tuples-only --no-align --command "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL;")"
if [[ "$ledger_exists" == "t" ]]; then
  existing="$(psql "$psql_database_url" --tuples-only --no-align --command "SELECT count(*) FROM drizzle.__drizzle_migrations;")"
else
  existing=0
fi
if [[ "$existing" != "0" ]]; then
  echo "Refusing baseline registration because Drizzle already has $existing migration ledger entries."
  exit 1
fi

hash="$(sha256sum "$migration" | awk '{print $1}')"
created_at="$(node --input-type=module --eval "
  import { readFileSync } from 'node:fs';
  const journal = JSON.parse(readFileSync(process.argv[1], 'utf8'));
  const entry = journal.entries.find((item) => item.tag === '0000_eminent_silvermane');
  if (!entry) process.exit(1);
  console.log(entry.when);
" "$journal")"

psql "$psql_database_url" \
  --set ON_ERROR_STOP=1 \
  --set migration_hash="$hash" \
  --set migration_created_at="$created_at" <<'SQL'
BEGIN;
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY NOT NULL,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES (:'migration_hash', :'migration_created_at');
COMMIT;
SQL

echo "Registered 0000_eminent_silvermane in the Drizzle ledger without executing its CREATE TABLE statements."
