#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Run with sudo and a release directory.' >&2; exit 1; }
stage=$(realpath -- "$1")
[[ $stage == /tmp/ktga-desktop-release-* && -d $stage ]] || exit 1
files=(server/src/index.js server/src/services/desktop-supervision.js server/src/services/online-presence.js)
for file in "${files[@]}"; do [[ -f $stage/$file && ! -L $stage/$file ]] || exit 1; done
exec 9>/run/ktga-deployment.lock
flock -n 9 || exit 1
systemctl is-active --quiet ktga.service || exit 1
checkTables() {
  node --input-type=module <<'JS'
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire('/opt/ktga/server/package.json');
const env=require('dotenv').parse(fs.readFileSync('/etc/ktga/server.env'));
if (!env.SQLITE_PATH?.startsWith('/var/lib/ktga/')) throw new Error('Unexpected data path');
const db=new DatabaseSync(env.SQLITE_PATH,{readOnly:true});
const count=db.prepare("SELECT count(*) AS n FROM rooms WHERE coalesce(json_extract(data, '$.finished'),0)=0").get().n;
db.close(); if(count) {console.error('Active tables: restart postponed.');process.exit(1);}
JS
}
checkTables
backup=/var/backups/ktga/desktop-$(date -u +%Y%m%dT%H%M%SZ)-$$
install -d -m 0700 "$backup"
tar -czf "$backup/code.tar.gz" -C /opt/ktga server/src
stopped=false
rollback() {
  local result=$?
  trap - EXIT
  if [[ $result -ne 0 && $stopped == true ]]; then
    tar -xzf "$backup/code.tar.gz" -C /opt/ktga
    systemctl restart ktga.service || true
  fi
  exit "$result"
}
trap rollback EXIT
checkTables
stopped=true
systemctl stop ktga.service
checkTables
for file in "${files[@]}"; do install -D -m 0644 -o deploy -g deploy "$stage/$file" "/opt/ktga/$file"; done
systemctl start ktga.service
ready=false
for ((attempt=0;attempt<60;attempt++)); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || exit 1
curl -fsS https://api.ktga.me/api/health >/dev/null
[[ $(curl -s -o /dev/null -w '%{http_code}' https://api.ktga.me/api/desktop/overview) == 401 ]] || exit 1
stopped=false
echo "Desktop API ready. Private backup: $backup"
