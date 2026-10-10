# Gateway et processus de jeu

## Etat de cette evolution

Cette premiere etape est optionnelle (`GAME_WORKERS_ENABLED=1`). Aucun Redis,
PostgreSQL, nouveau port public ou changement d'API client n'est requis.
Le mode historique reste disponible et est le defaut tant que les tests de
capacite et d'endurance sur le VPS cible ne sont pas satisfaisants.
Ce document ne constitue pas une certification de 1 000 ou 20 000 joueurs.
Les essais du 10 octobre n'ont pas valide 1 000 joueurs actifs ; ne pas activer
ce mode en production pour ce seul objectif. Aucun redemarrage, changement de
configuration ou deploiement de cette evolution n'a ete effectue en production.

## Analyse des chemins critiques

Avant extraction, `src/index.js` et `services/ranked-runtime.js` executaient
sur la meme boucle Node que HTTP et Socket.IO :

| Chemin | Travail encore synchrone avant cette etape | Situation actuelle |
| --- | --- | --- |
| POST rooms/action | Moteurs, bots, pacing, succes, ecriture, vues et emission | Moteurs et bots dans le proprietaire de room ; effets et vues dans le Gateway |
| Start, replay, leave, kick | Initialisation, depart, cash-out, fin et classement | Transition preparee dans le worker ; effets atomiques dans le Gateway |
| Timers 1 s | Parcours des rooms, poker, bataille et attente des bots | Scheduler de chaque Game Worker |
| Timers ranked 2 s | Matchmaking, presence, AFK, forfaits | Matchmaking dans le Gateway ; horloges et forfaits dans les workers |
| Invitations et nettoyage | Modification directe des joueurs, suppression des rooms | Commandes au proprietaire |
| Suivi facultatif de temps | Compteurs compte et buckets de succes de room | Compteurs compte dans le Gateway ; commande de room pour ses buckets |
| FinishRoomIfNeeded | Classement, historique, gains, XP, Elo, succes | Classement final prepare dans le worker ; validation atomique dans le Gateway |
| SQLite | DatabaseSync, BEGIN IMMEDIATE, JSON des lignes, catalogues | Toujours dans le Gateway, sauf lectures deja deleguees |
| Socket.IO | Masquage des mains, variantes par destinataire, emission | Toujours dans le Gateway |
| HTTP comptes | Projection, calcul des progres, lectures auxiliaires | Caches et workers existants conserves ; processus Comptes toujours optionnel |

Les fichiers `db.js`, `storage/normalized.js`, `storage/archives.js` gardent les
ecritures financieres et certaines lectures synchrones. Chat, statut, tribunal,
support, notifications de contact et controles parentaux ouvrent egalement
leurs bases auxiliaires avec DatabaseSync. Les archives delegates aux reading
workers ne sont pas pour autant une base principale entierement asynchrone.

Points precis a profiler avant un nouveau palier :

- `index.js` : `finishRoomIfNeeded`, `processAchievementEvent`, `addTokens`
  et leurs transactions ; XP/Elo et recompenses restent dans le coordinateur.
- `db.js` : `updateDb`/`writeDb`, transaction synchrone et persistance des
  seules lignes selectionnees ; les ecritures bloquent encore la boucle HTTP.
- `index.js` : `serializeRoom` et `emitRoomUpdate`, recherche de profils,
  presentations et masquage par destinataire ; le moteur n'est pas leur cout.
- `index.js` : `/api/notifications`, `/api/chat/unread`, `/api/me/activity`,
  lectures et ecritures auxiliaires ainsi que traitement de succes.
- `ranked-runtime.js` : reservation de file et selection des adversaires,
  qui restent dans le Gateway et doivent partager son budget CPU.

Le deplacement des moteurs ne supprime donc pas la saturation possible du
Gateway : serialization, compression, diffusion, succes et transactions y
restent. Les mesures doivent separer leurs couts avant l'etape suivante.

## Proprietaire unique

