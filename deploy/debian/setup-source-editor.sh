#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
here=$(cd -- "$(dirname -- "$0")" && pwd)
id ktga-build >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ktga-build
install -d -m 0755 /var/lib/ktga-build
install -d -m 0750 -o root -g ktga /var/lib/ktga/source-editor /var/lib/ktga/source-editor/results
install -d -m 0750 -o ktga -g ktga /var/lib/ktga/source-editor/queue /var/lib/ktga/source-editor/drafts
install -d -m 0755 /usr/local/libexec
install -o root -g root -m 0644 "$here/apply-source-changes.mjs" /usr/local/libexec/ktga-source-apply.mjs
install -o root -g root -m 0644 "$here/ktga-source-apply.service" "$here/ktga-source-apply.path" /etc/systemd/system/
install -o root -g root -m 0644 /dev/null /etc/ktga/source-editor.enabled
systemctl daemon-reload
systemctl enable --now ktga-source-apply.path
