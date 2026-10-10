#!/bin/bash
set -euo pipefail
mode="${1:-}"
unit="${2:-}"
[[ "$unit" =~ ^ktga-capacity-[a-z0-9-]+$ ]] || { echo "Invalid capacity unit" >&2; exit 1; }
if [[ "$mode" == begin ]]; then
  [[ "$(sudo sqlite3 /var/lib/ktga/ktga.sqlite 'SELECT count(*) FROM rooms WHERE finished=0;')" == 0 ]] || { echo "Live tables exist; maintenance refused" >&2; exit 1; }
  sudo systemctl is-active --quiet "$unit.service"
  # A systemd timer restores production even if the client PC/SSH disconnects.
  sudo systemd-run --unit="$unit-restore" --on-active=25m /usr/bin/systemctl start ktga.service
  sudo systemctl stop ktga.service
  echo "Production paused; automatic recovery armed."
elif [[ "$mode" == end ]]; then
  sudo systemctl start ktga.service
  for attempt in {1..60}; do
    if curl --fail --silent http://127.0.0.1:4000/api/health >/dev/null; then
      if [[ "$(sudo systemctl show "$unit.service" -p LoadState --value)" != not-found ]]; then
        sudo systemctl stop "$unit.service"
      fi
      sudo systemctl stop "$unit-restore.timer"
      echo "Production healthy; test stopped; recovery timer disarmed."
      exit 0
    fi
    sleep 1
  done
  echo "Production health not restored; leave recovery timer armed." >&2
  exit 1
else
  echo "Usage: vps-maintenance.sh begin|end ktga-capacity-UNIQUE" >&2
  exit 1
fi
