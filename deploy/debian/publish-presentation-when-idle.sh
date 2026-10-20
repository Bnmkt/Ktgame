#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 2 ]] || { echo 'Run as root with a release directory and timer unit.' >&2; exit 1; }
stage=$(realpath -- "$1")
timer=$2
[[ ( $stage == /var/tmp/ktga-presentation-release-* || $stage == /tmp/ktga-presentation-release-* ) && -d $stage && ! -L $1 && $timer =~ ^ktga-idle-[a-f0-9]{7,40}\.timer$ ]] || { echo 'Unexpected deployment target.' >&2; exit 1; }
unset KTGA_ALLOW_ACTIVE_TABLES
count=$(node --input-type=module <<'JS'
import fs from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
const require = createRequire("/opt/ktga/server/package.json");
const env = require("dotenv").parse(fs.readFileSync("/etc/ktga/server.env"));
if (!env.SQLITE_PATH?.startsWith("/var/lib/ktga/")) throw new Error("Unexpected production database.");
const db = new DatabaseSync(env.SQLITE_PATH, { readOnly: true });
try { console.log(db.prepare("SELECT count(*) AS count FROM rooms WHERE coalesce(json_extract(data,'$.finished'),0)=0").get().count); }
finally { db.close(); }
JS
)
[[ $count =~ ^[0-9]+$ ]] || { echo 'Invalid room count.' >&2; exit 1; }
if (( count > 0 )); then
  echo "Publication deferred: $count open table(s)."
  exit 0
fi
# The deployment script rechecks the condition before and after stopping the service.
if ! bash "$stage/deploy/debian/update-game-presentation.sh" "$stage"; then
  systemctl stop "$timer"
  echo 'Publication failed; automatic retries stopped. Inspect the service journal before retrying.' >&2
  exit 1
fi
systemctl stop "$timer"
echo 'Idle publication completed; timer stopped.'
