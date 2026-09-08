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

if [[ "${SCHEMA_ROLLBACK_COMPATIBILITY_CONFIRMED:-}" != "1" ]]; then
  echo "Set SCHEMA_ROLLBACK_COMPATIBILITY_CONFIRMED=1 only after verifying that both the target and recorded rollback API images work with the post-migration schema." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${COMPOSE_FILE:-$root/docker-compose.server.yml}"
health_url="${DEPLOY_HEALTH_URL:-http://127.0.0.1/api/healthz}"
compose=(docker compose --file "$compose_file")
audit_log="${DEPLOY_AUDIT_LOG:-$root/.deploy-history.log}"
deploy_pwa="${DEPLOY_PWA:-0}"

if [[ "$deploy_pwa" != "0" && "$deploy_pwa" != "1" ]]; then
  echo "Refusing deployment: DEPLOY_PWA must be 0 or 1." >&2
  exit 2
fi

canonical_directory() {
  local requested="$1"
  [[ -d "$requested" ]] || {
    echo "Required directory does not exist: $requested" >&2
    return 1
  }
  realpath -e -- "$requested"
}

compose_with() {
  local image="$1"
  local pwa_root="$2"
  shift 2
  API_IMAGE="$image" PWA_WEB_ROOT="$pwa_root" "${compose[@]}" "$@"
}

service_container_id() {
  local image="$1"
  local pwa_root="$2"
  local service="$3"
  compose_with "$image" "$pwa_root" ps --quiet "$service"
}

validate_pwa_root_basic() {
  local pwa_root="$1"
  [[ -r "$pwa_root/index.html" && -r "$pwa_root/sw.js" ]] || {
    echo "PWA root is missing readable index.html or sw.js: $pwa_root" >&2
    return 1
  }
}

validate_pwa_root_release() {
  local pwa_root="$1"
  validate_pwa_root_basic "$pwa_root"
  [[ -r "$pwa_root/sw-cache-policy.js" ]] || {
    echo "PWA root is missing sw-cache-policy.js: $pwa_root" >&2
    return 1
  }
  [[ -r "$pwa_root/manifest.webmanifest" ]] || {
    echo "PWA root is missing manifest.webmanifest: $pwa_root" >&2
    return 1
  }
  [[ -d "$pwa_root/_expo/static" ]] || {
    echo "PWA root is missing _expo/static: $pwa_root" >&2
    return 1
  }
  if grep -qE '__PWA_CACHE_VERSION__|__PWA_APP_SHELL_ASSETS__' "$pwa_root/sw.js"; then
    echo "PWA service worker still contains build placeholders: $pwa_root/sw.js" >&2
    return 1
  fi
  if ! find "$pwa_root/_expo/static" -type f \( -name '*.js' -o -name '*.css' \) -print -quit | grep -q .; then
    echo "PWA root has no JavaScript or CSS bundle under _expo/static: $pwa_root" >&2
    return 1
  fi
}

verify_service_health() {
  local image="$1"
  local pwa_root="$2"
  local service="$3"
  local container_id health_state
  container_id="$(service_container_id "$image" "$pwa_root" "$service")"
  [[ -n "$container_id" ]] || {
    echo "No container ID found for $service." >&2
    return 1
  }
  health_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id")"
  [[ "$health_state" == "healthy" ]] || {
    echo "$service container is not healthy (state=$health_state)." >&2
    return 1
  }
  docker exec "$container_id" node -e \
    "fetch('http://127.0.0.1:8080/api/healthz',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}

wait_for_proxy_health() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "$health_url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "Proxy health check did not recover: $health_url" >&2
  return 1
}

minimum_free_bytes="${DEPLOY_MINIMUM_FREE_BYTES:-10737418240}"
if ! [[ "$minimum_free_bytes" =~ ^[0-9]+$ ]]; then
  echo "Refusing deployment: DEPLOY_MINIMUM_FREE_BYTES must be an unsigned integer." >&2
  exit 2
fi
available_bytes="$(df -B1 --output=avail "$root" | tail -n 1 | tr -d ' ')"
if ! [[ "$available_bytes" =~ ^[0-9]+$ ]] || (( available_bytes < minimum_free_bytes )); then
  echo "Refusing deployment: available disk bytes ($available_bytes) are below the required $minimum_free_bytes." >&2
  echo "Review cleanup candidates with CLEANUP_ROOT=/opt bash $root/docker/cleanup-production-disk.sh before retrying." >&2
  echo "Automatic cleanup intentionally runs only after a successful deployment and will not run during this preflight failure." >&2
  exit 1
fi

default_pwa_root="${PWA_WEB_ROOT:-$root/artifacts/mobile/web-build}"

app_a_id="$(service_container_id "$API_IMAGE" "$default_pwa_root" app-a)"
app_b_id="$(service_container_id "$API_IMAGE" "$default_pwa_root" app-b)"
proxy_id="$(service_container_id "$API_IMAGE" "$default_pwa_root" proxy)"
previous_a="$(docker inspect --format '{{.Image}}' "$app_a_id" 2>/dev/null || true)"
previous_b="$(docker inspect --format '{{.Image}}' "$app_b_id" 2>/dev/null || true)"

