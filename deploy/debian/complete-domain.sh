#!/usr/bin/env bash
set -euo pipefail
: "${EXPECTED_VPS_IPV4:?Define the expected VPS IPv4.}"
: "${EXPECTED_VPS_IPV6:?Define the expected VPS IPv6.}"
certificate=/etc/letsencrypt/live/ktga.me/fullchain.pem
if openssl x509 -in "$certificate" -noout -ext subjectAltName | grep -Eq 'DNS:ktga\.me([,[:space:]]|$)'; then
    systemctl disable --now ktga-domain.timer
    echo 'The certificate already covers the root domain.'
    exit 0
fi
address=$(dig +short A ktga.me @1.1.1.1)
ipv6=$(dig +short AAAA ktga.me @1.1.1.1)
if [[ $address != "$EXPECTED_VPS_IPV4" || -n $ipv6 && $ipv6 != "$EXPECTED_VPS_IPV6" ]]; then
    echo 'Waiting for ktga.me DNS to point exclusively to this VPS. No certificate request made.'
    exit 0
fi
certbot certonly --webroot -w /var/www/letsencrypt --cert-name ktga.me --expand \
    -d www.ktga.me -d api.ktga.me -d ktga.me --email contact@netdis.org --agree-tos --non-interactive
nginx -t
systemctl reload nginx
systemctl disable --now ktga-domain.timer
echo 'Root-domain HTTPS and its redirect are ready. Automatic completion disabled.'
