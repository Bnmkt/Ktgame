#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-ktgapi.netdis.org}"
APP_USER="${2:-$USER}"
EXPECTED_IP="${3:-94.106.131.148}"

echo "Installing deployment prerequisites..."
sudo apt update
sudo apt install -y certbot acl curl ca-certificates

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. Installing Node.js 22 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Node.js >=22 is required. Current version: $(node -v)"
  exit 1
fi

RESOLVED_IPS="$(getent ahostsv4 "${DOMAIN}" | awk '{ print $1 }' | sort -u | tr '\n' ' ')"
if ! printf '%s' "${RESOLVED_IPS}" | grep -q "\b${EXPECTED_IP}\b"; then
  echo "${DOMAIN} does not resolve to ${EXPECTED_IP}."
  echo "Resolved IPv4 addresses: ${RESOLVED_IPS:-none}"
  echo "Fix DNS before requesting the certificate."
  exit 1
fi

echo "Opening firewall ports if ufw is available..."
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 80/tcp
  sudo ufw allow 4000/tcp
fi

echo "Requesting Let's Encrypt certificate for ${DOMAIN}..."
if [ -n "${EMAIL:-}" ]; then
  sudo certbot certonly --standalone --agree-tos --non-interactive -m "${EMAIL}" -d "${DOMAIN}"
else
  sudo certbot certonly --standalone --agree-tos --non-interactive --register-unsafely-without-email -d "${DOMAIN}"
fi

echo "Allowing ${APP_USER} to read certificate files..."
sudo setfacl -m "u:${APP_USER}:rx" /etc/letsencrypt/live /etc/letsencrypt/archive
sudo setfacl -m "u:${APP_USER}:rx" "/etc/letsencrypt/live/${DOMAIN}"
sudo setfacl -m "u:${APP_USER}:rx" "/etc/letsencrypt/archive/${DOMAIN}"
sudo setfacl -m "u:${APP_USER}:r" "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
sudo setfacl -m "u:${APP_USER}:r" "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

echo "Installing renewal permission hook..."
sudo tee "/etc/letsencrypt/renewal-hooks/deploy/ktga-${DOMAIN}-acl.sh" >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
setfacl -m "u:${APP_USER}:rx" /etc/letsencrypt/live /etc/letsencrypt/archive
setfacl -m "u:${APP_USER}:rx" "/etc/letsencrypt/live/${DOMAIN}"
setfacl -m "u:${APP_USER}:rx" "/etc/letsencrypt/archive/${DOMAIN}"
setfacl -m "u:${APP_USER}:r" "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
setfacl -m "u:${APP_USER}:r" "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
EOF
sudo chmod +x "/etc/letsencrypt/renewal-hooks/deploy/ktga-${DOMAIN}-acl.sh"

echo "Done."
echo "Use these server/.env values:"
echo "HTTPS_KEY_PATH=/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
echo "HTTPS_CERT_PATH=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
