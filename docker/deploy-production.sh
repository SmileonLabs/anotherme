#!/usr/bin/env bash
set -euo pipefail

if [[ "${PRE_DEPLOY_BACKUP_CONFIRMED:-}" != "1" ]]; then
  echo "Set PRE_DEPLOY_BACKUP_CONFIRMED=1 only after confirming a tested backup or restore point."
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${API_IMAGE:?API_IMAGE must be an immutable image digest}"

if [[ "$API_IMAGE" != *@sha256:* ]]; then
  echo "API_IMAGE must use an immutable @sha256 digest so rollback can restore the previous image."
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${COMPOSE_FILE:-$root/docker-compose.server.yml}"
health_url="${DEPLOY_HEALTH_URL:-http://127.0.0.1/api/healthz}"
compose=(docker compose --file "$compose_file")
audit_log="${DEPLOY_AUDIT_LOG:-$root/.deploy-history.log}"
previous_a="$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps --quiet app-a)" 2>/dev/null || true)"
previous_b="$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps --quiet app-b)" 2>/dev/null || true)"

if [[ -z "$previous_a" || -z "$previous_b" ]]; then
  echo "Refusing initial deployment without a rollback target. Set ALLOW_INITIAL_DEPLOY=1 only after recording a manual recovery plan."
  [[ "${ALLOW_INITIAL_DEPLOY:-}" == "1" ]] || exit 1
elif [[ "$previous_a" != "$previous_b" ]]; then
  echo "Refusing deployment because app-a and app-b use different current images. Stabilize replicas first."
  exit 1
fi

previous_image="$previous_a"
apps_replaced=0

record_deploy() {
  printf '%s current=%s previous=%s result=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$API_IMAGE" "${previous_image:-none}" "$1" >> "$audit_log"
}

rollback_on_failure() {
  status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$apps_replaced" == "1" && -n "$previous_image" ]]; then
    echo "Deployment failed after app replacement. Restoring $previous_image."
    API_IMAGE="$previous_image" "${compose[@]}" up --detach --wait app-a app-b proxy || true
    curl --fail --silent --show-error "$health_url" >/dev/null || true
    record_deploy "rolled_back"
  elif [[ "$status" -ne 0 ]]; then
    echo "Deployment failed before app replacement. Existing app containers were not changed."
    record_deploy "failed_before_replace"
  fi
  exit "$status"
}

trap rollback_on_failure EXIT

"${compose[@]}" config --quiet
"${compose[@]}" --profile tools run --rm migrate
"${compose[@]}" --profile tools run --rm neo4j-init
apps_replaced=1
"${compose[@]}" up --detach --wait app-a app-b proxy

curl --fail --silent --show-error "$health_url" >/dev/null

record_deploy "succeeded"
trap - EXIT
echo "Deployment completed after migration and readiness checks."
