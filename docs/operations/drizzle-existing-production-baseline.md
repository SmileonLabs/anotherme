# Existing Production Drizzle Baseline

Use this procedure only when a PostgreSQL database already contains the Another Me
schema but does not have Drizzle ledger entries. It registers the reviewed baseline
without executing `0000_eminent_silvermane.sql` against production.

## Required Preconditions

1. Create a production backup or provider restore point and test restoring it.
2. Restore that backup into an isolated staging PostgreSQL instance.
3. Run the baseline registration script against staging with `DATABASE_URL` pointing
   to the restored database. It compares the live catalog with the committed Drizzle
   snapshot: columns, types, nullability, defaults, primary/foreign/unique constraints,
   and ordinary indexes must all match before it writes a ledger row.
4. Run `pnpm --filter @workspace/db run migrate` against staging. It must report
   no pending baseline work.
5. Run API readiness and smoke tests against staging.
6. Record approver, backup identifier, staging validation timestamp, and deployed
   image digest in the deployment ticket.

If the catalog verifier identifies the three legacy uniqueness gaps for STAR growth,
STAR feed posts, or wallet challenge nonces, reconcile them in staging first:

```bash
BASELINE_STAGING_VERIFIED=1 \
DATABASE_URL="$DATABASE_URL" \
bash docker/reconcile-drizzle-baseline-constraints.sh --confirm
```

The script adds only the named unique constraints, uses a five-second lock timeout,
and rolls back all three additions if any check fails. Re-run the catalog verifier
before registering the baseline. Do not use it for other catalog differences.

## Production Registration

Run from a trusted host with PostgreSQL client tools installed. Do not print or log
the database URL.

```bash
BASELINE_STAGING_VERIFIED=1 \
DATABASE_URL="$DATABASE_URL" \
bash docker/register-drizzle-baseline.sh --confirm
```

The script refuses to continue when a baseline table is absent or when the Drizzle
ledger already has entries. It writes one hash/timestamp entry from the committed
Drizzle journal; it does not execute any `CREATE TABLE` statement.

## Subsequent Deployments

Only reviewed forward migrations may be generated after the baseline. Use the
deployment script, which requires an explicit backup confirmation and runs migration
before it replaces application containers:

```bash
PRE_DEPLOY_BACKUP_CONFIRMED=1 \
DATABASE_URL="$DATABASE_URL" \
API_IMAGE="registry.example/anotherme-api@sha256:..." \
COMPOSE_FILE=docker-compose.server.yml \
DEPLOY_HEALTH_URL=http://127.0.0.1/api/healthz \
bash docker/deploy-production.sh
```

Database migrations are not automatically reversible. If migration succeeds but a
later app replacement or readiness step fails, the script restores the previous
immutable app image and records the result in `.deploy-history.log`. It does not roll
back database migrations: stop promotion, inspect application logs, and restore the
documented backup or apply a reviewed corrective migration. Do not rerun the baseline
registration script.

## Call Hardening Migration

`0001_call-hardening` is a forward migration from the registered baseline. Test it
against the restored staging copy before production. Drain API replicas that run code
older than this migration before applying it: older replicas do not acquire the new
`call_user_locks` concurrency guard.

The migration keeps the newest active call for each participant (then the newest
ringing call), marks conflicting live calls as `failed`, and backfills one lock row per
participant. It stops with an explicit error if historical `room_name` values are not
unique; reconcile those records manually rather than allowing ambiguous LiveKit room
ownership. The status, media, and distinct-participant checks are added `NOT VALID` so
they protect new writes without rejecting historic rows. Audit and validate them in a
separate reviewed migration after legacy data has been corrected.

After promotion, leave the call lifecycle worker enabled (the default). It expires
unanswered calls and retries LiveKit room deletion for terminal calls. The worker can
be disabled only with `CALL_LIFECYCLE_WORKER_ENABLED=false` during controlled
maintenance.