```text
Nginx -> Gateway HTTP / Socket.IO
                |
                +-- registre roomId -> workerId, epoch, version
                +-- FIFO par room / admission bornee
                +-- IPC -> Game Worker 1 -> rooms A, B
                +-- IPC -> Game Worker 2 -> rooms C, D (optionnel)
                +-- SQLite : coordinateur unique des effets durables
                +-- workers de lecture / Comptes existants (optionnel)
```

Les nouvelles rooms sont attribuees au processus ayant le moins de rooms.
Le registre reste prive au Gateway. Un processus detient l'etat autoritaire,
un numero de version et un epoch de propriete. Les autres ne recoivent pas
ses rooms. Les commandes d'une meme room sont executees dans l'ordre.
Les rooms persistantes sont enregistrees avant l'ouverture du port HTTP.

Une transition suit ce protocole :

1. Le Gateway authentifie, selectionne le contexte utile et ses revisions.
2. Le proprietaire prepare un brouillon de sa seule room avec les moteurs
   et controles existants. Il retourne des intentions, pas des ecritures DB.
3. Le Gateway verifie les revisions, les autorisations encore valides et les
   conflits de participation. Il applique soldes, succes, XP, historique et
   Elo dans la transaction existante, avec un checkpoint de commande.
4. Le worker valide le brouillon apres cette ecriture durable. Il recoit
   uniquement les champs financiers et de succes modifies par le coordinateur.
5. Le Gateway produit les vues masquees et les notifications Socket.IO.

Un echec avant COMMIT annule le brouillon. Apres COMMIT, un echec d'accuse
de reception arrete le proprietaire ; un remplacement n'est autorise qu'apres
sa terminaison. Le checkpoint DB sert ensuite a reprendre sans rejouer les
effets financiers. Une reprise automatique bornee est autorisee uniquement
pour les commandes en conflit **avant** validation durable. Un timeout apres
COMMIT n'autorise jamais a recalculer la commande ; la reponse peut seulement
etre retablie depuis le checkpoint apres terminaison de l'ancien proprietaire.

Le garde-fou de `db.js` refuse les ecritures de room hors d'une transaction
autorisee pour son ID. Le worker ne charge ni SQLite active, ni .env, ni secrets
JWT/SMTP. Ses vues de comptes excluent hashes de connexion, tokens de session
et email. Le solde virtuel utile aux controles de mise reste disponible.
Les changements de pseudo et d'inventaire ne modifient plus directement les
rooms depuis les routes de comptes/boutique. Leurs presentations HTTP utilisent
les comptes actuels ; le proprietaire rafraichit son brouillon lors de sa prochaine
transition. Cartes, scores et regles ne sont pas remplaces par ces presentations.

## Limites et transport

- 1 a 4 processus de jeu configurables ; defaut recommande pour le test 2 vCPU : 1.
- 512 commandes admises globalement et 8 par room, y compris celles en cours.
- Par transport : 16 requetes en vol, 256 en attente, expiration de 10 secondes.
- Reponses de surcharge 503, conflits pre-validation 409 ; files non illimitees.
- Une copie de la room concernee par transition, pas de clone de toute la base.
- Config versionnee envoyee uniquement lors de ses changements.
- Contexte sparse des comptes concernes, presence et conflits de participation.
- Index de rooms par ID, code et participants, actualise par commit sans
  reparcourir toutes les rooms pour chaque controle de participation.
- Transactions de room declarees sans modification des parametres : pas de
  serialization globale de configuration et caches conserves pendant le commit.
- Aucun broadcast sur un tick inactif ; pas de republication du lobby a chaque
  action ni a chaque relevement de temps sans changement visible.
- Serialization IPC native Node `advanced`, pas de JSON.stringify global.

Une copie complete de la room active reste echangee pour chaque transition ;
ce n'est pas encore un protocole de deltas. La copie par destinataire Socket.IO
et les lectures de comptes n'ont pas toutes ete deplacees. Le registre est local
au Gateway, pas un verrou distribue.

