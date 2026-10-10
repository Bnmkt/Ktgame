# KTGA.ME : nouveau VPS Debian 13

Guide de mise en service et de migration, prepare le 7 octobre 2026.
Les fichiers prets a installer se trouvent dans `deploy/debian`.
Le compte rendu de l'installation realisee est en fin de document.

## Architecture cible

| Element | Adresse / emplacement |
| --- | --- |
| Site React | `https://www.ktga.me/` |
| Redirection du domaine nu | `https://ktga.me` vers `https://www.ktga.me` |
| API et Socket.IO | `https://api.ktga.me` |
| Node, non expose sur Internet | `http://127.0.0.1:4000` |
| Code | `/opt/ktga` |
| Build public, et uniquement le build | `/var/www/ktga` |
| Configuration privee | `/etc/ktga/server.env` |
| Bases et fichiers envoyes | `/var/lib/ktga` |
| Sauvegardes privees | `/var/backups/ktga` |

Nginx termine le TLS et transmet les requetes de l'API a Node. Le client
utilise les cookies HttpOnly de l'API et les WebSockets avec leurs origines
autorisees. Aucun certificat ni secret SMTP ne doit etre place dans le build.

Un seul coordinateur Node possede les salles, presences, files et ecritures.
Il lance un processus Comptes en lecture seule pour les projections de profils,
historiques, statistiques et catalogues, ainsi que le travail cryptographique.
Ce processus n'ouvre pas de port et reste dans le meme service systemd.
Ne pas lancer plusieurs copies du serveur HTTP, un cluster PM2 ou plusieurs
conteneurs ecrivains sur ces bases. Voir `docs/ACCOUNTS-PROCESS.md` pour la
repartition, les controles de charge et le retour arriere.

## Sommaire

