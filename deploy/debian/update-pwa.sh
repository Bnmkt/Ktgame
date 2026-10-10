#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Run with sudo and one extracted PWA release directory.' >&2; exit 1; }
stage=$(realpath -- "$1")
[[ $stage == /tmp/ktga-pwa-release-* && -d $stage ]] || { echo 'Unexpected release directory.' >&2; exit 1; }
exec 9>/run/ktga-deployment.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
files=(
  client/index.html client/src/App.jsx client/src/privacy/Privacy.jsx client/src/privacy/LegalPage.jsx
  client/src/pwa/InstallNotice.jsx client/src/pwa/install.js client/src/pwa/install.css
  client/public/manifest.webmanifest client/public/sw.js client/public/offline.html
  client/public/pwa/icon-180.png client/public/pwa/icon-192.png
  client/public/pwa/icon-512.png client/public/pwa/icon-maskable-512.png
  deploy/debian/nginx-https.conf deploy/debian/update-pwa.sh
)
for file in "${files[@]}" client/dist/index.html client/dist-ssr/render.js; do
  [[ -f $stage/$file && ! -L $stage/$file ]] || { echo "Missing release file: $file" >&2; exit 1; }
done
node --check "$stage/client/public/sw.js"
systemctl is-active --quiet ktga.service
checkTables() {
  node --input-type=module <<'JS'
import fs from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
const require = createRequire("/opt/ktga/server/package.json");
const env = require("dotenv").parse(fs.readFileSync("/etc/ktga/server.env"));
if (!env.SQLITE_PATH?.startsWith("/var/lib/ktga/")) throw new Error("Unexpected production database.");
const db = new DatabaseSync(env.SQLITE_PATH, { readOnly: true });
const count = db.prepare("SELECT count(*) AS count FROM rooms WHERE coalesce(json_extract(data, '$.finished'),0)=0").get().count;
db.close();
if (count) { console.error("Active tables: deployment postponed."); process.exit(1); }
JS
}
checkTables
backup=/var/backups/ktga/pwa-$(date -u +%Y%m%dT%H%M%SZ)-$$
install -d -m 0700 "$backup"
tar -czf "$backup/code.tar.gz" -C /opt/ktga client/src client/public client/index.html client/dist-ssr deploy/debian
tar -czf "$backup/frontend.tar.gz" -C /var/www/ktga .
cp -p /etc/nginx/sites-available/ktga "$backup/nginx.conf"
changed=false
restarted=false
rollback() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 && $changed == true ]]; then
    echo 'Restoring the previous frontend, public renderer and Nginx configuration.' >&2
    tar -xzf "$backup/code.tar.gz" -C /opt/ktga
    tar -xzf "$backup/frontend.tar.gz" -C /var/www/ktga
    cp -p "$backup/nginx.conf" /etc/nginx/sites-available/ktga
    nginx -t && systemctl reload nginx || true
    if [[ $restarted == true ]]; then systemctl restart ktga.service || true; fi
  fi
  exit "$status"
}
trap rollback EXIT
checkTables
changed=true
for file in "${files[@]}"; do install -D -m 0644 -o deploy -g deploy "$stage/$file" "/opt/ktga/$file"; done
# Retain previous hashed assets for browser tabs already open.
rsync -a --chown=root:root --chmod=D755,F644 "$stage/client/dist/" /var/www/ktga/
rsync -a --delete --chown=deploy:deploy --chmod=D755,F644 "$stage/client/dist-ssr/" /opt/ktga/client/dist-ssr/
install -m 0644 "$stage/deploy/debian/nginx-https.conf" /etc/nginx/sites-available/ktga
nginx -t
checkTables
systemctl reload nginx
restarted=true
systemctl restart ktga.service
ready=false
for ((attempt=0; attempt<45; attempt++)); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || { echo 'Service did not become healthy.' >&2; exit 1; }
curl -fsS https://api.ktga.me/api/health >/dev/null
document=$(curl -fsS https://www.ktga.me/)
[[ $document == *'rel="manifest"'* ]]
manifest=$(curl -fsS https://www.ktga.me/manifest.webmanifest)
[[ $manifest == *'KTGA.ME'* ]]
worker=$(curl -fsS https://www.ktga.me/sw.js)
[[ $worker == *'ktga-offline-v1'* ]]
changed=false
echo "PWA deployed. Private backup: $backup"
