#!/usr/bin/env bash
# A scoped client release built on the current live source, retaining site customizations.
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Run as root with one extracted tables release.' >&2; exit 1; }
stage=$(realpath -- "$1")
[[ $stage == /var/tmp/ktga-tables-release-* && -d $stage && ! -L $1 ]] || { echo 'Unexpected release directory.' >&2; exit 1; }
[[ -f $stage/source-manifest.json && -d $stage/incoming/client/src ]] || { echo 'Incomplete release.' >&2; exit 1; }
exec 9>/run/ktga-deployment.lock
flock -w 120 9 || { echo 'Another deployment is still active.' >&2; exit 1; }
node - "$stage" <<'JS'
const fs=require('node:fs'),path=require('node:path'),stage=process.argv[2];
const defaults=[
 'client/src/components/game/GameBoards.jsx','client/src/components/game/GameSupport.jsx',
 'client/src/components/game/BlackjackTable.jsx','client/src/components/room/TableInterface.jsx',
 'client/src/components/room/table-interface.css','client/src/components/room/table-stage.css',
 'client/src/features/games/table-interface.js','client/src/pages/RoomPage.jsx',
 'client/src/locales/fr.json','client/src/locales/en.json'
];
const allowed=new Set([...defaults,
 'client/src/components/game/PresidentTable.jsx','client/src/components/game/president-table.css',
 'client/src/components/game/usePresidentHand.js','client/src/components/game/usePresidentDeal.js',
 'client/src/components/game/CardMotionSurface.jsx','client/src/features/games/president.js',
 'server/src/games/engines/president.js'
]);
const manifest=JSON.parse(fs.readFileSync(path.join(stage,'source-manifest.json')));
const files=manifest.files ?? defaults;
if(!Array.isArray(files)||!files.length||files.some(file=>!allowed.has(file))||new Set(files).size!==files.length) throw Error('Invalid scoped release files');
fs.writeFileSync(path.join(stage,'release-files.txt'),files.join('\n')+'\n');
JS
mapfile -t files < "$stage/release-files.txt"
for file in "${files[@]}"; do
  [[ -f $stage/incoming/$file && ! -L $stage/incoming/$file ]] || { echo "Missing release source: $file" >&2; exit 1; }
done
checkTables() {
  node <<'JS'
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const env = require('/opt/ktga/server/node_modules/dotenv').parse(fs.readFileSync('/etc/ktga/server.env'));
if (!env.SQLITE_PATH?.startsWith('/var/lib/ktga/')) throw Error('Unexpected database path');
if (fs.existsSync(env.SQLITE_PATH + '.reset-pending.json')) throw Error('A gameplay reset is pending');
const db = new DatabaseSync(env.SQLITE_PATH, { readOnly: true });
try {
  const {count} = db.prepare("SELECT count(*) AS count FROM rooms WHERE coalesce(json_extract(data,'$.finished'),0)=0").get();
  if (count) { console.error(`Publication postponed: ${count} open table(s).`); process.exitCode = 75; }
} finally { db.close(); }
JS
}
systemctl is-active --quiet ktga.service
checkTables
[[ ! -e $stage/workspace ]] || { echo 'Build workspace already exists; use a new release directory.' >&2; exit 1; }
install -d -m 0755 -o deploy -g deploy "$stage/workspace/client"
for entry in src public scripts index.html discord-activity vite.config.js package.json package-lock.json .env.production; do
  [[ -e /opt/ktga/client/$entry ]] || { echo "Missing live build input: $entry" >&2; exit 1; }
  cp -a "/opt/ktga/client/$entry" "$stage/workspace/client/$entry"
