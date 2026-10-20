# Deployment Retention

- Five rollback snapshots total, including `/var/backups/ktga/source-editor`.
- The latest consistent `data.tar.gz` is preserved separately as
  `/var/backups/ktga/last-deployment-data.tar.gz` before pruning its release.
- Standalone maintenance/data archives and live application files are not pruned.
- Idle recognized build trees and uploaded releases are removed after one hour.
- Running processes and deferred systemd deployments protect their preparation paths.
- New release workspaces should use `/var/tmp`, on disk, rather than RAM-backed `/tmp`.

Install: `sudo bash deploy/debian/setup-retention.sh`.

Preview: `sudo ktga-prune-deployments`.

Apply: `sudo ktga-prune-deployments --apply`.

One-time immediate cleanup of idle preparations:
`sudo ktga-prune-deployments --apply --all-idle-preparations`.

The systemd path watcher runs after deployment changes; an hourly timer is the
fallback. Both share the deployment lock. No game-server restart is required.
