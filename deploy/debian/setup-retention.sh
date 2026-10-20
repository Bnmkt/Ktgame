#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
install -d -m 0755 /usr/local/libexec
install -d -m 0700 /var/backups/ktga /var/backups/ktga/source-editor
install -o root -g root -m 0644 "$here/deployment-retention.mjs" /usr/local/libexec/ktga-deployment-retention.mjs
install -o root -g root -m 0750 "$here/prune-deployments.sh" /usr/local/sbin/ktga-prune-deployments
for unit in service timer path; do
  install -o root -g root -m 0644 "$here/ktga-retention.$unit" "/etc/systemd/system/ktga-retention.$unit"
done
systemctl daemon-reload
systemctl enable --now ktga-retention.timer ktga-retention.path
echo 'Deployment retention installed: five rollback snapshots, hourly and after deployment changes.'