done
ln -s /opt/ktga/client/node_modules "$stage/workspace/client/node_modules"
ln -s /opt/ktga/server "$stage/workspace/server"
ln -s /opt/ktga/desktop "$stage/workspace/desktop"
node - "$stage" "${files[@]}" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [stage, ...files] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(stage,'source-manifest.json')));
if (!/^[a-f0-9]{40}$/.test(manifest.commit)) throw Error('Invalid release commit');
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename,'utf8').replace(/\r\n/g,'\n')).digest('hex');
function snapshot(directory) {
  const result = {};
  function walk(folder) { for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const filename=path.join(folder,entry.name);
    if (entry.isSymbolicLink()) throw Error('Unexpected source symlink');
    if (entry.isDirectory()) walk(filename); else result[path.relative(directory,filename)] = hash(filename);
  }}
  walk(directory);
  result['/server/president.js']=hash('/opt/ktga/server/src/games/engines/president.js');
  return result;
}
fs.writeFileSync(path.join(stage,'live-source-state.json'),JSON.stringify(snapshot('/opt/ktga/client/src')));
for (const relative of files) {
  const live=path.join('/opt/ktga',relative), incoming=path.join(stage,'incoming',relative);
  // workspace/server points to production for read-only build dependencies.
  // Stage server updates separately so preparing a release cannot alter live code.
  const destination=path.join(stage,relative.startsWith('server/')?'server-source':'workspace',relative);
  if (relative.startsWith('client/src/locales/')) {
    const language=path.basename(relative,'.json');
    const current=JSON.parse(fs.readFileSync(live));
    for (const [key,value] of Object.entries(manifest.translations[language])) if (!Object.hasOwn(current,key)) current[key]=value;
    fs.writeFileSync(destination,JSON.stringify(current,null,2)+'\n');
    continue;
  }
  const current=fs.existsSync(live) ? hash(live) : null;
  if (current !== null && current !== manifest.base[relative] && current !== hash(incoming)) throw Error(`Live source changed outside this release: ${relative}`);
  fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.copyFileSync(incoming,destination);
}
console.log(`Prepared table release ${manifest.commit.slice(0,7)} from current production source.`);
JS
chown -R deploy:deploy "$stage/workspace/client"
chmod 0755 "$stage" "$stage/workspace"
# The root shell deliberately owns this private deployment log.
# shellcheck disable=SC2024
sudo -u deploy bash -c 'cd "$1/workspace/client" && npm run build:prod' _ "$stage" >"$stage/build.log" 2>&1 || { tail -n 35 "$stage/build.log"; exit 1; }
[[ -s $stage/workspace/client/dist/index.html && -s $stage/workspace/client/dist-ssr/render.js ]]
checkTables
# Source editor jobs may have arrived while building. Refuse an obsolete snapshot.
node - "$stage" <<'JS'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const previous=JSON.parse(fs.readFileSync(path.join(process.argv[2],'live-source-state.json'))),current={};
function walk(folder) { for(const entry of fs.readdirSync(folder,{withFileTypes:true})) {
 const filename=path.join(folder,entry.name); if(entry.isSymbolicLink()) throw Error('Unexpected source symlink');
 if(entry.isDirectory()) walk(filename); else current[path.relative('/opt/ktga/client/src',filename)]=crypto.createHash('sha256').update(fs.readFileSync(filename,'utf8').replace(/\r\n/g,'\n')).digest('hex');
}}
walk('/opt/ktga/client/src');
current['/server/president.js']=crypto.createHash('sha256').update(fs.readFileSync('/opt/ktga/server/src/games/engines/president.js','utf8').replace(/\r\n/g,'\n')).digest('hex');
if(JSON.stringify(previous)!==JSON.stringify(current)) throw Error('Live source changed during the build; rebuild the release.');
JS
backup=/var/backups/ktga/tables-$(date -u +%Y%m%dT%H%M%SZ)-$$
install -d -m 0700 "$backup"
tar -czf "$backup/code.tar.gz" -C /opt/ktga client/src client/dist-ssr server/src/games/engines/president.js
tar -czf "$backup/frontend.tar.gz" -C /var/www/ktga .
stopped=false
changed=false
rollback() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 ]]; then
    if [[ $changed == true ]]; then
      systemctl stop ktga.service || true
      tar -xzf "$backup/code.tar.gz" -C /opt/ktga
      tar -xzf "$backup/frontend.tar.gz" -C /var/www/ktga
    fi
    if [[ $stopped == true ]]; then systemctl start ktga.service || true; fi
    echo "Table release failed. Previous build retained/restored. Backup: $backup" >&2
  fi
  exit "$status"
}
trap rollback EXIT
checkTables
systemctl stop ktga.service
stopped=true
checkTables
changed=true
for file in "${files[@]}"; do
  source="$stage/workspace/$file"
  if [[ $file == server/* ]]; then source="$stage/server-source/$file"; fi
  install -D -m 0644 -o deploy -g deploy "$source" "/opt/ktga/$file"
done
# Retain old hashed assets for existing tabs; publish entry documents last.
rsync -a --chown=root:root --chmod=D755,F644 --exclude=/index.html --exclude=/discord-activity/index.html "$stage/workspace/client/dist/" /var/www/ktga/
rsync -a --delete --chown=deploy:deploy --chmod=D755,F644 "$stage/workspace/client/dist-ssr/" /opt/ktga/client/dist-ssr/
install -m 0644 "$stage/workspace/client/dist/index.html" /var/www/ktga/.tables-index.html
mv /var/www/ktga/.tables-index.html /var/www/ktga/index.html
install -m 0644 "$stage/workspace/client/dist/discord-activity/index.html" /var/www/ktga/discord-activity/.tables-index.html
mv /var/www/ktga/discord-activity/.tables-index.html /var/www/ktga/discord-activity/index.html
systemctl start ktga.service
ready=false
for ((attempt=0; attempt<45; attempt++)); do
  if curl -fsS --max-time 2 http://127.0.0.1:4000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || { echo 'Service did not become healthy.' >&2; exit 1; }
node - "$stage" <<'JS'
const fs=require('node:fs'),path=require('node:path');
const stage=process.argv[2];
(async()=>{
 const html=await (await fetch('https://www.ktga.me/',{signal:AbortSignal.timeout(15000)})).text();
 const expected=fs.readFileSync(path.join(stage,'workspace/client/dist/index.html'),'utf8');
 const script=expected.match(/<script[^>]+src="([^"]+)"/g)?.map(value=>value.match(/src="([^"]+)"/)[1]).find(value=>value.includes('/assets/'));
 if(!script || !html.includes(script)) throw Error('Public HTML still points to the previous build');
 for(const url of ['https://api.ktga.me/api/health',new URL(script,'https://www.ktga.me').href]) if(!(await fetch(url,{signal:AbortSignal.timeout(15000)})).ok) throw Error(`Publication check failed: ${url}`);
 const manifest=JSON.parse(fs.readFileSync(path.join(stage,'source-manifest.json')));
 fs.writeFileSync('/opt/ktga/.table-interface-release.json',JSON.stringify({commit:manifest.commit,publishedAt:new Date().toISOString(),entry:script})+'\n',{mode:0o644});
 console.log(`Verified public entry: ${script}`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
JS
stopped=false
changed=false
echo "Tables deployed. Private backup: $backup"