1. [DNS et acces](#1-dns-et-acces)
2. [Compte operateur et protections](#2-compte-operateur-et-protections)
3. [Installer le projet et les outils](#3-installer-le-projet-et-les-outils)
4. [Configuration et emails](#4-configuration-et-emails)
5. [Migrer les donnees Windows](#5-migrer-les-donnees-windows)
6. [Dependances et build](#6-dependances-et-build)
7. [Certificats gratuits et HTTPS](#7-certificats-gratuits-et-https)
8. [Demarrage et premier administrateur](#8-demarrage-et-premier-administrateur)
9. [Verification de bout en bout](#9-verification-de-bout-en-bout)
10. [Exploitation, sauvegarde et restauration](#10-exploitation-sauvegarde-et-restauration)
11. [Depannage](#11-depannage)

## 1. DNS et acces

Prevoir un VPS Debian 13 amd64 ou arm64, un acces SSH par cle et un acces
console de secours chez l'hebergeur. Dimensionner le VPS selon les mesures
de charge ; ce guide n'est pas une garantie de capacite ou de disponibilite.

Chez le fournisseur DNS, creer les enregistrements suivants :

| Type | Nom | Valeur |
| --- | --- | --- |
| A | `@` / `ktga.me` | IPv4 publique du VPS |
| A | `www` | IPv4 publique du VPS |
| A | `api` | IPv4 publique du VPS |

N'ajouter des AAAA que si IPv6 fonctionne reellement sur le VPS et son
pare-feu. Supprimer les anciens AAAA incorrects. Si un CAA restrictif existe,
il doit autoriser `letsencrypt.org`. Les ports 80 et 443 doivent etre ouverts
aussi dans le pare-feu du fournisseur. Ne pas exposer 4000, les bases ou SMTP
entrant : l'application envoie ses messages par un serveur SMTP externe.

La premiere installation doit utiliser le DNS direct, sans proxy tiers.
Verifier la propagation avant la demande de certificat :

```bash
dig +short A ktga.me
dig +short A www.ktga.me
dig +short A api.ktga.me
dig +short AAAA api.ktga.me
```

## 2. Compte operateur et protections

Depuis l'acces initial root du fournisseur :

```bash
apt-get update
apt-get upgrade -y
apt-get install -y sudo openssh-server git ca-certificates curl
adduser deploy
usermod -aG sudo deploy
```

Ajouter la cle publique de l'operateur a `/home/deploy/.ssh/authorized_keys`
(dossier 700, fichier 600, proprietaire deploy). **Ouvrir et verifier une
deuxieme connexion SSH avec `deploy` avant de desactiver root ou les mots
de passe.** Conserver la console de secours et la premiere session ouverte.

Configurer le durcissement SSH via un fichier de
`/etc/ssh/sshd_config.d/` : `PermitRootLogin no`, `PasswordAuthentication no`,
`KbdInteractiveAuthentication no`, une fois la connexion par cle validee.
Examiner les fichiers deja fournis par le VPS : une directive anterieure peut
prendre le dessus. Verifier avec `sudo sshd -t` et `sudo sshd -T`, puis
`sudo systemctl reload ssh`.

Le programme d'installation ci-dessous installe UFW mais **ne l'active pas**
afin de ne pas fermer votre acces. Ensuite, autoriser d'abord le vrai port SSH :

```bash
sudo ufw allow 22/tcp     # remplacer 22 si SSH utilise un autre port
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo ufw status verbose
```

Verifier une nouvelle connexion avant de fermer la session initiale.
Configurer Fail2ban pour SSH dans `/etc/fail2ban/jail.d/ktga.local` avec
`[sshd]`, `enabled = true`, `backend = systemd`, le port SSH reel,
`maxretry = 5`, `findtime = 10m`, `bantime = 1h` et
`banaction = ufw`. Puis `sudo systemctl enable --now fail2ban` et
`sudo fail2ban-client status sshd`. Ne pas l'appliquer aux joueurs de l'API :
les limitations et blocages progressifs sont deja geres par l'application.

Activer les mises a jour de securite avec
`sudo dpkg-reconfigure -plow unattended-upgrades`. Ne pas activer les
redemarrages automatiques pendant des parties ; les planifier et les annoncer.
Sur un VPS neuf, verifier egalement `sudo apt-get -s dist-upgrade` : une mise
a jour du noyau peut etre retenue par l'upgrade simple parce qu'elle ajoute
un paquet. Appliquer apres revue des ajouts et suppressions, puis redemarrer
pendant la maintenance et verifier la version active avec `uname -r`.

## 3. Installer le projet et les outils

En tant qu'operateur `deploy` :

```bash
sudo git clone https://github.com/Bnmkt/Ktgame.git /opt/ktga
cd /opt/ktga
sudo bash deploy/debian/install.sh
```

**La revision clonee doit contenir ces modifications de deploiement.** Si elles
ne sont pas encore publiees dans Git, transferer une archive du code a cette
place, sans `node_modules`, `client/dist`, les donnees, les certificats ou
les fichiers `.env` personnels. Ne jamais mettre un token Git dans l'URL
du depot ni dans ce document.

Le script cible exclusivement Debian 13. Il installe Nginx, Certbot, le
plugin Nginx, SQLite, OpenSSL, Git, rsync, UFW, Fail2ban, logrotate,
unattended-upgrades, les outils DNS et ShellCheck. Si Node compatible manque,
il installe Node 24 via le script officiel NodeSource et son depot signe.
Le script telecharge d'abord l'installeur au lieu d'utiliser `curl | bash`.
Node >= 22.13 reste compatible ; le nouveau VPS peut utiliser Node 24.

Il cree le compte systeme `ktga`, les dossiers et un secret JWT aleatoire.
Il **n'ecrase pas** un `/etc/ktga/server.env` ou une configuration de site
Nginx existante. Il active le service au boot sans le demarrer, ne modifie
pas SSH et n'active pas les sauvegardes planifiees.

La configuration HTTP temporaire repond 503 hors verification ACME ; c'est
normal tant que le certificat et le build ne sont pas installes. Le site
Nginx par defaut du VPS peut etre desactive en retirant uniquement son lien
de `/etc/nginx/sites-enabled/default`, apres verification qu'il ne sert rien.

## 4. Configuration et emails

Editer le fichier prive cree par l'installation :

```bash
sudoedit /etc/ktga/server.env
```

Conserver les valeurs principales du modele :

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
APP_BASE_PATH=
TLS_TERMINATION=proxy
TRUST_PROXY=loopback
CLIENT_ORIGIN=https://www.ktga.me
PUBLIC_APP_URL=https://www.ktga.me
HTTPS_KEY_PATH=
HTTPS_CERT_PATH=
HTTPS_PFX_PATH=
```

Les chemins HTTPS sont vides dans Node : les certificats sont charges par
Nginx. `TRUST_PROXY=loopback` n'accepte les entetes de proxy que depuis la
boucle locale. Nginx remplace l'adresse transmise au lieu de faire confiance
a un `X-Forwarded-For` fourni par le visiteur.

Pour une installation vide, garder le secret genere. Pour une migration de
comptes existants, conserver le secret JWT d'origine : il sert aussi au
chiffrement des TOTP et aux signatures parentales. Le remplacer sans migration
cryptographique rendrait ces informations inutilisables.
Changer de domaine demandera normalement aux joueurs de se reconnecter.
Les liens de verification, recuperation, espace parental et alertes utiliseront
`PUBLIC_APP_URL`, sans ancien prefixe `/ktga`.

L'outil `server/scripts/import-production-secrets.mjs` peut importer les seuls
reglages JWT et SMTP depuis un ancien `.env` prive (0600), sans remplacer les
domaines, le proxy ou les chemins des bases. Il exige root, valide le resultat
et n'imprime aucun secret. Supprimer ensuite la copie temporaire de l'ancien
fichier ; ne jamais la placer dans `/var/www` ou dans Git.

Pour la boite OVH existante, saisir dans ce fichier, et nulle part dans Git :

```dotenv
SMTP_HOST=smtp.mail.ovh.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contact@netdis.org
SMTP_PASS="REMPLACER_PAR_LE_SECRET_ACTUEL"
EMAIL_FROM="KTGA.ME <contact@netdis.org>"
CONTACT_EMAIL=contact@netdis.org
```

Le mot de passe affiche ici est un placeholder. Remplacer les anciens secrets
exposes dans des captures ou une correspondance. Ne pas inventer une adresse
`@ktga.me` sans avoir cree et autorise sa boite. Les domaines du site et
de l'API n'imposent pas de changer l'adresse SMTP.

L'adresse de destination se modifie ensuite dans **Administration > Parametres
> Identite et acces > Email de contact**. Le reglage en base est prioritaire
sur `CONTACT_EMAIL`, qui sert de valeur initiale. Cette adresse publique est
utilisee pour les alertes de bugs, les demandes de donnees, les dossiers
parentaux, les recours et les pages legales. Elle ne change pas `EMAIL_FROM`
ou la connexion SMTP. Les alertes encore en attente utilisent le nouveau
contact lors de leur prochain essai.

Verifier SPF et DKIM dans la configuration OVH du domaine **de l'expediteur**,
puis DMARC selon la politique voulue. Ne pas ajouter une seconde entree SPF.
Verifier aussi que le VPS autorise les connexions sortantes au port 465.

## 5. Migrer les donnees Windows

Ne jamais copier seulement `ktga.sqlite`. Les contenus d'aide, messages,
incidents, patchnotes, captures, dossiers parentaux et droits RGPD peuvent
utiliser plusieurs bases et dossiers.

1. Terminer les parties et annoncer la maintenance.
2. Arreter le serveur Windows avec `couper-serveur.cmd` ; verifier l'arret.
3. Sauvegarder et transferer **tout** `server/data`, avec les fichiers WAL/SHM
   encore presents et tous les sous-dossiers d'images.
4. Transferer aussi les donnees externes si l'ancien `.env` indique des chemins
   hors de ce dossier. Ne pas publier ces donnees sur le site ou dans Git.
5. Copier dans `/var/lib/ktga` pendant que le service Linux est arrete.

Exemple de transfert PowerShell, une fois Windows arrete :

```powershell
scp -r D:/dev/dicegame/server/data deploy@IP_DU_VPS:~/ktga-data
```

Sur Debian :

```bash
sudo systemctl stop ktga
sudo rsync -a ~/ktga-data/ /var/lib/ktga/
sudo chown -R ktga:ktga /var/lib/ktga
sudo chmod 750 /var/lib/ktga
```

Comparer les noms reels a ceux de `/etc/ktga/server.env`. Par exemple,
`ktga.sqlite.help.sqlite` n'est **pas** `help.sqlite`. Si un chemin etait
personnalise, conserver le nom ou adapter explicitement ce reglage. Une base
absente peut etre recreee vide sans erreur : cette comparaison est essentielle.
Le modele fourni conserve les noms par defaut de l'installation actuelle.
Les sauvegardes anciennes peuvent etre archivees hors de `/var/lib/ktga`
pour eviter de les recopier a chaque sauvegarde future.

Ne pas laisser fonctionner Windows et Linux simultanement apres bascule.

## 6. Dependances et build

Donner a l'operateur la propriete du code, pas au compte du serveur :

```bash
sudo chown -R deploy:deploy /opt/ktga
sudo chown ktga:ktga /opt/ktga/server/data
cd /opt/ktga/server
npm ci
npm run check:portability
npm test
cd /opt/ktga/client
npm ci
cp .env.production.example .env.production
npm test
umask 022
npm run build:prod
sudo rsync -a --chmod=D755,F644 /opt/ktga/client/dist/ /var/www/ktga/
```

Le build utilise la racine `/`, `https://api.ktga.me` et `/socket.io`.
Ne pas utiliser les anciens fichiers de build sous `/ktga`.
`npm ci` est obligatoire sur Linux : ne pas transferer les dependances Windows.
Le controle de portabilite verifie aussi la casse exacte des imports.

Le build produit aussi `client/dist-ssr`, le moteur de rendu HTML des pages
publiques. Conserver ce dossier sur le serveur et definir
`CLIENT_DIST=/var/www/ktga` dans `/etc/ktga/server.env`. Nginx sert les fichiers
statiques et transmet les pages a Node : leur contenu est disponible sans
JavaScript, y compris la FAQ, le guide, les regles des jeux et les patchnotes
publiees. Les brouillons et espaces prives restent hors indexation.
Les anciens fichiers sous `assets/` sont conserves lors d'une mise a jour
pour ne pas casser les navigateurs deja ouverts. Les nettoyer seulement
apres expiration des anciennes sessions de navigation.

Nginx a besoin de lire `/var/www/ktga`, mais jamais `/var/lib/ktga`. Les images
des bugs passent par l'API et ses controles d'acces, pas par un alias Nginx
sur le dossier prive. Le code et ses parents doivent etre lisibles par `ktga`.

## 7. Certificats gratuits et HTTPS

Apres propagation DNS, depuis le VPS :

```bash
sudo certbot certonly --webroot -w /var/www/letsencrypt \
  --cert-name ktga.me \
  -d ktga.me -d www.ktga.me -d api.ktga.me \
  --email contact@netdis.org --agree-tos --non-interactive
sudo install -m 0644 /opt/ktga/deploy/debian/nginx-https.conf /etc/nginx/sites-available/ktga
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

Le certificat couvre les trois noms ; il reste lisible seulement par les
services privilegies qui en ont besoin. Node n'a pas acces a sa cle privee.
Le hook installe par le script teste et recharge Nginx lors d'un renouvellement.
Inutile de redemarrer les parties pour renouveler les certificats.

La configuration definitive comprend les WebSockets, le cache des assets,
le fallback des routes React, les entetes de securite et des journaux sans
parametres d'URL. Le domaine nu et les chemins historiques `/ktga/` du nouveau
site redirigent vers les routes canoniques. Pour rediriger
`netdis.org/ktga`, configurer egalement l'ancien hebergement, sans rediriger
les autres pages de netdis.org. Les vieux liens d'email contenant des secrets
ne doivent jamais apparaitre dans un journal ou un outil d'analyse.

## 8. Demarrage et premier administrateur

```bash
sudo systemctl start ktga
sudo systemctl status ktga --no-pager
sudo journalctl -u ktga -n 80 --no-pager
```

`ExecStartPre` valide la configuration de production avant de lancer Node.
Le compte `ktga` ne peut ecrire que dans son stockage et son espace temporaire.
Le repertoire `/opt/ktga/server/data` doit exister, meme si les bases sont
externees ; l'installeur le cree. Ne pas effacer les fichiers de l'ancien
serveur avant validation complete de la migration.

Avec les donnees existantes, les droits administrateur sont conserves.
Avec une installation vide, creer d'abord un compte normal avec une adresse
non reservee, puis le promouvoir explicitement, serveur arrete :

```bash
sudo systemctl stop ktga
cd /opt/ktga/server
sudo node --env-file=/etc/ktga/server.env scripts/grant-admin.mjs --email votre-adresse@example.com
sudo node --env-file=/etc/ktga/server.env scripts/grant-admin.mjs --email votre-adresse@example.com --apply
sudo systemctl start ktga
```

La premiere commande simule ; la seconde sauvegarde puis applique. Aucun
pseudo ne donne automatiquement les droits. La double authentification
obligatoire des administrateurs reste active : configurer TOTP ou le code
email depuis le parcours de connexion. Les adresses publiques `@netdis.org`
et `@ktga.me` restent interdites a l'inscription, conformement aux regles
du site. Les comptes administrateur migres ne sont pas supprimes pour cela.

## 9. Verification de bout en bout

```bash
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS https://api.ktga.me/api/health
curl -I https://www.ktga.me/
curl -I https://www.ktga.me/profil
curl -I https://ktga.me/
curl -I https://www.ktga.me/ktga/guide
sudo ss -lntp
```

Verifier depuis un navigateur externe : inscription et connexion, cookie
Secure/HttpOnly, email de validation, recuperation de mot de passe, MFA,
page parentale, images privees/publiques des bugs, boutique, amis et chat,
creation et reconnexion de table, partie classee et statut public.
Dans les outils reseau, Socket.IO doit passer a WebSocket (101), sans
requete vers `ktgapi.netdis.org`, vers le port public 4000 ou vers un ancien
prefixe. Le rechargement direct d'une route React doit rester fonctionnel.

Tester la nouvelle adresse de contact avec une alerte de bug de test et
une demande de donnees sur un compte de test. Ne pas envoyer un export reel
pour tester un destinataire de contact : l'export va au joueur verifie.
L'adresse de contact ne doit jamais devenir le destinataire de ses donnees.

## 10. Exploitation, sauvegarde et restauration

### Commandes courantes

```bash
sudo systemctl stop ktga
sudo systemctl start ktga
sudo systemctl restart ktga
sudo journalctl -u ktga -f
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl list-timers certbot.timer
```

Utiliser systemd, pas les `.cmd` Windows ni un lancement Node en parallele.
Le PID est gere par systemd : un fichier `.server.pid` n'est pas necessaire.

### Sauvegarde coherente

```bash
sudo /usr/local/sbin/ktga-backup
```

Cette commande **arrete temporairement le serveur**, capture ensemble toutes
les bases, leurs images et la configuration privee, puis le redemarre meme
en cas d'erreur de copie. Elle ne le demarre pas s'il etait deja arrete.
L'archive n'est publiee qu'apres verification, avec acces root uniquement.
Les archives finalisees de plus de 14 jours sont purgees.

La coupure peut perturber les parties et provoquer des abandons : annoncer
une maintenance et verifier les tables avant de lancer la sauvegarde.
Le timer fourni est donc **desactive par defaut**. Seulement si une fenetre
de maintenance quotidienne a 04:30 Bruxelles est acceptable :

```bash
sudo systemctl enable --now ktga-backup.timer
```

Copier ensuite les sauvegardes chiffrees hors du VPS. Elles contiennent
les donnees personnelles et les secrets SMTP/JWT : ne pas les envoyer en clair
par email. Une sauvegarde sur le meme disque n'est pas une protection contre
sa perte. Conserver aussi la revision exacte du code et tester une restauration
sur une machine separee. Les certificats peuvent etre reemis si necessaire.

### Mise a jour

Sauvegarder, recuperer la revision validee, installer les dependances et
construire le client avant le basculement. Arreter Node avant d'executer des
outils qui modifient directement SQLite. Publier le build par rsync seulement
apres un build reussi. Redemarrer le service pendant la maintenance puis
verifier les parcours ci-dessus. Ne pas faire de retour arriere sur des bases
migrees sans restaurer leur sauvegarde correspondante.

### Restauration

Arreter `ktga`, mettre les donnees actuelles a l'abri, inspecter
`tar -tzf ARCHIVE`, puis restaurer ses fichiers dans un dossier temporaire
prive. Replacer `/var/lib/ktga` et la configuration appropriee apres revue,
retablir les droits `ktga:ktga` et la revision correspondante du code, reconstruire
le client, tester Nginx puis redemarrer. Ne pas melanger les fichiers WAL/SHM
d'une base actuelle avec une base restauree. Ne pas extraire aveuglement
une archive recue d'un tiers dans `/`.

Nginx conserve ici 14 rotations quotidiennes de ses journaux propres au
site, sans query string. Configurer egalement une limite globale de journald
et verifier l'occupation du disque. Les journaux du VPS et sauvegardes restent
des traitements distincts a documenter dans la politique de conservation.

## 11. Depannage

### Connexions simultanees

Le service Node dispose de `LimitNOFILE=65536`. Le Nginx Debian installe par
defaut conserve souvent `worker_connections 768`, trop faible pour les deux
connexions temps reel par joueur et leurs connexions vers le backend.
L'installateur applique maintenant un minimum de 8192 connexions par worker et
65536 fichiers ouverts, sans reduire des limites superieures deja configurees.
Pour mettre a jour un VPS existant :

```bash
sudo node /opt/ktga/deploy/debian/nginx-capacity.mjs --apply --reload
```

Le script conserve une sauvegarde, valide `nginx -t` avant/apres, refuse une
configuration ambigue et restaure le fichier si la validation ou le
rechargement echoue. Le rechargement est gracieux et ne redemarre pas Node.
Cela leve une limite du proxy, pas une garantie de capacite applicative.
Les limites Nginx comptent aussi les connexions vers le backend : voir la
[documentation officielle](https://nginx.org/en/docs/ngx_core_module.html#worker_connections).

| Symptome | Points a verifier |
| --- | --- |
| 502 sur l'API | `systemctl status ktga`, environnement valide, Node sur 127.0.0.1:4000 |
| Connexion perdue / CORS | CLIENT_ORIGIN exact `https://www.ktga.me`, build recent, HTTPS des deux domaines |
| Cookie non conserve | HTTPS, cookies autorises, ne pas utiliser une API HTTP depuis le site HTTPS |
| Temps reel absent | Entetes Upgrade/Connection, chemin `/socket.io`, timeout du proxy, absence de second Node |
| Page /profil en 404 | Bon build et `try_files ... /index.html` sur le serveur www |
| Certbot echoue | Trois DNS et AAAA, CAA, ports 80/443 fournisseur + UFW, challenge ACME |
| Envoi SMTP refuse | Boite et mot de passe actuels, port 465, SMTP_SECURE=true, refus temporaire OVH |
| Donnees apparemment perdues | Chemins absolus et noms exacts des bases ; arreter avant toute correction |
| Permission denied | Proprietaire du stockage, code lisible, dossier server/data present, regles du service |

## Installation realisee le 7 octobre 2026

### Acces et services

| Element | Configuration effective |
| --- | --- |
| VPS | `57.131.163.203`, `2001:41d0:701:1100::e808` |
| Systeme | Debian 13 amd64, noyau cloud 6.12.111, fuseau Europe/Brussels |
| Runtime | Node 24, Nginx, une instance `ktga.service` |
| SSH | port 22, cles uniquement, root distant interdit |
| Operateurs | `deploy` et `debian`, sudo via les cles autorisees |
| Pare-feu | entrants 22/80/443 en IPv4 et IPv6 ; Node sur loopback |
| Protection SSH | Fail2ban actif |
| Journaux | journald borne a 200 Mo et 14 jours |
| Mises a jour | securite automatique, sans reboot automatique |

Les mots de passe faibles fournis initialement sont verrouilles. Depuis ce
poste Windows, un alias SSH a ete configure :

```powershell
ssh ktga-vps
```

Equivalent explicite :

```powershell
ssh -i "$env:USERPROFILE\.ssh\ktga_vps_ed25519" deploy@57.131.163.203
```

La cle privee est uniquement sur le poste de l'operateur, hors du projet et
de Git. La conserver dans un emplacement sur et prevoir une copie de secours
protegee : les anciens mots de passe ne permettent plus une connexion SSH.
Ne pas envoyer cette cle par email ni la copier sur le VPS. Pour utiliser un
autre ordinateur, ajouter sa propre cle publique depuis cet acces valide.
Le compte `deploy` peut administrer le systeme sans mot de passe sudo ; il
ne faut donc jamais preter sa cle privee.

### Migration et recette

Les onze bases, leurs images, les comptes et les progressions ont ete copies
depuis le serveur Windows arrete. Les nombres d'entrees ont ete compares,
les controles SQLite et les cles etrangeres ont ete verifies, et le secret
TOTP existant se dechiffre toujours. Aucun compte n'a ete reinitialise.
Le serveur Windows de KTGA reste arrete pour eviter une divergence des donnees.

Huit images d'evenements encore hebergees sous `netdis.org/ktga/event` ont
ete recuperees dans `client/public/event`, installees sur Nginx et referencees
par des chemins absolus locaux. L'outil `migrate-event-assets.mjs` a conserve
une sauvegarde de la base avant cette adaptation. L'ancien hebergement web
n'a pas ete modifie et ses autres services sont conserves.

La compilation, les tests serveur/client, le proxy HTTPS, le CORS, les
cookies de connexion, les WebSockets, l'authentification SMTP, le renouvellement
SSL simule, la sauvegarde manuelle et le retour des services apres reboot
ont ete verifies. Des captures desktop/mobile avec bloqueur active se trouvent
dans `docs/previews/vps-debian-20261007`. Cette recette n'est pas un test de
charge ni une simulation de tous les parcours utilisateurs.

### DNS encore en attente

`www.ktga.me` et `api.ktga.me` disposent d'un certificat valide. A la fin de
l'installation, le domaine nu `ktga.me` pointe encore vers `213.186.33.5`.
Remplacer chez OVH l'enregistrement A `@` par `57.131.163.203`.
Si un AAAA est ajoute, utiliser uniquement l'IPv6 du VPS indiquee ci-dessus.

Une tache temporaire `ktga-domain.timer` verifie toutes les cinq minutes la
propagation publique. Des que les DNS attendus sont corrects, elle complete
le certificat avec `ktga.me`, recharge Nginx et se desactive. Elle ne modifie
pas la zone DNS et ne demande aucun certificat tant que les adresses divergent.
Le renouvellement ordinaire reste gere par `certbot.timer`.

```bash
sudo journalctl -u ktga-domain --no-pager -n 20
sudo systemctl list-timers certbot.timer ktga-domain.timer --no-pager
sudoedit /etc/ktga/network.env
```

Le modele `network.env.example` contient les adresses de ce VPS : l'adapter
explicitement avant de reutiliser cette tache sur une autre machine.
Les anciennes URL `netdis.org/ktga` ne sont pas redirigees par ce VPS : il
faudra definir une redirection sur l'ancien hebergement si elles doivent
continuer de fonctionner, en preservant leurs parametres d'URL prives.

### Sauvegardes et commandes

Une sauvegarde avant migration est conservee dans le dossier prive local
`C:\Users\bkt\.ktga-deployment\20261007` et sur le VPS dans
`/var/backups/ktga`. Une sauvegarde apres migration, incluant la configuration,
est chiffree avec age pour la cle SSH de l'operateur, puis copiee dans ce dossier
local sous `ktga-post-migration.tar.gz.age`. Son dechiffrement et la lisibilite
de l'archive ont ete verifies sans envoyer la cle privee au VPS.

Pour dechiffrer, utiliser age sur une machine de confiance avec cette cle
locale et placer le resultat dans un dossier prive :

```bash
age --decrypt -i ~/.ssh/ktga_vps_ed25519 -o restauration.tar.gz ktga-post-migration.tar.gz.age
```

Le timer de sauvegarde quotidienne reste desactive : le script arrete
temporairement les parties. Planifier une fenetre de maintenance avant de
l'activer. La copie chiffree initiale hors VPS ne remplace pas une politique
de sauvegarde continue avec copies distantes et tests de restauration.

```bash
sudo systemctl status ktga --no-pager
sudo journalctl -u ktga -n 80 --no-pager
sudo /usr/local/sbin/ktga-backup
sudoedit /etc/ktga/server.env
sudo systemctl restart ktga
```

La boite SMTP OVH a ete conservee et testee. Son ancien mot de passe ayant
ete communique dans la conversation, le renouveler chez OVH puis remplacer
`SMTP_PASS` dans le fichier prive et redemarrer le service en maintenance.
Ne jamais recopier ce secret dans ce guide, dans un commit ou une capture.

## Capacite des connexions

Le service Node utilise `LimitNOFILE=65536`. Nginx doit aussi disposer de connexions
suffisantes : une connexion proxifiee utilise un emplacement cote visiteur et un
autre cote application, auxquels s'ajoutent les requetes HTTP et les autres services.
Le correcteur fourni conserve les valeurs deja superieures, verifie la configuration,
la sauvegarde puis recharge Nginx sans interrompre les connexions en cours. Il
configure aussi un backend HTTP persistant pour les deux domaines KTGA : jusqu'a
256 connexions inactives sont conservees par worker, sans limiter les connexions
actives a ce nombre. Les WebSockets gardent leurs en-tetes d'upgrade; les en-tetes
de securite, certificats, chemins et adresses de clients sont conserves.

```bash
cd /opt/ktga
# Apercu sans modification.
sudo node deploy/debian/nginx-capacity.mjs
# Limites de connexions et reutilisation des connexions HTTP vers Node.
sudo node deploy/debian/nginx-capacity.mjs --apply --reload
```

Ces limites ne garantissent pas une capacite de 1000 joueurs actifs. Refaire les tests
de `docs/CAPACITY-TESTING.md` sur la machine cible, avec des donnees isolees et une
cadence documentee. Ne pas lancer plusieurs processus du serveur actuel sur la meme
base pour repartir les connexions : ses salons, files et sessions sont en memoire.
Le processus Comptes specialise est coordonne par ce serveur; il ne duplique
ni les salons ni les ecritures. Il ne permet pas a lui seul de multiplier la
capacite des jeux par le nombre de coeurs.

Le serveur Node garde une file TCP d'acceptation de 4096 (dans la limite du noyau),
un keepalive de 65s et une limite de reception des en-tetes de 70s. Ces valeurs ne
modifient pas les limiteurs de requetes, les droits ou les verifications de session.

## Sources techniques

Les fichiers fournis implementent les reglages propres a KTGA.ME ; les
documentations suivantes expliquent les briques utilisees :

- [Debian 13 et ses notes de version](https://www.debian.org/releases/trixie/releasenotes)
- [Certbot disponible dans Debian 13](https://packages.debian.org/trixie/certbot)
- [Validation webroot et renouvellement Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html)
- [Transmission des WebSockets dans Nginx](https://nginx.org/en/docs/http/websocket.html)
- [Script Debian NodeSource pour Node 24](https://github.com/nodesource/distributions/blob/master/scripts/deb/setup_24.x)
- [Chiffrement age et destinataires SSH](https://github.com/FiloSottile/age)

La verification locale sous Linux ne remplace pas une recette du VPS reel,
de son DNS, de ses certificats et de la livraison effective des emails.
