#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 2 ]] || { echo 'Run with sudo, the nginx template and a private backup directory.' >&2; exit 1; }
source=$(realpath -- "$1")
backup=$(realpath -- "$2")
[[ -f $source && ! -L $source && $backup == /var/backups/ktga/* && -d $backup && ! -L $backup ]] || exit 1
site=/etc/nginx/sites-available/ktga
[[ -f $site && ! -L $site ]] || exit 1
restore() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 && -f $backup/nginx-site.conf ]]; then
    install -m 0644 "$backup/nginx-site.conf" "$site"
    nginx -t && systemctl reload nginx || true
  fi
  exit "$status"
}
trap restore EXIT
node --input-type=module - "$source" "$site" "$backup" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const [source,site,backup]=process.argv.slice(2);
const template=fs.readFileSync(source,'utf8').replace(/\r\n/g,'\n');
const original=fs.readFileSync(site,'utf8');
const current=original.replace(/\r\n/g,'\n');
const start='    location = /discord-activity ';
const end='    location ^~ /assets/ {';
const first=template.indexOf(start),last=template.indexOf(end,first);
if(first<0||last<=first||template.indexOf(start,first+1)!==-1)throw Error('Invalid activity template.');
const block=template.slice(first,last);
if(current.includes(block)){console.log('Discord activity proxy already configured.');process.exit(0);}
if(current.includes('/discord-activity'))throw Error('Existing custom activity configuration: manual review required.');
const index=current.indexOf(end),www=current.indexOf('server_name www.ktga.me;');
if(www<0||index<www||current.indexOf(end,index+1)!==-1)throw Error('Unexpected website configuration.');
fs.writeFileSync(path.join(backup,'nginx-site.conf'),original,{flag:'wx',mode:0o600});
const temporary=`${site}.activity-${process.pid}.tmp`;
fs.writeFileSync(temporary,current.slice(0,index)+block+current.slice(index),{flag:'wx',mode:0o644});
try{fs.renameSync(temporary,site);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
JS
nginx -t
systemctl reload nginx
