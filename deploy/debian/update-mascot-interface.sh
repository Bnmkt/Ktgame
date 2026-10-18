#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Run with sudo and one release directory.' >&2; exit 1; }
stage=$(realpath -- "$1")
[[ $stage == /tmp/ktga-mascot-release-* && -d $stage ]] || exit 1
exec 9>/run/ktga-deployment.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
files=(
  client/src/pages/AuthPage.jsx client/src/pages/auth-experience.css
  client/src/pages/LobbyPage.jsx client/src/pages/ProfilePage.jsx client/src/pages/CommunityEventPage.jsx
  client/src/components/profile/GameProgression.jsx
  client/src/components/room/RoomPanels.jsx client/src/components/room/ClassicCompletion.jsx
  client/src/components/mascots/Mascot.jsx client/src/components/mascots/mascot.css
  client/src/features/mascots/catalog.js client/src/locales/fr.json client/src/locales/en.json
)
for file in "${files[@]}" client/dist/index.html client/dist-ssr/render.js; do
  [[ -f $stage/$file && ! -L $stage/$file ]] || { echo "Missing file: $file" >&2; exit 1; }
done
checkState() {
  node --input-type=module - "$stage" <<'JS'
import fs from "node:fs";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
const require = createRequire("/opt/ktga/server/package.json");
const env = require("dotenv").parse(fs.readFileSync("/etc/ktga/server.env"));
if (!env.SQLITE_PATH?.startsWith("/var/lib/ktga/") || fs.existsSync(`${env.SQLITE_PATH}.reset-pending.json`)) throw new Error("Incompatible database state.");
const db = new DatabaseSync(env.SQLITE_PATH, {readOnly:true});
try { if (db.prepare("SELECT count(*) AS n FROM rooms WHERE coalesce(json_extract(data,'$.finished'),0)=0").get().n) throw new Error("Open tables: deployment postponed."); } finally { db.close(); }
for (const [file, expected] of Object.entries(JSON.parse(fs.readFileSync(`${process.argv[2]}/source-baseline.json`)))) {
  if (!/^client\/src\/[a-zA-Z0-9_./-]+$/.test(file)) throw new Error("Invalid baseline path.");
  const target = `/opt/ktga/${file}`;
  const current = fs.existsSync(target) ? createHash("sha256").update(fs.readFileSync(target)).digest("hex") : null;
  if (current !== expected) throw new Error(`Live sources changed: ${file}`);
}
JS
}
checkState
backup=/var/backups/ktga/mascots-$(date -u +%Y%m%dT%H%M%SZ)-$$
install -d -m 0700 "$backup"
entries=(src dist-ssr)
[[ ! -d /opt/ktga/client/public/mascotte_assets ]] || entries+=(public/mascotte_assets)
tar -czf "$backup/client.tar.gz" -C /opt/ktga/client "${entries[@]}"
tar -czf "$backup/frontend.tar.gz" -C /var/www/ktga .
stopped=false
rollback() {
  status=$?
  trap - EXIT
  if [[ $status -ne 0 && $stopped == true ]]; then
    systemctl stop ktga.service || true
    tar -xzf "$backup/client.tar.gz" -C /opt/ktga/client
    tar -xzf "$backup/frontend.tar.gz" -C /var/www/ktga
    systemctl start ktga.service || true
  fi
  exit "$status"
}
trap rollback EXIT
checkState
systemctl stop ktga.service
stopped=true
checkState
for file in "${files[@]}"; do install -D -m 0644 -o deploy -g deploy "$stage/$file" "/opt/ktga/$file"; done
install -d -o deploy -g deploy -m 0755 /opt/ktga/client/public/mascotte_assets
rsync -a --chown=deploy:deploy --chmod=D755,F644 "$stage/client/public/mascotte_assets/" /opt/ktga/client/public/mascotte_assets/
rsync -a --chown=root:root --chmod=D755,F644 "$stage/client/dist/" /var/www/ktga/
rsync -a --delete --chown=deploy:deploy --chmod=D755,F644 "$stage/client/dist-ssr/" /opt/ktga/client/dist-ssr/
systemctl start ktga.service
ready=false
for ((attempt=0; attempt<45; attempt++)); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || { echo 'Application did not become healthy.' >&2; exit 1; }
curl -fsS https://www.ktga.me/ >/dev/null
curl -fsS https://www.ktga.me/mascotte_assets/ui/lucky-welcome-360.webp >/dev/null
stopped=false
echo "Mascot interface deployed. Private backup: $backup"
