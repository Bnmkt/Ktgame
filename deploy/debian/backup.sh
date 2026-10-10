#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Run as root.' >&2; exit 1; fi
umask 077
exec 9>/run/ktga-backup.lock
flock -n 9 || { echo 'Another backup is running.' >&2; exit 1; }
destination=/var/backups/ktga
install -d -m 0700 "$destination"
[[ $(realpath "$destination") == /var/backups/ktga ]] || { echo 'Unexpected backup target.' >&2; exit 1; }
active=false
systemctl is-active --quiet ktga.service && active=true
restart() { if [[ $active == true ]]; then systemctl start ktga.service; fi; }
trap restart EXIT
if [[ $active == true ]]; then systemctl stop ktga.service; fi
archive="$destination/ktga-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
tar -czf "$archive.part" -C / var/lib/ktga etc/ktga etc/systemd/system/ktga.service etc/nginx/sites-available/ktga etc/nginx/conf.d/ktga-common.conf
tar -tzf "$archive.part" >/dev/null
mv -- "$archive.part" "$archive"
find "$destination" -maxdepth 1 -type f -name 'ktga-*.tar.gz' -mtime +14 -delete
echo "Backup: $archive (includes private configuration; store encrypted off-site)."
