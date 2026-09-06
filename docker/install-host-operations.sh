#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install -d -m 0750 /etc/anotherme /var/lib/anotherme-monitor
install -D -m 0755 "$root/docker/ops/anotherme-disk-monitor.sh" \
  /usr/local/sbin/anotherme-disk-monitor
install -D -m 0644 "$root/docker/ops/anotherme-disk-monitor.service" \
  /etc/systemd/system/anotherme-disk-monitor.service
install -D -m 0644 "$root/docker/ops/anotherme-disk-monitor.timer" \
  /etc/systemd/system/anotherme-disk-monitor.timer
install -D -m 0644 "$root/docker/ops/journald-anotherme.conf" \
  /etc/systemd/journald.conf.d/anotherme.conf
install -D -m 0640 "$root/docker/ops/disk-monitor.env.example" \
  /etc/anotherme/disk-monitor.env.example

systemctl daemon-reload
systemctl enable --now anotherme-disk-monitor.timer
systemctl restart systemd-journald
journalctl --vacuum-size=512M --vacuum-time=14d >/dev/null
systemctl start anotherme-disk-monitor.service

echo "Another Me host operations policy installed."
