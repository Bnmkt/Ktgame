#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Run with sudo bash deploy/debian/install.sh.' >&2; exit 1; fi
# shellcheck source=/dev/null
source /etc/os-release
if [[ ${ID:-} != debian || ${VERSION_ID:-} != 13 ]]; then echo 'This installer targets Debian 13 only.' >&2; exit 1; fi
REPO=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
if [[ $REPO != /opt/ktga ]]; then echo 'Place this project in /opt/ktga first.' >&2; exit 1; fi

apt-get update
apt-get install -y ca-certificates curl gnupg git rsync openssl sqlite3 nginx certbot python3-certbot-nginx ufw fail2ban unattended-upgrades logrotate shellcheck dnsutils util-linux tar gzip age
if [[ ! -x /usr/bin/node ]] || ! /usr/bin/node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a>22 || a===22 && (b>13 || b===13 && c>=0) ? 0 : 1)'; then
    setup=$(mktemp)
    trap 'rm -f -- "$setup"' EXIT
    curl -fsSL https://deb.nodesource.com/setup_24.x -o "$setup"
    bash "$setup"
    apt-get install -y nodejs
fi
if [[ ! -x /usr/bin/npm ]]; then apt-get install -y npm; fi
getent group ktga >/dev/null || groupadd --system ktga
id ktga >/dev/null 2>&1 || useradd --system --gid ktga --home-dir /var/lib/ktga --shell /usr/sbin/nologin ktga
install -d -m 0750 -o ktga -g ktga /var/lib/ktga /opt/ktga/server/data
install -d -m 0700 /etc/ktga /var/backups/ktga
install -d -m 0755 /var/www/ktga /var/www/letsencrypt
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
if [[ ! -f /etc/ktga/server.env ]]; then
    install -m 0600 "$REPO/deploy/debian/server.env.example" /etc/ktga/server.env
    secret=$(openssl rand -hex 48)
    sed -i "s/replace-with-a-long-random-secret/$secret/" /etc/ktga/server.env
fi
install -m 0644 "$REPO/deploy/debian/ktga.service" /etc/systemd/system/ktga.service
install -m 0644 "$REPO/deploy/debian/nginx-common.conf" /etc/nginx/conf.d/ktga-common.conf
if [[ ! -f /etc/nginx/sites-available/ktga ]]; then
    install -m 0644 "$REPO/deploy/debian/nginx-http.conf" /etc/nginx/sites-available/ktga
fi
ln -sfn /etc/nginx/sites-available/ktga /etc/nginx/sites-enabled/ktga
install -m 0750 "$REPO/deploy/debian/backup.sh" /usr/local/sbin/ktga-backup
install -m 0755 "$REPO/deploy/debian/renew-hook.sh" /etc/letsencrypt/renewal-hooks/deploy/ktga-nginx
install -m 0644 "$REPO/deploy/debian/ktga-backup.service" /etc/systemd/system/ktga-backup.service
install -m 0644 "$REPO/deploy/debian/ktga-backup.timer" /etc/systemd/system/ktga-backup.timer
install -m 0644 "$REPO/deploy/debian/ktga-logrotate.conf" /etc/logrotate.d/ktga
node "$REPO/deploy/debian/nginx-capacity.mjs" --apply
nginx -t
systemctl daemon-reload
systemctl enable ktga.service
systemctl enable --now nginx certbot.timer
systemctl reload nginx
echo 'Installed. Edit /etc/ktga/server.env, install dependencies, migrate data, build the site and request TLS certificates using docs/DEPLOYMENT-DEBIAN-13.md.'
echo 'No firewall, SSH configuration, application start or scheduled backup has been enabled automatically.'
