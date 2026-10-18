#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
here=$(cd -- "$(dirname -- "$0")" && pwd)
exec 9>/run/ktga-deployment.lock
flock -w 600 9
id ktga-build >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ktga-build
install -d -m 0755 /var/lib/ktga-build
install -d -m 0755 /var/lib/ktga-build-tools
# Build dependencies are separate from the running application's node_modules.
key=$(node --input-type=module - "$here/source-build-environment.mjs" <<'JS'
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { sourceBuildKey } = await import(pathToFileURL(process.argv[2]));
console.log(sourceBuildKey(await fs.readFile("/opt/ktga/client/package.json"), await fs.readFile("/opt/ktga/client/package-lock.json")));
JS
)
[[ $key =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid dependency key.' >&2; exit 1; }
dependencies=/var/lib/ktga-build-tools/$key
if [[ ! -f $dependencies/.ready ]]; then
  temporary=$(mktemp -d /var/lib/ktga-build-tools/.install-XXXXXXXX)
  trap 'rm -rf -- "$temporary"' EXIT
  cp /opt/ktga/client/package.json /opt/ktga/client/package-lock.json "$temporary/"
  chown -R ktga-build:ktga-build "$temporary"
  runuser -u ktga-build -- env -i PATH=/usr/bin:/bin HOME="$temporary" npm ci --prefix "$temporary" --cache "$temporary/.npm-cache" --userconfig=/dev/null --globalconfig="$temporary/.npm-globalrc" --ignore-scripts --include=dev --no-audit --no-fund
  rm -rf -- "$temporary/.npm-cache"
  printf '%s\n' "$key" > "$temporary/.ready"
  chown -R root:root "$temporary"
  chmod -R a+rX,go-w "$temporary"
  mv -T -- "$temporary" "$dependencies"
  trap - EXIT
fi
install -d -m 0750 -o root -g ktga /var/lib/ktga/source-editor /var/lib/ktga/source-editor/results
install -d -m 0750 -o ktga -g ktga /var/lib/ktga/source-editor/queue /var/lib/ktga/source-editor/drafts
install -d -m 0755 /usr/local/libexec
install -o root -g root -m 0644 "$here/apply-source-changes.mjs" /usr/local/libexec/ktga-source-apply.mjs
install -o root -g root -m 0644 "$here/source-build-environment.mjs" /usr/local/libexec/source-build-environment.mjs
install -o root -g root -m 0644 "$here/ktga-source-apply.service" "$here/ktga-source-apply.path" /etc/systemd/system/
install -o root -g root -m 0644 /dev/null /etc/ktga/source-editor.enabled
systemctl daemon-reload
systemctl enable --now ktga-source-apply.path
