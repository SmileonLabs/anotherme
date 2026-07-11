# Docker Deployment Notes

This setup is intended to mirror the initial production topology outside Replit:

- `proxy`: Nginx reverse proxy and future WebSocket upgrade point
- `app-a`, `app-b`: two API app instances
- `postgres`: persistent PostgreSQL database
- `redis`: shared realtime state/pub-sub foundation
- `minio`: local S3-compatible object storage replacement for Replit Object Storage
- `migrate`: one-shot versioned Drizzle migration job

## Local Start

```powershell
docker compose up --build
```

Open the API health check:

```text
http://localhost:8080/api/healthz
```

Local service ports:

- API through Nginx: `localhost:8080`
- PostgreSQL: `localhost:55432`
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`
- MinIO console: `localhost:9001`

MinIO login:

- user: `anotherme`
- password: `anotherme-password`

## Production Transfer

Use the same `docker/api.Dockerfile` image in production, but replace local Compose
services with managed or production-grade services:

- PostgreSQL: managed PostgreSQL with backups
- Redis: managed Redis or a HA Redis deployment
- Object storage: S3, Cloudflare R2, or production MinIO
- LiveKit: LiveKit Cloud recommended at first
- TLS/domain: production load balancer, Nginx, Traefik, or Cloudflare

Build and tag an image for a registry:

```powershell
docker build -f docker/api.Dockerfile -t your-registry/anotherme-api:latest .
docker push your-registry/anotherme-api:latest
```

For a single production container host, use `docker-compose.prod.example.yml` as a
starting point. It expects external PostgreSQL, Redis, S3-compatible storage, and
LiveKit values to be injected as environment variables.

```powershell
$env:API_IMAGE="your-registry/anotherme-api:latest"
docker compose -f docker-compose.prod.example.yml --profile tools run --rm migrate
docker compose -f docker-compose.prod.example.yml up -d
```

For the physical 4-server topology, run the app image on two app servers and put
a cloud load balancer in front of them. PostgreSQL and Redis should live on their
own managed servers/services.

Required production environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_PUBLIC_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `FIREBASE_SERVICE_ACCOUNT`
- `CORS_ALLOWED_ORIGINS`

`S3_PUBLIC_ENDPOINT` must be reachable by user browsers because clients upload
directly to the signed URL returned by the API.

## Replit Removal Note

The API now supports S3-compatible object storage when `S3_BUCKET` is set. That is
the path to use outside Replit. The old Replit Object Storage sidecar path remains
as a fallback only for Replit deployments.

## Realtime Upgrade Path

This Compose file already includes Redis and Nginx WebSocket headers. When the app
moves from polling to WebSocket/SSE, keep the same topology:

```text
client -> nginx -> app-a/app-b -> redis pub/sub -> app-a/app-b -> client
```

Typing and presence should move from process memory into Redis TTL keys before
running more than one app instance in production.

## Database Migrations

Production uses committed Drizzle migrations from `lib/db/drizzle`; `drizzle-kit push`
is reserved for disposable local development databases only. Generate a reviewed forward
migration with `pnpm --filter @workspace/db run generate`, commit it, then use
`bash docker/deploy-production.sh` so migration completes before app containers change.

Do not run the initial baseline migration against an existing production database. First
restore a production backup into staging, reconcile the catalog and data backfills, then
record the reviewed baseline in Drizzle's migration ledger. Only run future forward
migrations through the normal `migrate` job.

The API no longer performs PostgreSQL DDL, global data backfills, or Neo4j schema/seed
writes during replica startup. `deploy-production.sh` runs the Drizzle migration job and
the Neo4j initialization job before replacing application containers.

For an existing production PostgreSQL database with no Drizzle ledger, follow
[`docs/operations/drizzle-existing-production-baseline.md`](../docs/operations/drizzle-existing-production-baseline.md).
