#!/usr/bin/env bash
set -euo pipefail

path="${DISK_MONITOR_PATH:-/}"
warn_percent="${DISK_WARN_PERCENT:-80}"
critical_percent="${DISK_CRITICAL_PERCENT:-90}"
warn_available_bytes="${DISK_WARN_AVAILABLE_BYTES:-10737418240}"
critical_available_bytes="${DISK_CRITICAL_AVAILABLE_BYTES:-5368709120}"
retention_days="${DISK_METRIC_RETENTION_DAYS:-35}"
growth_max_sample_age_seconds="${DISK_GROWTH_MAX_SAMPLE_AGE_SECONDS:-86400}"
state_dir="${DISK_MONITOR_STATE_DIR:-/var/lib/anotherme-monitor}"

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

for value in \
  "$warn_percent" \
  "$critical_percent" \
  "$warn_available_bytes" \
  "$critical_available_bytes" \
  "$retention_days" \
  "$growth_max_sample_age_seconds"; do
  is_uint "$value" || { echo "invalid numeric disk monitor setting" >&2; exit 2; }
done
if ((
  warn_percent < 1 || warn_percent > 100 ||
  critical_percent < 1 || critical_percent > 100 ||
  warn_percent >= critical_percent ||
  warn_available_bytes <= critical_available_bytes ||
  retention_days < 1 || growth_max_sample_age_seconds < 1
)); then
  echo "invalid disk monitor threshold ordering" >&2
  exit 2
fi

install -d -m 0750 "$state_dir"

read -r total_bytes used_bytes available_bytes used_percent_raw < <(
  df -P -B1 "$path" | awk 'NR == 2 { gsub(/%/, "", $5); print $2, $3, $4, $5 }'
)

for value in "$total_bytes" "$used_bytes" "$available_bytes" "$used_percent_raw"; do
  is_uint "$value" || { echo "invalid df output" >&2; exit 2; }
done

status="ok"
if (( used_percent_raw >= critical_percent || available_bytes <= critical_available_bytes )); then
  status="critical"
elif (( used_percent_raw >= warn_percent || available_bytes <= warn_available_bytes )); then
  status="warning"
fi

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
epoch="$(date -u +%s)"
metric_file="$state_dir/disk-$(date -u +%Y-%m-%d).jsonl"
sample_file="$state_dir/last-sample"
growth_bytes_per_hour=""
estimated_seconds_to_critical=""
estimated_critical_at=""

previous_epoch=""
previous_total_bytes=""
previous_used_bytes=""
if [[ -r "$sample_file" ]]; then
  read -r previous_epoch previous_total_bytes previous_used_bytes < "$sample_file" || true
fi
if is_uint "$previous_epoch" && is_uint "$previous_total_bytes" && is_uint "$previous_used_bytes"; then
  elapsed_seconds=$((epoch - previous_epoch))
  if ((
    elapsed_seconds > 0 &&
    elapsed_seconds <= growth_max_sample_age_seconds &&
    previous_total_bytes == total_bytes
  )); then
    growth_bytes_per_hour=$(((used_bytes - previous_used_bytes) * 3600 / elapsed_seconds))
  fi
fi

if [[ -n "$growth_bytes_per_hour" ]] && (( growth_bytes_per_hour > 0 )); then
  if [[ "$status" == "critical" ]]; then
    estimated_seconds_to_critical=0
  else
    usable_capacity=$((used_bytes + available_bytes))
    critical_used_bytes=$(((usable_capacity * critical_percent + 99) / 100))
    bytes_until_percent_critical=$((critical_used_bytes - used_bytes))
    bytes_until_available_critical=$((available_bytes - critical_available_bytes))
    bytes_until_critical="$bytes_until_percent_critical"
    if (( bytes_until_available_critical < bytes_until_critical )); then
      bytes_until_critical="$bytes_until_available_critical"
    fi
    if (( bytes_until_critical < 0 )); then bytes_until_critical=0; fi
    estimated_seconds_to_critical=$((bytes_until_critical * 3600 / growth_bytes_per_hour))
  fi
  estimated_critical_epoch=$((epoch + estimated_seconds_to_critical))
  # A very low positive growth rate can put the mathematical ETA outside the
  # host date implementation's supported range. Keep the numeric ETA and omit
  # only the presentation timestamp instead of failing the monitor under -e.
  estimated_critical_at="$(date -u --date="@$estimated_critical_epoch" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
fi

growth_json="${growth_bytes_per_hour:-null}"
eta_seconds_json="${estimated_seconds_to_critical:-null}"
eta_at_json="null"
if [[ -n "$estimated_critical_at" ]]; then eta_at_json="\"$estimated_critical_at\""; fi

printf '{"timestamp":"%s","path":"%s","status":"%s","totalBytes":%s,"usedBytes":%s,"availableBytes":%s,"usedPercent":%s,"growthBytesPerHour":%s,"estimatedSecondsToCritical":%s,"estimatedCriticalAt":%s}\n' \
  "$timestamp" "$path" "$status" "$total_bytes" "$used_bytes" "$available_bytes" "$used_percent_raw" \
  "$growth_json" "$eta_seconds_json" "$eta_at_json" \
  >> "$metric_file"
chmod 0640 "$metric_file"
find "$state_dir" -maxdepth 1 -type f -name 'disk-*.jsonl' -mtime "+$retention_days" -delete

sample_tmp="$sample_file.$$"
printf '%s\t%s\t%s\n' "$epoch" "$total_bytes" "$used_bytes" > "$sample_tmp"
chmod 0640 "$sample_tmp"
mv -f -- "$sample_tmp" "$sample_file"

logger -t anotherme-disk-monitor -p "daemon.$([[ "$status" == critical ]] && echo crit || [[ "$status" == warning ]] && echo warning || echo info)" \
  "status=$status used_percent=$used_percent_raw available_bytes=$available_bytes growth_bytes_per_hour=$growth_json estimated_seconds_to_critical=$eta_seconds_json path=$path"

last_status="$(cat "$state_dir/last-status" 2>/dev/null || true)"
last_notified="$(cat "$state_dir/last-notified" 2>/dev/null || echo 0)"
is_uint "$last_notified" || last_notified=0
notify=0
if [[ "$status" != "$last_status" ]]; then
  notify=1
elif [[ "$status" != "ok" ]] && (( epoch - last_notified >= 21600 )); then
  notify=1
fi

if (( notify == 1 )) && [[ -n "${DISK_ALERT_WEBHOOK_URL:-}" ]]; then
  payload="$(printf '{"service":"anotherme","event":"disk_capacity","timestamp":"%s","status":"%s","usedPercent":%s,"availableBytes":%s,"growthBytesPerHour":%s,"estimatedSecondsToCritical":%s,"estimatedCriticalAt":%s}' \
    "$timestamp" "$status" "$used_percent_raw" "$available_bytes" "$growth_json" "$eta_seconds_json" "$eta_at_json")"
  if curl --fail --silent --show-error --max-time 5 \
    -H 'Content-Type: application/json' --data-binary "$payload" "$DISK_ALERT_WEBHOOK_URL" >/dev/null; then
    printf '%s\n' "$epoch" > "$state_dir/last-notified"
  else
    logger -t anotherme-disk-monitor -p daemon.err "disk alert webhook delivery failed"
  fi
fi

printf '%s\n' "$status" > "$state_dir/last-status"
