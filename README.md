# KTGA.ME

### Routes du client

Le client expose `/ktga/`, `/ktga/profil`, `/ktga/shop`, `/ktga/classements`, `/ktga/admin`,
`/ktga/table/CODE`, `/ktga/observer/CODE` et `/ktga/evenement/IDENTIFIANT` lorsque
`VITE_BASE_PATH=/ktga/`. Les liens, les assets et les invitations utilisent cette
base absolue. Les anciens liens `?room=CODE` et `?event=IDENTIFIANT` restent valides.
Une invitation conserve sa destination pendant la connexion ou l'inscription.

Sur un hebergement Apache, envoyer **tout** le contenu de `client/dist`, y compris
le fichier cache `.htaccess`, dans le repertoire `/ktga/`. Ce fichier renvoie les
routes du client vers `index.html`, sans modifier les fichiers existants. Il
necessite `mod_rewrite` et l'autorisation des regles `.htaccess` par l'hebergeur.
Sur Nginx, l'equivalent est `try_files $uri $uri/ /ktga/index.html;` dans le bloc
`location /ktga/`. Sans cette regle de fallback sur l'hebergement, un acces direct
ou un rechargement d'une route peut renvoyer une 404.

La structure du projet et les conventions pour ajouter un jeu sont décrites dans [ARCHITECTURE.md](ARCHITECTURE.md).

Application web multijoueur pour jeux de dés et cartes, avec frontend et backend séparés.

## Belote

Quatre places, deux equipes (1/3 contre 2/4), avec IA possibles. La variante
belge est active par defaut; les reglages de la table permettent d'activer
la variante francaise, de desactiver les annonces et de choisir l'objectif.

Les equipes bleue et rouge se choisissent dans la salle d'attente. Chaque
joueur peut changer sa propre equipe (place libre ou echange avec une IA);
le maitre peut aussi reorganiser les autres joueurs. Un changement remet les
confirmations de presence a zero. Les partenaires sont face a face sur le
tapis, avec les adversaires a gauche et a droite. Le placement est conserve
au rejeu et lors du remplacement d'un joueur par une IA.

