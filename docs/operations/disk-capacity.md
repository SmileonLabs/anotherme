# Production disk capacity operations

The API readiness endpoint is intentionally limited to request-serving
dependencies. Disk pressure is observed out of band so crossing an alert
threshold does not remove every API replica from the reverse proxy.

## Install the host policy

Review `docker/ops/journald-anotherme.conf` against the incident-retention policy
before installation. The installer reloads journald and immediately vacuums
archived host journals to 512 MiB / 14 days, so export any journal history that
must be retained first.

```bash
sudo bash docker/install-host-operations.sh
```

The timer samples the configured filesystem every 15 minutes. Metrics are kept
as root/operator-readable JSONL under `/var/lib/anotherme-monitor` for 35 days.
Each record includes used and available bytes, the signed change in used bytes
per hour since the preceding recent sample, and an estimated time at which the
first critical threshold will be reached. The estimate is omitted for a first,
stale, different-size, or non-growing sample; it is a trend estimate rather than
a capacity guarantee.

## Configure alert delivery

Installation places an example at
`/etc/anotherme/disk-monitor.env.example` but deliberately does not create an
active webhook configuration. Without `DISK_ALERT_WEBHOOK_URL`, warning and
critical transitions are recorded only in the local journal and JSONL metrics;
there is no external notification.

After approving the destination's access and retention policy:

```bash
sudo cp /etc/anotherme/disk-monitor.env.example /etc/anotherme/disk-monitor.env
sudo chmod 0640 /etc/anotherme/disk-monitor.env
sudoedit /etc/anotherme/disk-monitor.env
sudo systemctl start anotherme-disk-monitor.service
sudo journalctl -u anotherme-disk-monitor.service --since today
```

Treat the webhook URL as a secret. The payload contains capacity numbers and
trend estimates only; it does not include authentication tokens, request data,
or message content. A failed notification is retried on the next timer run and
then every run until one succeeds.

## Attribute and reclaim capacity safely

Inspect the host, Docker data root, release tree, and journal independently;
they may reside on different filesystems.

```bash
df -h /
docker system df -v
sudo du -xhd1 /var/lib/docker /opt /var/log 2>/dev/null | sort -h
journalctl --disk-usage
```

Release cleanup is dry-run by default and only considers first-level,
age-qualified `anotherme-*` build/release directories. It refuses to apply when
Docker container/mount inspection fails and never targets Docker volumes.
Database dumps and other durable data must live outside the candidate release
directories: the script cannot infer that a nested file is a backup. Review the
dry-run list and verify backup location/restoreability before `--apply`.

```bash
CLEANUP_ROOT=/opt MIN_AGE_DAYS=7 bash docker/cleanup-production-disk.sh
# Review every REMOVE line before authorizing deletion:
CLEANUP_ROOT=/opt MIN_AGE_DAYS=7 bash docker/cleanup-production-disk.sh --apply
```

Deployment stops before migrations when its filesystem has less than the
configured free-space floor. Cleanup is not run automatically before that
check: review and apply it separately, then rerun deployment. Optional
post-deploy cleanup failure is reported as a warning and does not misreport the
already-running release as a failed deployment.

Docker `json-file` limits take effect when each service container is recreated.
In particular, recreate Neo4j during an approved maintenance window if it was
running before the logging policy was added; an API-only rollout does not
replace that container.