`game-ipc-transport.js` implemente un contrat `request(operation, payload)`,
evenement `due`, `health()` et `close()`. Un transport Redis futur peut utiliser
ce contrat sans dupliquer les moteurs. Pour plusieurs machines, il faudra en
plus des leases/fencing durables partages et un coordinateur transactionnel :
remplacer seulement le transport par Redis ne suffirait pas.

## Fichiers

- `services/room-runtime.js` : moteurs partages, bots et pacing.
- `services/room-commands.js` : les 18 commandes HTTP existantes, partagees.
- `services/ranked-room-runtime.js` : forfaits et horloges de room.
- `services/game-room-kernel.js` : etats autoritaires et prepare/commit/abort.
- `services/game-worker-process.js` : processus, scheduler et telemetrie.
- `services/game-ipc-transport.js` : transport IPC et backpressure.
- `services/game-workers.js` : registre, FIFO, attribution et reprise.
- `services/game-gateway.js` : contexte restreint, revisions et commit durable.
- `services/room-directory.js` : index de rooms par ID, code et participants.
- `index.js`, `db.js`, `ranked-runtime.js` : integration et fencing des ecritures.
- `ServerHealth.jsx` : processus et latences dans la supervision existante.
- `capacity/serve.mjs`, `run.mjs`, `compare.mjs`, `admin-runner.mjs`,
  `capacity-config.js`, `CapacityTests.jsx` : comparatifs et parametres de test.
- `server/.env.example`, `deploy/debian/server.env.example`,
  `services/production-config.js`, `deploy/debian/update-capacity.sh` :
  configuration optionnelle et liste des modules a livrer.
- `server/package.json` : commande `capacity:compare`.
- `server/test/game-worker-kernel.test.js`, `game-worker-pool.test.js`,
  `game-worker-api.test.js`, `game-gateway.test.js`, `room-directory.test.js`,
  `storage.test.js`, `execution-health.test.js` : regression, concurrence,
  reprise et garde DB.
- `services/service-execution.js` : cumuls des transitions dans la supervision
  et l'historique technique existants.
- `client/test/game-processes.smoke.mjs` : supervision desktop/mobile avec
  bloqueur de contenu ; captures dans `docs/previews/game-processes-ui-20261010`.
- `.gitignore`, `docs/ACCOUNTS-PROCESS.md`, `docs/CAPACITY-TESTING.md` et ce
  document : procedure et limites mesurees.

Les chemins `services/` ci-dessus sont sous `server/src/`, `capacity/` sous
`server/scripts/`, et les composants sous `client/src/components/admin/`.

## Activation et retour arriere

Dans `/etc/ktga/server.env`, apres validation hors production :

```dotenv
GAME_WORKERS_ENABLED=1
GAME_WORKERS=1
ACCOUNTS_PROCESS_ENABLED=0
```

Ne pas multiplier les workers au-dela du nombre de coeurs sans mesure.
Le systemd existant reste responsable du Gateway ; celui-ci lance et arrete
ses enfants. Ne pas lancer un deuxieme Gateway sur la meme base SQLite.
Pour revenir au comportement precedent : `GAME_WORKERS_ENABLED=0`, puis
redemarrage coordonne sans partie en cours. Le champ interne `gameWorker`
reste un checkpoint compatible et n'est jamais expose dans les vues joueur.

## Telemetrie

`/api/admin/health` expose `gameWorkers` et `processes.games` : PID, CPU sur
la derniere periode, RSS, boucle P95/max, nombre de rooms assignees, preparations,
file et requetes en vol, refus, erreurs, expirations, attente et durees.
Les histogrammes sont bornes a 256 echantillons recents (60 s) ; moyenne et
maximum sont cumulatifs depuis le demarrage. Le CPU total additionne les
processus : 100 % represente un coeur, pas toute la machine.

