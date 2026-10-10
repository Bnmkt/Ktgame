#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Run with sudo and one extracted release directory.' >&2; exit 1; }
stage=$(realpath -- "$1")
[[ $stage == /tmp/ktga-presentation-release-* && -d $stage ]] || { echo 'Unexpected release directory.' >&2; exit 1; }
exec 9>/run/ktga-deployment.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
files=(
  server/src/index.js server/src/services/public-pages.js server/src/services/room-entry.js
  server/src/services/game-images.js
  client/src/App.jsx client/src/config/site.js client/src/seo/render.jsx
  client/src/pages/AdminPage.jsx client/src/pages/AuthPage.jsx client/src/pages/LobbyPage.jsx
  client/src/pages/PublicGamesPage.jsx client/src/pages/public-games.css
  client/src/components/admin/CasinoSettings.jsx client/src/components/game/GameArtwork.jsx
  client/src/components/admin/GameImageEditor.jsx client/src/components/admin/game-image-editor.css
  client/src/features/games/artwork-crop.js
  client/src/components/game/game-artwork.css client/src/features/games/presentation.js
  deploy/debian/update-game-presentation.sh deploy/debian/nginx-https.conf
)
for file in "${files[@]}" client/dist/index.html client/dist-ssr/render.js; do
  [[ -f $stage/$file && ! -L $stage/$file ]] || { echo "Missing release file: $file" >&2; exit 1; }
done
node --check "$stage/server/src/index.js"
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
backup=/var/backups/ktga/presentation-$(date -u +%Y%m%dT%H%M%SZ)-$$
install -d -m 0700 "$backup"
tar -czf "$backup/code.tar.gz" -C /opt/ktga server/src client/src client/dist-ssr deploy/debian
tar -czf "$backup/frontend.tar.gz" -C /var/www/ktga .
stopped=false
rollback() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 && $stopped == true ]]; then
    systemctl stop ktga.service || true
    tar -xzf "$backup/code.tar.gz" -C /opt/ktga
    tar -xzf "$backup/frontend.tar.gz" -C /var/www/ktga
    systemctl start ktga.service || true
  fi
  exit "$status"
}
trap rollback EXIT
checkTables
stopped=true
systemctl stop ktga.service
checkTables
tar -czf "$backup/data.tar.gz" -C / var/lib/ktga
if [[ -n ${KTGA_FEATURED_GAME:-} ]]; then
  node --input-type=module <<'JS'
import fs from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { games } from "/opt/ktga/server/src/games/shared.js";
const id = process.env.KTGA_FEATURED_GAME;
if (!games.some((game) => game.id === id)) throw new Error("Unknown featured game.");
const require = createRequire("/opt/ktga/server/package.json");
const env = require("dotenv").parse(fs.readFileSync("/etc/ktga/server.env"));
if (!env.SQLITE_PATH?.startsWith("/var/lib/ktga/")) throw new Error("Unexpected production database.");
const db = new DatabaseSync(env.SQLITE_PATH);
try {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'admin-settings'").get();
  if (!row || JSON.parse(row.value).games?.[id]?.enabled === false) throw new Error("Featured game unavailable.");
  db.prepare("UPDATE meta SET value = json_set(value, '$.platform.featuredGameId', ?) WHERE key = 'admin-settings'").run(id);
} finally { db.close(); }
console.log("Requested featured game configured.");
JS
fi
for file in "${files[@]}"; do install -D -m 0644 -o deploy -g deploy "$stage/$file" "/opt/ktga/$file"; done
# Keep previous hashed assets for tabs already open.
rsync -a --chown=root:root --chmod=D755,F644 "$stage/client/dist/" /var/www/ktga/
rsync -a --delete --chown=deploy:deploy --chmod=D755,F644 "$stage/client/dist-ssr/" /opt/ktga/client/dist-ssr/
systemctl start ktga.service
ready=false
for ((attempt=0; attempt<45; attempt++)); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || { echo 'Service did not become healthy.' >&2; exit 1; }
curl -fsS https://api.ktga.me/api/config | node -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>{if(!Object.hasOwn(JSON.parse(s),"featuredGameId"))process.exit(1)})'
curl -fsS https://api.ktga.me/api/games | node -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>{if(!JSON.parse(s).every(g=>typeof g.coverImage==="string"&&typeof g.descriptiveImage==="string"))process.exit(1)})'
curl -fsS https://www.ktga.me/manifest.webmanifest >/dev/null
node --input-type=module <<'JS'
const games = await (await fetch("https://www.ktga.me/api/games")).json();
const paths = new Set(games.flatMap((game) => [game.coverImage, game.descriptiveImage]).filter((value) => /^\/api\/game-images\/[a-f0-9]{64}\.png$/.test(value)));
for (const path of paths) {
  const response = await fetch(`https://www.ktga.me${path}`, { method: "HEAD" });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error("A configured game image cannot be loaded from the website.");
}
JS
stopped=false
echo "Game presentation deployed. Private backup: $backup"
