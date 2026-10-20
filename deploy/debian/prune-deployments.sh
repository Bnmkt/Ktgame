#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
exec 9>/run/ktga-deployment.lock
flock -w 600 9 || { echo 'Deployment still active; cleanup deferred.'; exit 0; }
exec /usr/bin/node /usr/local/libexec/ktga-deployment-retention.mjs "$@"