La convention belge retenue s'appuie sur le
[reglement de concours RJCV](https://www.rjcv.be/belote/regles.pdf), pas sur un
reglement national unique : prise forcee apres huit passes, marque en dizaines
(101 par defaut), roi avant dame pour la belote, sous-coupe du partenaire si
on ne peut pas monter. L'option francaise utilise redistribution, belote dans
les deux ordres, defausse libre sur partenaire maitre, et points non arrondis
(objectif multiplie par dix), selon les
[regles de la FFB](https://www.ffbelote.org/regles-officielle-belote/).
Les annonces sont detectees/declarees automatiquement, puis revelees au
second pli; la meilleure equipe conserve ses annonces sans reutiliser une
carte. La belote est marquee automatiquement en jouant les deux honneurs.

Le serveur valide chaque carte, masque les mains adverses et le talon, gere
les litiges, le capot, les donnes suivantes et la victoire par equipe. Un joueur
parti est remplace par une IA pour conserver les quatre places. Le pot garde
la repartition du casino par classement des humains, sans gain pour les IA.

La comparaison des cartes reprend un adaptateur de `justitsi/js-belote`
(MIT, attribution dans `server/src/games/vendor/LICENSE.belote`). Les regles
locales et le cycle des parties sont couverts par `server/test/belote.test.js`.
Le test isole `client/test/belote-profile.smoke.mjs` verifie aussi l'API, le
rejeu, les mains cachees et l'affichage ordinateur/mobile, sans toucher la
base de production. `PLAYWRIGHT_MODULE` peut designer le module Playwright
installe sur la machine; Edge est utilise pour ce test.

## Spectateurs

Rejoindre une table deja lancee ouvre automatiquement sa vue spectateur,
y compris lorsqu'elle est pleine : liste publique, code, lien direct,
bouton des amis ou invitation. Le bloc Parties en cours du casino est limite
aux tables des amis, sans doublons et avec un maximum de cinq tables.
Une table protegee exige son mot de passe (ou une invitation valide);
une table privee sans mot de passe reste accessible par son code d'invitation.
La connexion au compte est necessaire, sans mise ni place de joueur occupee.

Au retour en salle d'attente, Rejoindre la table permet de prendre une place
libre, sous reserve du solde necessaire. Les jeux de des publics affichent
la piste, les derniers jets, les scores et les combinaisons disponibles.
Les des secrets du Liar's Dice restent masques jusqu'a leur revelation.

Les 15 jeux disposent d'une vue publique actualisee par Socket.IO, y compris
pendant le rejeu et le retour en salle d'attente. Le serveur utilise une liste
explicite de champs publics par jeu : aucune main privee, ordre de pioche,
carte cachee, contrat secret ou annonce non revelee n'est envoye au spectateur.
Les cartes deja publiques ou volontairement montrees restent visibles.
Les actions de jeu sont refusees aux non-participants avant toute facturation.

`server/test/spectator-state.test.js` couvre les projections des 15 jeux et
les equipes. Le test navigateur Belote/profile couvre aussi toutes les vues
spectateur, les mises a jour en direct et les acces HTTP/Socket proteges.

## Classements

La page Classements et `GET /api/leaderboards` proposent les 100 premiers
comptes enregistres actifs (hors IA et invites). Categories : victoires,
gains verses cumules, gain verse record par partie, meilleur score par jeu
et solde de jetons tous jeux confondus. Les gains incluent les mises rendues :
ce ne sont pas des benefices nets. Les bonus quotidiens et achats ne sont pas
comptes comme gains de partie. Les ex aequo partagent le meme rang; un joueur
hors du top 100 peut voir sa propre position.

Les periodes sont le jour choisi, le trimestre civil choisi (janvier-mars,
avril-juin, juillet-septembre, octobre-decembre) et tout l'historique.
Les frontieres suivent `CASINO_TIME_ZONE` (Europe/Brussels par defaut), sans
remise a zero des comptes. Les archives reposent sur l'historique et les
transactions SQLite. Le classement de richesse utilise le solde actuel pour
les periodes ouvertes, et le dernier solde enregistre avant la cloture pour
les periodes passees; un solde ancien inconnu n'est pas invente.

Les scores plus faibles sont meilleurs au Shut the Box, Golf, Accordion et
President. Les anciens scores normalises sont convertis pour l'affichage.
La belote enregistre desormais le score d'equipe dans l'historique : les
anciens resultats sans cette information alimentent victoires/gains, pas les
records de score. Les anciens resultats sans score sont egalement ignores
dans les records, sans exclure leurs autres statistiques.

Tests : `server/test/leaderboards.test.js` et
`client/test/leaderboards.smoke.mjs` (API reelle, base temporaire, desktop/mobile).

## Lancer le projet

Copier les exemples d'environnement puis adapter les valeurs:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

```bash
cd server
npm install
npm run dev
```

```bash
cd client
npm install
npm run dev
```

Frontend: http://localhost:5173

Backend: http://localhost:4000

## Configuration production

### Historique des requêtes

L'administration expose **Santé serveur → Journaux**, réservé aux administrateurs.
Le journal est enregistré dans `server/data/request-logs.sqlite`, séparément de la base des jeux.
Il conserve les requêtes HTTP, les refus CORS, les connexions interrompues, les refus de connexion
Socket.IO et les démarrages du serveur. Les écritures sont regroupées toutes les deux secondes ;
un arrêt brutal peut donc perdre les toutes dernières entrées non écrites.

Les filtres permettent une recherche par créneau horaire, niveau, catégorie, méthode, statut,
route, ID joueur authentifié ou ID de requête. Les dates du formulaire suivent le fuseau indiqué
dans la page ; le stockage utilise UTC. L'en-tête de réponse `X-Request-Id` permet de retrouver
une requête précise. Un HTTP 304 est une information de cache, pas une erreur.

La conservation est limitée à 14 jours et environ 100 000 entrées (purge périodique).
Les corps, paramètres d'URL, mots de passe, cookies et en-têtes d'authentification ne sont pas
collectés. La collecte commence au premier démarrage avec cette version ; les incidents passés
ne peuvent pas être reconstitués. Un blocage réseau avant l'arrivée au serveur reste invisible.
Déployer le build client et redémarrer le serveur pour activer la collecte et son écran admin.

Le serveur nécessite Node.js `>=22.13.0`, car la persistance utilise `node:sqlite`.

Variables serveur principales:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=4000`
- `JWT_SECRET`: obligatoire en production, valeur longue et privée.
- `JWT_EXPIRES_IN=7d`
- `HTTPS_KEY_PATH`, `HTTPS_CERT_PATH`: optionnels, activent HTTPS directement dans Node si les deux chemins PEM sont définis.
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`: limites HTTP basiques, avec une limite plus stricte pour l'authentification.
- `APP_BASE_PATH=/ktga` si le serveur est exposé sous `https://netdis.org/ktga`.
- `CLIENT_ORIGIN`: origine(s) autorisée(s) pour CORS, ex. `http://netdis.org,https://netdis.org`.
- `SQLITE_PATH`: chemin de la base SQLite, à placer sur un volume persistant.
- `CLIENT_DIST`: optionnel, chemin du build React si Express doit aussi servir le frontend.

Frontend statique sur `https://netdis.org/ktga`, backend HTTPS séparé sur `ktgapi.netdis.org:4000`:

```bash
cd client
VITE_BASE_PATH=/ktga/ VITE_API_URL=https://ktgapi.netdis.org:4000/ktga npm run build
```

Ou créer `client/.env.production` depuis `client/.env.production.example`, puis lancer:

```bash
cd client
npm run build
```

Il faut ensuite envoyer le contenu de `client/dist` dans le dossier public correspondant à `/ktga` sur le serveur web. Le frontend chargé depuis `https://netdis.org/ktga` appellera alors `https://ktgapi.netdis.org:4000/ktga/api/...` et Socket.IO sur `https://ktgapi.netdis.org:4000/ktga/socket.io`.

Le serveur web du client n'a besoin que des fichiers statiques. Les certificats et les vérifications HTTPS se font sur le serveur backend qui reçoit `ktgapi.netdis.org`.

Dans ce cas, côté serveur:

```bash
APP_BASE_PATH=/ktga
CLIENT_ORIGIN=http://netdis.org,https://netdis.org
HTTPS_KEY_PATH=/etc/letsencrypt/live/ktgapi.netdis.org/privkey.pem
HTTPS_CERT_PATH=/etc/letsencrypt/live/ktgapi.netdis.org/fullchain.pem
```

Créer le certificat sur le serveur backend Linux avec Certbot:

```bash
sudo apt update
sudo apt install certbot acl
sudo certbot certonly --standalone -d ktgapi.netdis.org
```

Ou utiliser le script fourni:

```bash
cd server
chmod +x scripts/setup-https-linux.sh
./scripts/setup-https-linux.sh ktgapi.netdis.org $(whoami) 94.106.131.148
npm install
npm run check:prod
npm start
```

`npm run check:prod` doit être lancé sur le serveur backend après création du certificat. Sur une machine locale Windows, il échouera normalement si `HTTPS_KEY_PATH` et `HTTPS_CERT_PATH` pointent vers `/etc/letsencrypt/...`.

Cette commande vérifie que `ktgapi.netdis.org` pointe vers `94.106.131.148`. Elle nécessite aussi que le port `80` soit accessible le temps de la validation Let's Encrypt. Ensuite, démarre Node avec les chemins Let's Encrypt:

```text
/etc/letsencrypt/live/ktgapi.netdis.org/privkey.pem
/etc/letsencrypt/live/ktgapi.netdis.org/fullchain.pem
```

Le certificat doit être reconnu par les navigateurs et correspondre à l'hôte appelé par le client. Ici, le client appelle `https://ktgapi.netdis.org:4000`, donc le certificat doit être valide pour `ktgapi.netdis.org`.

Ne build pas le client HTTPS avec `VITE_API_URL=http://94.106.131.148:4000/ktga`: le navigateur bloquera ces appels comme contenu mixte.

Frontend servi par Express:

```bash
cd client
VITE_BASE_PATH=/ktga/ VITE_API_URL= npm run build
```

Puis copier le contenu de `client/dist` dans un dossier côté serveur et définir:

```bash
CLIENT_DIST=./public
APP_BASE_PATH=/ktga
CLIENT_ORIGIN=https://netdis.org
```

Healthcheck:

```bash
GET /ktga/api/health
```

Test HTTPS backend:

```bash
curl -I https://ktgapi.netdis.org:4000/ktga/api/health
```

Lancement Windows local:

```powershell
cd D:\dev\dicegame\server
npm.cmd run cert:local
npm.cmd run check:prod
npm.cmd start
```

Ce mode Windows utilise un certificat auto-signé généré dans `server/certs/`. Il permet de démarrer le serveur en HTTPS, mais il ne remplace pas un certificat public Let's Encrypt sur le vrai serveur backend.

Si le navigateur affiche `CERT_AUTHORITY_INVALID`, le serveur répond bien en HTTPS mais le certificat n'est pas signé par une autorité reconnue. Pour l'accès public depuis `https://netdis.org/ktga`, il faut remplacer le certificat auto-signé par un certificat Let's Encrypt valide pour `ktgapi.netdis.org`.

Sur Linux, utilise le script:

```bash
cd server
./scripts/setup-https-linux.sh ktgapi.netdis.org $(whoami) 94.106.131.148
```

Sur Windows serveur, utilise un outil ACME comme win-acme pour générer un certificat public pour `ktgapi.netdis.org`, puis configure `server/.env` vers les fichiers PEM générés:

```env
HTTPS_KEY_PATH=C:\chemin\vers\privkey.pem
HTTPS_CERT_PATH=C:\chemin\vers\fullchain.pem
```

Le certificat doit être émis pour `ktgapi.netdis.org`, pas pour `netdis.org` et pas pour l'IP.

Si le navigateur affiche `ERR_CONNECTION_TIMED_OUT`, le DNS est atteint mais le port `4000` ne répond pas. Sur le serveur backend, vérifie dans cet ordre:

```bash
sudo ss -ltnp | grep ':4000'
sudo ufw status
sudo ufw allow 4000/tcp
curl -k https://127.0.0.1:4000/ktga/api/health
curl -k https://ktgapi.netdis.org:4000/ktga/api/health
```

Le serveur Node doit afficher `KTGA.ME server listening on https://0.0.0.0:4000`. S'il affiche `http://...`, les variables `HTTPS_KEY_PATH` et `HTTPS_CERT_PATH` ne sont pas chargées ou les fichiers ne sont pas lisibles.

Service systemd optionnel:

```bash
sudo cp scripts/ktga.service.example /etc/systemd/system/ktga.service
sudo sed -i "s#/opt/ktga/server#$(pwd)#" /etc/systemd/system/ktga.service
sudo systemctl daemon-reload
sudo systemctl enable --now ktga
sudo systemctl status ktga
```

## Fonctionnalités MVP

- Compte pseudo + mot de passe.
- Connexion invité.
- Jetons par défaut.
- Bonus journalier pour comptes enregistrés.
- Création de rooms publiques ou privées avec nom, mot de passe optionnel et mise optionnelle.
- Liste des rooms publiques, join par code et liens d'invitation.
- Maître de room avec exclusion des joueurs avant le démarrage de la manche.
- Jeux disponibles: Yahtzee, 421, Cul de Chouette, Blackjack, Bataille, Président, Farkle, Liar's Dice, Shut the Box, Golf Solitaire et Accordion.

La persistance serveur utilise SQLite via `server/data/ktga.sqlite` par défaut, ou `SQLITE_PATH` si défini. Au premier lancement, les anciennes données de `server/data/db.json` sont migrées automatiquement si la base SQLite est vide.

## Stockage et migration v2

- Les définitions de succès et d'objets sont référencées dans `achievement_catalog` et `item_catalog`. Les possessions sont des relations `user_achievements` et `user_inventory`, avec identifiants, dates et états. Les objets équipés restent de simples identifiants. Les IDs anciens ou retirés du catalogue sont conservés.
- Les participants aux parties sont séparés dans `history_members`, avec index par joueur, jour et jeu, résultat, gain et score normalisé. Les noms historiques, classements, récompenses et événements de succès restent conservés.
- Les salons ne recopient plus le compte, tous les succès et tout l'inventaire de chaque joueur. Ils persistent uniquement l'identité de jeu, le solde utile au moteur et les éléments équipés ; les réponses publiques enrichissent ces références depuis le compte courant.
- Historiques, transactions et journaux d'événements ne sont plus chargés intégralement en mémoire au démarrage, ni reparcourus à chaque sauvegarde. Seules les nouvelles entrées attendent le commit ; une partie, ses gains et ses succès sont enregistrés dans la même transaction SQLite.
- Profils, bonus, succès, quotas d'événements, métriques d'administration et classements utilisent des requêtes indexées et bornées à la période demandée. Les statistiques des joueurs disposent d'un cache borné à 256 profils, invalidé lors des nouvelles écritures. Les jours respectent `CASINO_TIME_ZONE` ; changer ce réglage reconstruit les index de dates au démarrage.
- Le profil charge les journaux à la demande, par pages de 40 parties ou 60 transactions. Les filtres recherchent dans tout l'historique ; les statistiques globales viennent de `/api/me/statistics`, pas des pages affichées. `/api/history` et `/api/transactions` acceptent `paged=1`, `limit` (maximum 100), `offset` et les filtres ; sans `paged=1`, la réponse reste un tableau, limité à 100 entrées.

Avant déploiement, depuis `server` :

```powershell
npm.cmd run check:storage
npm.cmd test
```

`check:storage` ouvre la base actuelle en lecture seule, en prend une copie cohérente (WAL inclus), migre uniquement cette copie puis compare toutes les entrées et vérifie l'intégrité et les références. Les fichiers temporaires sont supprimés. Pour vérifier une ancienne sauvegarde : `npm.cmd run check:storage -- C:\sauvegardes\ktga.sqlite`. Cet audit attend une base antérieure à v2.

Au premier démarrage avec ce code, une base existante reçoit automatiquement une sauvegarde `ktga.sqlite.before-v2-<timestamp>.bak` à côté du fichier SQLite. La conversion est transactionnelle et versionnée ; une erreur de sauvegarde ou de conversion bloque le démarrage. Prévoir de l'espace disque pour la sauvegarde et la migration. Les fichiers `.bak` contiennent des données privées : les protéger comme la base, les conserver hors du répertoire web et en copier un exemplaire hors du serveur.

Déployer le client reconstruit et le serveur ensemble, puis redémarrer **une seule instance** du backend. Ne pas laisser une ancienne version écrire pendant la migration. En cas de retour arrière, arrêter le backend, copier la sauvegarde vers un **nouveau chemin SQLite**, pointer `SQLITE_PATH` vers cette copie et restaurer l'ancien code. Ne pas réutiliser des fichiers WAL/SHM de la base migrée ; les écritures postérieures à la sauvegarde ne font pas partie du retour arrière.

### Limites actuelles

La base métier reste unique pour conserver l'atomicité des soldes, achats, parties et récompenses. Les journaux HTTP utilisent déjà une base distincte. Aucun worker d'écriture concurrent n'est ajouté : les comptes, salons et états actifs d'événements utilisent encore le modèle mutable mono-processus. Les salons terminés restent conservés pour pouvoir être rejoués. Les vues analytiques administrateur peuvent encore parcourir une période importante ; ce travail ne constitue pas une garantie de capacité pour un nombre arbitraire de joueurs. Une prochaine étape, guidée par des mesures de charge, serait l'archivage à la demande des salons et un worker de lecture pour les rapports lourds, sans partager les mutations métier entre plusieurs processus.