if [[ -z "$previous_a" || -z "$previous_b" ]]; then
  echo "Refusing initial deployment without a rollback target. Set ALLOW_INITIAL_DEPLOY=1 only after recording a manual recovery plan."
  [[ "${ALLOW_INITIAL_DEPLOY:-}" == "1" ]] || exit 1
elif [[ "$previous_a" != "$previous_b" ]]; then
  echo "Refusing deployment because app-a and app-b use different current image IDs. Stabilize replicas first."
  exit 1
fi

previous_image="$previous_a"
previous_pwa_source=""
if [[ -n "$proxy_id" ]]; then
  previous_pwa_mount="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/srv/app"}}{{.Type}}|{{.Source}}{{end}}{{end}}' "$proxy_id")"
  previous_pwa_type="${previous_pwa_mount%%|*}"
  previous_pwa_source="${previous_pwa_mount#*|}"
  if [[ "$previous_pwa_mount" == "$previous_pwa_source" || "$previous_pwa_type" != "bind" ]]; then
    echo "Refusing deployment: current proxy /srv/app is not a discoverable bind mount." >&2
    exit 1
  fi
  previous_pwa_source="$(canonical_directory "$previous_pwa_source")"
  validate_pwa_root_basic "$previous_pwa_source"
fi

if [[ "$deploy_pwa" == "1" ]]; then
  [[ -n "${PWA_WEB_ROOT:-}" ]] || {
    echo "DEPLOY_PWA=1 requires an explicit immutable PWA_WEB_ROOT." >&2
    exit 1
  }
  target_pwa_root="$(canonical_directory "$PWA_WEB_ROOT")"
  validate_pwa_root_release "$target_pwa_root"
  if [[ -n "$previous_pwa_source" && "$target_pwa_root" == "$previous_pwa_source" ]]; then
    echo "Refusing in-place PWA deployment: use a new versioned PWA_WEB_ROOT so rollback remains possible." >&2
    exit 1
  fi
else
  target_pwa_root="$(canonical_directory "${previous_pwa_source:-$default_pwa_root}")"
  validate_pwa_root_basic "$target_pwa_root"
fi

app_a_touched=0
app_b_touched=0
proxy_touched=0
migration_started=0
apps_replaced=0

record_deploy() {
  printf '%s target_api=%s previous_a=%s previous_b=%s target_pwa=%s previous_pwa=%s migration_started=%s result=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$API_IMAGE" "${previous_a:-none}" "${previous_b:-none}" \
    "$target_pwa_root" "${previous_pwa_source:-none}" "$migration_started" "$1" >> "$audit_log"
}

rollback_on_failure() {
  status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$apps_replaced" == "1" && -n "$previous_image" ]]; then
    echo "Deployment failed after app replacement. Restoring $previous_image."
    rollback_pwa_root="${previous_pwa_source:-$target_pwa_root}"
    if PWA_WEB_ROOT="$rollback_pwa_root" API_IMAGE="$previous_image" \
      "${compose[@]}" up --detach --wait app-a app-b proxy && \
      verify_service_health "$previous_image" "$rollback_pwa_root" app-a && \
      verify_service_health "$previous_image" "$rollback_pwa_root" app-b && \
      wait_for_proxy_health; then
      record_deploy "rolled_back"
    else
      echo "Automatic rollback did not pass all health checks; manual recovery is required." >&2
      record_deploy "rollback_incomplete"
    fi
  elif [[ "$status" -ne 0 ]]; then
    echo "Deployment failed before app replacement. Existing app containers were not changed."
    record_deploy "failed_before_replace"
  fi
  exit "$status"
}

trap rollback_on_failure EXIT

PWA_WEB_ROOT="$target_pwa_root" API_IMAGE="$API_IMAGE" "${compose[@]}" config --quiet
PWA_WEB_ROOT="$target_pwa_root" API_IMAGE="$API_IMAGE" \
  "${compose[@]}" --profile tools run --rm --no-deps proxy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
PWA_WEB_ROOT="$target_pwa_root" API_IMAGE="$API_IMAGE" \
  "${compose[@]}" --profile tools run --rm --no-deps call-migration-readiness
migration_started=1
PWA_WEB_ROOT="$target_pwa_root" API_IMAGE="$API_IMAGE" "${compose[@]}" --profile tools run --rm migrate
PWA_WEB_ROOT="$target_pwa_root" API_IMAGE="$API_IMAGE" "${compose[@]}" --profile tools run --rm neo4j-init
apps_replaced=1
PWA_WEB_ROOT="$target_pwa_root" API_IMAGE="$API_IMAGE" \
  "${compose[@]}" up --detach --wait app-a app-b proxy

verify_service_health "$API_IMAGE" "$target_pwa_root" app-a
verify_service_health "$API_IMAGE" "$target_pwa_root" app-b
wait_for_proxy_health

record_deploy "succeeded"
trap - EXIT

if [[ "${AUTO_CLEAN_RELEASES:-0}" == "1" ]]; then
  if ! CLEANUP_PROTECTED_PATHS="$previous_pwa_source" \
    MIN_AGE_DAYS="${RELEASE_RETENTION_DAYS:-7}" \
    bash "$root/docker/cleanup-production-disk.sh" --apply; then
    echo "WARNING: deployment succeeded, but optional post-deploy release cleanup failed." >&2
    echo "Run the cleanup script in dry-run mode, review its output, and retry cleanup separately." >&2
  fi
fi

echo "Deployment completed after migration and readiness checks."