`ipc` est une latence aller-retour **incluant le traitement du worker**,
pas une mesure pure du reseau. `actions` du worker mesure les preparations
de commandes de jeu ; `transitions` mesure toutes les preparations. Le temps
du pool inclut preparation, transaction et validation, hors attente dans sa FIFO.
La file IPC a sa propre attente. Les comptes de rooms remontes toutes les 5 s
peuvent etre legerement decales ; `assignedRooms` vient du registre courant.
La ligne `Transitions de table` des services cumule les commandes coordonnees,
y compris les reprises pre-commit. Son traitement mesure toute la commande,
attente dans la FIFO et validation durable incluses, pas le CPU du moteur seul.
Ces cumuls restent inclus dans l'historique anonyme d'execution existant.

## Tests reproductibles

Depuis `server/` :

```sh
npm test
GAME_WORKERS_ENABLED=1 GAME_WORKERS=2 npm test
npm run capacity:compare -- --workers 0,1 --clients 60 --seconds 30 --output ../docs/previews/game-processes
```

Le comparatif cree deux instances consecutives, des comptes fictifs, des bases
temporaires, des mots de passe avec le meme facteur de hash, puis arrete tous
les processus et verifie soldes, XP, succes et reglements. Il ne modifie pas la
production. Il n'evalue pas Nginx public, TLS ou l'anti-DDoS OVH. Le generateur
partage le CPU de l'hote ; ne pas interpreter ce test comme une capacite absolue.
Le test admin propose `Processus jeux` : 0 pour le mode historique, 1 a 4 pour
le mode multiprocessus ; utiliser exactement le meme scenario pour comparer.
Sur un VPS partage avec la production, `compare.mjs --guard-db CHEMIN_SQLITE`
lit uniquement le nombre de rooms reelles et interrompt les fixtures si une
vraie room est ouverte. Les mesures restent impactees par le generateur local.

Les tests specifient : les 15 moteurs, controle d'epoch/version, commande unique,
FIFO et surcharge, echec apres ecriture sans double mise, rollback du fencing,
API avec deux vrais processus et reglements classes via les APIs existantes.

## Mesures du 10 octobre 2026

Les scenarios couvrent les quinze jeux, actions toutes les secondes, lectures
toutes les cinq secondes, polls habituels et deux sockets par joueur. Les tests
VPS utilisent des bases fictives, Node 24.21.0, deux vCPU et le generateur sur
le meme hote. Les comptes ont un facteur de hash 10 identique entre modes.
Toutes les lignes ci-dessous passent les douze controles d'integrite : soldes
et transactions, XP/recompenses, unicite des reglements et donnees fictives.

| Essai | Requetes | Actions | Erreurs inattendues | HTTP P95 | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Local 60, historique | 1741 | 553 | 0 | 70 ms | Regression OK |
| Local 60, 1 worker apres correction de conflit | 1734 | 542 | 0 | 70 ms | Regression OK |
| Local 60, 2 workers apres correction de conflit | 1712 | 548 | 0 | 70 ms | Regression OK |
| VPS 500, historique, 60 s | 23605 | 7658 | 0 | 485 ms | Scenario OK, Gateway pres de 100 % CPU |
| VPS 500, 1 worker, premier essai | 21540 | 6324 | 4 | 695 ms | Echec, conflits pre-commit |
| VPS 500, 1 worker, caches/index/publication corriges | 22937 | 7207 | 1 | 545 ms | Echec, suppression en conflit 409 |
| VPS 1000, 1 worker, reprise de conflits generalisee | 14237 | 1624 | 1194 | 8005 ms | Echec, arret de securite |

Le dernier essai est interrompu apres environ 23 secondes de charge active,
avant les 60 secondes demandees ; ces volumes incluent preparation et nettoyage.
En charge, le HTTP P95 atteint 8010 ms. Les timeouts touchent actions, notifications,
activite, historique, chat et d'autres lectures. Les 227 requetes annulees au
moment de l'arret sont distinguees des erreurs inattendues dans le rapport.
Le Gateway atteint environ 102-104 % CPU dans les releves de charge, contre
9-10 % pour le Game Worker. La file globale atteint 184 commandes dans un
releve, et l'attente IPC P95 488 ms. Il n'y a pas d'expiration IPC dans ces
releves : les timeouts HTTP ne prouvent pas un moteur de jeu sature.

