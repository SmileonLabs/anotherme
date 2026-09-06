#!/usr/bin/env bash
set -euo pipefail

# Removes name-qualified deployment/build directories only. Docker volumes and
# directories mounted by any container are excluded. A database dump stored
# inside a candidate release directory is not discoverable as such, so keep
# durable data outside those directories and review the dry-run before --apply.

root="${CLEANUP_ROOT:-/opt}"
min_age_days="${MIN_AGE_DAYS:-7}"
apply=0

if [[ "${1:-}" == "--apply" ]]; then
  apply=1
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--apply]" >&2
  exit 2
fi

root_real="$(realpath -e -- "$root")"
before_bytes="$(df -B1 --output=avail "$root_real" | tail -n 1 | tr -d ' ')"

# Deletion is only safe when the complete Docker mount/image inventory is
# available. A stopped or unreachable daemon must never turn protected release
# directories into apparent cleanup candidates.
if ! docker info >/dev/null 2>&1; then
  if [[ "$apply" == 1 ]]; then
    echo "refusing cleanup: Docker inventory is unavailable" >&2
    exit 1
  fi
  echo "warning: Docker inventory is unavailable; dry-run results are incomplete" >&2
fi

container_ids="$(docker ps -aq 2>/dev/null || true)"
if [[ "$apply" == 1 && -n "$container_ids" ]]; then
  # Validate the whole inventory before considering any deletion. The later
  # formatted inspections may then safely be consumed through process
  # substitution without hiding a partial failure.
  # shellcheck disable=SC2086 # Docker expects one argument per container id.
  docker inspect $container_ids >/dev/null
fi

declare -A protected=()

# The deployer may name one or more newline-separated release directories that
# must remain available for rollback even though no running/stopped container
# mounts them yet. Refuse paths outside CLEANUP_ROOT instead of silently
# accepting a typo that would weaken the cleanup boundary.
while IFS= read -r requested; do
  [[ -n "$requested" ]] || continue
  requested="$(realpath -e -- "$requested")"
  case "$requested" in
    "$root_real"|"$root_real"/*) ;;
    *)
      echo "refusing protected path outside cleanup root: $requested" >&2
      exit 1
      ;;
  esac
  while [[ "$requested" == "$root_real"/* ]]; do
    protected["$requested"]=1
    requested="$(dirname -- "$requested")"
  done
done <<< "${CLEANUP_PROTECTED_PATHS:-}"

# Also protect the release containing this script. This matters if the proxy is
# temporarily stopped: in that case Docker no longer advertises the bind mount,
# but the cleanup process must never delete the directory it is running from.
script_source="$(realpath -e -- "$0")"
script_parent="$(dirname -- "$script_source")"
while [[ "$script_parent" == "$root_real"/* ]]; do
  protected["$script_parent"]=1
  script_parent="$(dirname -- "$script_parent")"
done

# Protect every directory that is currently bind-mounted by any container,
# including stopped rollback containers.
while IFS= read -r source; do
  [[ -n "$source" ]] || continue
  source="$(realpath -m -- "$source")"
  while [[ "$source" == "$root_real"/* ]]; do
    protected["$source"]=1
    source="$(dirname -- "$source")"
  done
done < <(
  printf '%s\n' "$container_ids" | xargs -r docker inspect \
    --format '{{range .Mounts}}{{println .Source}}{{end}}' 2>/dev/null || true
)

# A rollback container may retain only an image tag, not a bind mount. Preserve
# release directories whose suffix matches a tag referenced by any container.
while IFS= read -r image; do
  [[ "$image" == *:* ]] || continue
  tag="${image##*:}"
  [[ "$tag" =~ ^[A-Za-z0-9._-]+$ ]] || continue
  protected["$root_real/anotherme-release-$tag"]=1
  protected["$root_real/anotherme-api-release-$tag"]=1
  protected["$root_real/anotherme-pwa-release-$tag"]=1
done < <(
  printf '%s\n' "$container_ids" | xargs -r docker inspect --format '{{.Config.Image}}' 2>/dev/null || true
)

is_candidate() {
  case "$(basename -- "$1")" in
    anotherme-build|anotherme-apk-build-*|anotherme-release-*|anotherme-api-release-*|anotherme-pwa-release-*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

echo "mode=$([[ "$apply" == 1 ]] && echo apply || echo dry-run) root=$root_real min_age_days=$min_age_days"
echo "available_before_bytes=$before_bytes"

deleted=0
while IFS= read -r -d '' candidate; do
  candidate="$(realpath -e -- "$candidate")"
  is_candidate "$candidate" || continue

  case "$candidate" in
    "$root_real"/anotherme-*) ;;
    *)
      echo "refusing unexpected path: $candidate" >&2
      exit 1
      ;;
  esac

  if [[ -n "${protected[$candidate]:-}" ]]; then
    echo "PROTECTED $candidate"
    continue
  fi

  if ! find "$candidate" -maxdepth 0 -mtime "+$min_age_days" -print -quit | grep -q .; then
    echo "RECENT $candidate"
    continue
  fi

  echo "REMOVE $candidate"
  if [[ "$apply" == 1 ]]; then
    rm -rf --one-file-system -- "$candidate"
    deleted=$((deleted + 1))
  fi
done < <(find "$root_real" -mindepth 1 -maxdepth 1 -type d -name 'anotherme-*' -print0)

after_bytes="$(df -B1 --output=avail "$root_real" | tail -n 1 | tr -d ' ')"
echo "removed_directories=$deleted"
echo "available_after_bytes=$after_bytes"
echo "reclaimed_bytes=$((after_bytes - before_bytes))"
