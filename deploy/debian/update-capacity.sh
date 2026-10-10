#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ $# -ge 1 && $# -le 2 ]] || { echo 'Expected a private extracted release directory and optional --enable-game-workers.' >&2; exit 1; }
enableGames=false
if [[ $# -eq 2 ]]; then
  [[ $2 == --enable-game-workers ]] || { echo 'Unknown deployment option.' >&2; exit 1; }
  enableGames=true
fi
stage=$(realpath -- "$1")
[[ $stage == /tmp/ktga-capacity-release-* && -d $stage ]] || { echo 'Unexpected release directory.' >&2; exit 1; }
exec 9>/run/ktga-deployment.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
files=(
  server/package.json server/src/index.js server/src/db.js
  server/src/services/configuration-cache.js server/src/services/lobby-broadcast.js
  server/src/services/player-progress-cache.js
  server/src/services/time.js server/src/services/room-credentials.js server/src/services/production-config.js
  server/src/services/cache-telemetry.js server/src/services/duration-telemetry.js
  server/src/services/password-work.js server/src/services/password-worker.js
  server/src/services/task-pool.js server/src/services/service-execution.js server/src/services/execution-history.js
  server/src/services/account-domain.js server/src/services/account-tasks.js server/src/services/accounts-work.js
  server/src/services/accounts-process.js server/src/services/process-worker.js server/src/services/process-health.js
  server/src/services/room-runtime.js server/src/services/room-commands.js server/src/services/ranked-room-runtime.js
  server/src/services/game-gateway.js server/src/services/game-workers.js server/src/services/game-ipc-transport.js
  server/src/services/game-room-kernel.js server/src/services/game-worker-process.js
  server/src/services/room-directory.js
  server/src/services/desktop-supervision.js
  server/src/services/capacity-config.js server/src/services/capacity-tests.js
  server/scripts/capacity/admin-runner.mjs server/scripts/capacity/serve.mjs server/scripts/capacity/run.mjs
  server/scripts/capacity/compare.mjs
  server/scripts/capacity/common.mjs server/scripts/capacity/actions.mjs server/scripts/capacity/inspect.mjs server/scripts/capacity/profile.mjs
  server/scripts/capacity/reporting.mjs
  server/src/services/reading-work.js server/src/services/reading-worker.js server/src/services/reading-tasks.js
  server/src/storage/history-reader.js
  server/src/services/player-statistics.js server/src/services/ranked-runtime.js
  server/src/storage/room-write-scope.js server/src/storage/normalized.js server/src/storage/archives.js
  server/src/storage/selected-rows.js server/src/storage/sqlite-settings.js
  client/src/pages/LobbyPage.jsx client/src/pages/RoomPage.jsx client/src/pages/SpectatorPage.jsx
  client/src/pages/CommunityEventPage.jsx client/src/components/social/useConversationInbox.js
  client/src/features/games/room-feed.js
  client/src/components/admin/ServerHealth.jsx client/src/components/admin/server-execution.css
  client/src/components/admin/CapacityTests.jsx client/src/components/admin/capacity-tests.css client/src/pages/AdminPage.jsx
  deploy/debian/nginx-capacity.mjs deploy/debian/update-capacity.sh
  deploy/debian/nginx-common.conf deploy/debian/nginx-https.conf deploy/debian/install.sh
)
for file in "${files[@]}"; do [[ -f $stage/$file && ! -L $stage/$file ]] || { echo "Missing release file: $file" >&2; exit 1; }; done
for file in "${files[@]}"; do
  if [[ $file == server/*.js || $file == server/*.mjs ]]; then node --check "$stage/$file"; fi
done
[[ -f $stage/client/dist/index.html ]] || { echo 'Missing built client.' >&2; exit 1; }
[[ -f $stage/client/dist-ssr/render.js ]] || { echo 'Missing public-page renderer.' >&2; exit 1; }
systemctl is-active --quiet ktga.service || { echo 'Production is not active; refusing to change its state.' >&2; exit 1; }
checkTables() {
  node --input-type=module <<'JS'
import fs from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
const require = createRequire("/opt/ktga/server/package.json");
const env = require("dotenv").parse(fs.readFileSync("/etc/ktga/server.env"));
if (!env.SQLITE_PATH?.startsWith("/var/lib/ktga/") || !fs.existsSync(env.SQLITE_PATH)) throw new Error("Unexpected production database.");
const db = new DatabaseSync(env.SQLITE_PATH, { readOnly:true });
const count = db.prepare("SELECT count(*) AS count FROM rooms WHERE coalesce(json_extract(data, '$.finished'),0)=0").get().count;
db.close();
if (count) { console.error("Tables still active; deployment postponed."); process.exit(1); }
JS
}
checkTables

backup=/var/backups/ktga/capacity-$(date -u +%Y%m%dT%H%M%SZ)-$$
install -d -m 0700 "$backup"
tar -czf "$backup/code.tar.gz" -C /opt/ktga server/package.json server/src server/scripts client/src client/dist-ssr deploy/debian
tar -czf "$backup/frontend.tar.gz" -C /var/www/ktga .
cp -p /etc/ktga/server.env "$backup/server.env"
stopped=false
rollback() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 && $stopped == true ]]; then
    echo 'Deployment failed; restoring the previous code and frontend.' >&2
    tar -xzf "$backup/code.tar.gz" -C /opt/ktga
    tar -xzf "$backup/frontend.tar.gz" -C /var/www/ktga
    cp -p "$backup/server.env" /etc/ktga/server.env
    systemctl restart ktga.service || true
  fi
  exit "$status"
}
trap rollback EXIT
# Recheck immediately before interruption; never restart an active table.
checkTables
stopped=true
systemctl stop ktga.service
checkTables
tar -czf "$backup/data.tar.gz" -C / var/lib/ktga
tar -tzf "$backup/data.tar.gz" >/dev/null
for file in "${files[@]}"; do
  install -D -m 0644 -o deploy -g deploy "$stage/$file" "/opt/ktga/$file"
done
# Content-hashed old assets stay available to already open browser tabs.
rsync -a --chown=root:root --chmod=D755,F644 "$stage/client/dist/" /var/www/ktga/
rsync -a --delete --chown=deploy:deploy --chmod=D755,F644 "$stage/client/dist-ssr/" /opt/ktga/client/dist-ssr/
if [[ $enableGames == true ]]; then
  # Preserve every existing setting and secret; only these two flags change.
  node --input-type=module <<'JS'
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/opt/ktga/server/package.json");
const filename = "/etc/ktga/server.env", text = fs.readFileSync(filename, "utf8");
const changes = { GAME_WORKERS_ENABLED: "1", GAME_WORKERS: "1" };
const prior = require("dotenv").parse(text);
const lines = text.split(/\r?\n/).filter((line) => !/^\s*(?:export\s+)?(?:GAME_WORKERS_ENABLED|GAME_WORKERS)\s*=/.test(line));
const updated = lines.join("\n").replace(/\n*$/, "\n") + Object.entries(changes).map(([key, value]) => `${key}=${value}\n`).join("");
const parsed = require("dotenv").parse(updated);
for (const [key, value] of Object.entries(prior)) if (!(key in changes) && parsed[key] !== value) throw new Error("Unrelated configuration changed.");
for (const [key, value] of Object.entries(changes)) if (parsed[key] !== value) throw new Error("Worker configuration not applied.");
const stat = fs.statSync(filename), temporary = `${filename}.release-${process.pid}`;
try {
  fs.writeFileSync(temporary, updated, { mode: stat.mode & 0o777, flag: "wx" });
  fs.chownSync(temporary, stat.uid, stat.gid); fs.renameSync(temporary, filename);
} finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
JS
else
  node /opt/ktga/deploy/debian/nginx-capacity.mjs --apply --reload
fi
systemctl start ktga.service
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || { echo 'New service did not become healthy.' >&2; exit 1; }
curl -fsS https://api.ktga.me/api/health >/dev/null
curl -fsS https://www.ktga.me/ >/dev/null
if [[ $enableGames == true ]]; then
  mainPid=$(systemctl show ktga.service -p MainPID --value)
  [[ $(pgrep -P "$mainPid" -f 'game-worker-process[.]js' | wc -l) -eq 1 ]] || { echo 'Expected exactly one Game Worker.' >&2; exit 1; }
fi
stopped=false
echo "Deployment healthy. Private backups: $backup"