L'optimisation des ticks et des caches ameliore la boucle Gateway, mais le
mode multiprocessus n'ameliore pas encore le debit HTTP net a 500 joueurs.
Le conflit constate a 500 a conduit a la reprise bornee des seules transactions
non validees. Le scenario a 500 n'a pas ete rejoue sur cette derniere revision ;
le test a 1000 qui l'inclut echoue par saturation HTTP. Il n'y a donc ni nouveau
palier certifie a 500 ni marge durable validee a 1000.

Rapports locaux consultables :

- `docs/previews/game-processes-20261010/results-500/` : comparatif initial VPS.
- `docs/previews/game-processes-20261010/results-500-scoped/` : optimisations.
- `docs/previews/game-processes-20261010/results-1000/` : echec et telemetrie.
- `docs/previews/game-processes-retry-20261010/` : regression locale 1/2 workers.

Les essais n'ont pas traverse TLS/Nginx public ni l'anti-DDoS OVH. Ils ne sont
pas un test d'endurance, et le generateur partage les deux coeurs du VPS.
Les corrections finales de presentation des profils ne sont pas incluses dans
ces rapports de charge ; elles sont couvertes par les tests API et kernel.

Verification fonctionnelle disponible : suite serveur multiprocessus complete
(463 passes, 2 ignores, aucun echec), 43 tests cibles passes apres la derniere
integration de supervision,
83 tests client passes, build client/SSR valide et supervision desktop/mobile
valide avec bloqueur. Deux tests serveur propres a Linux sont ignores sous
Windows. Les API classees ont aussi ete exercees avec deux vrais Game Workers
(13 tests passes, dont forfaits, Belote, contrats prives et annulation technique).
Le build conserve l'avertissement existant sur les chunks de plus de 500 kB.

## Etapes de capacite

### Vers 1 000 joueurs durables

Valider d'abord 500, puis 1 000 sur le VPS avec 1 Game Worker, jeux et lectures
realistes, deux sockets par joueur, chat, succes et classed. Exiger aucun timeout,
audit financier valide et une marge CPU, pas seulement des connexions stables.
Faire un test d'endurance d'au moins une heure et des arrets de worker en charge.
Profiler ensuite les commits SQLite, projections Socket.IO et succes qui restent
dans le Gateway. Le nouveau worker ne constitue pas a lui seul une solution
garantie aux timeouts HTTP observes a 1 000 joueurs.

### Vers 5 000 joueurs

Mesurer un VPS 4 vCPU avec Gateway + 2 Game Workers, puis davantage de coeurs
si necessaire. Remplacer les snapshots IPC par des projections/deltas et limiter
les diffusions aux rooms et champs changes. Isoler la persistance dans un service
transactionnel asynchrone avec journal/outbox durable ; ne pas ouvrir plusieurs
writers concurrents sur le meme modele SQLite en memoire. Deplacer les calculs
purs de succes et reglement dans des workers avec validation de revision.
Isoler les lectures lourdes et appliquer des budgets de file/latence par service.

### Vers 20 000 joueurs

Ce palier depasse l'objectif d'un VPS 2 vCPU. Prevoir plusieurs Gateway et
Game Workers sur plusieurs machines, routage sticky/adapter Socket.IO partage,
transport distribue, registry/leases avec fencing durable, reprise et drainage.
Le ledger devra probablement migrer vers une base transactionnelle telle que
PostgreSQL avec unicite des reglements et outbox, sans doubler les ecritures.
Redis devient utile pour routage/presence/pub-sub, pas une source alternative
de soldes. Tester aussi quotas sockets, file descriptors, TLS, Nginx, reseau,
reconnexions massives, pannes et restauration. Chaque palier doit etre mesure ;
aucun nombre de processus ne garantit mecaniquement 20 000 joueurs actifs.
