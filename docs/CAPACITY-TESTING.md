# Tests de capacite KTGA.ME

## Objectif et limites

Ces outils mesurent une charge applicative sur une instance privee, avec de vrais
clients HTTP et Socket.IO. Ils ne simulent pas une attaque DDoS et ne doivent pas
viser www.ktga.me, api.ktga.me ou le port de production 4000.

Le generateur utilise le client Socket.IO deja installe dans `client/node_modules`.
Installer les dependances de `server` et `client` avant de commencer. Node >=22.13
est necessaire. Aucune dependance supplementaire pour le generateur.

Les resultats ne donnent pas un nombre universel de joueurs supportes : le rythme
des coups, le nombre de tables, le chat global et les consultations de pages changent
fortement la charge. Un client qui attend son tour coute moins qu'un joueur actif.

## Isolation

`capacity:serve` cree un repertoire temporaire `ktga-capacity-*`, onze bases separees,
des comptes fictifs adultes, un secret de session aleatoire et un mot de passe de test.
Le marqueur aleatoire de l'instance est verifie avant la premiere mutation.
SMTP, certificats locaux et service de fichiers frontend sont desactives.
Il ne lit ni ne modifie les bases, comptes ou secrets de production.

Le fichier `manifest.json` contient les identifiants **de test** et une session de
mesure administrative. Garder ce fichier hors Git, ne pas le partager, et le supprimer
apres utilisation. Les rapports ne contiennent ni ce mot de passe ni cette session.
Sur Linux, le fichier est cree avec des permissions 0600.

L'instance tourne avec NODE_ENV=production. Les limites HTTP globales/par IP et celles
de connexion sont relevees **uniquement sur cette instance**, car tous les clients
du generateur partagent une adresse. Les limites propres au chat et aux evenements
restent actives. Utiliser `--rate-limits production` pour verifier les limites normales,
separement d'une mesure de capacite. Aucune protection de production n'est modifiee.

## Premier test local

Dans `server`, premier terminal :

```powershell
npm run capacity:serve -- --port 4101 --users 1000 --ttl 1800
```

La sortie indique le chemin du manifeste. Dans un deuxieme terminal :

```powershell
npm run capacity:run -- --manifest CHEMIN_MANIFESTE --clients 25 --seconds 90 --ranked true --output ../docs/previews/capacity-local.json
npm run capacity:inspect -- --manifest CHEMIN_MANIFESTE --output ../docs/previews/capacity-integrity.json
```

Arreter le premier processus apres le test. Son expiration automatique est un
garde-fou, pas un remplacement de l'arret volontaire.

## Scenarios

- Connexion par mot de passe avec bcrypt, comptes fictifs deja verifies.
- Une vraie connexion WebSocket independante par utilisateur. Avec
  `--routine-polls true`, une seconde connexion pour les conversations, les
  notifications toutes les 10s, le compteur du chat toutes les 60s et le suivi
  facultatif d'activite toutes les 30s. Ce suivi est explicitement accepte par
  les comptes fictifs; cela ne modifie pas le consentement des vrais joueurs.
- Creation, acces aux tables publiques, preparation et demarrage.
- Adaptateurs pour les quinze jeux, uniquement avec l'etat visible par le joueur.
- Lancers et relances, selections, contrats, plis, enchere, bluff et mises.
- Les attentes sont passees via l'API du jeu; le delai serveur de relance est respecte.
- Parties classiques repetees; preparation et acceptation des parties classees.
- Consultation boutique, amis, succes, historiques, transactions et classements.
- Chat global, prive et de table, ainsi que reception des messages par WebSocket.
- Reconnexion d'une partie des clients; spectateurs lorsqu'il reste des places dans
  le groupe de clients et verification du refus des actions de jeu pour eux.
- Participation a un evenement fictif; double envoi avec le meme identifiant pour
  verifier l'idempotence. Deux participants seulement pour respecter son limiteur IP.
- Verification qu'une action sur une partie terminee est refusee.
- Controle SQLite, cles etrangeres, unicite des reglements, des actions d'evenement
  et des recompenses. Reconciliation exacte de l'XP avec les gains de parties/succes
  et des soldes avec le registre des transactions.

Une partie peut encore etre en cours a la fin du test. Le rapport distingue les
coups acceptes, les parties commencees et celles terminees naturellement. Les
abandons de nettoyage ne comptent pas comme des victoires naturelles.

Options utiles : `--games all`, `--games yahtzee,421`, `--ramp-ms 150`,
`--room-ramp-ms 1200`, `--ranked true`. Le classe concerne une partie des groupes.
Options de cadence : `--action-ms 3000` donne 3..6s entre les actions de chaque
table, `--browse-ms 15000` donne 15..24s entre les consultations de chaque joueur.
Par defaut, le scenario reste intensif (250..500ms et 5..8s).
Avec `--live-state true`, les coups utilisent l'etat prive du joueur recu par
WebSocket, comme dans le navigateur. Sans cette option, une lecture HTTP precede
chaque coup : c'est un scenario plus intensif, a distinguer dans les resultats.
La duree de charge commence apres la connexion ET la preparation de tous les groupes.
La mise en place, la charge et le nettoyage ont leurs percentiles separes.
Un palier doit durer suffisamment longtemps pour tester les resultats finaux.

Le script arrete la charge apres trois mesures consecutives avec latence de boucle
P95 >500ms, memoire systeme libre <150Mo ou plus de dix nouvelles erreurs par mesure.
Il s'arrete aussi apres trois echecs du capteur de sante. Les requetes expirent apres
8s. Ne pas augmenter le palier apres un arret ou des erreurs inexpliquees.
Il refuse aussi un manifeste dont l'expiration est trop proche pour couvrir la
mise en place, le test et le nettoyage. Prevoir une duree d'instance suffisante.

Les rapports JSON indiquent les percentiles globaux, par route et par phase, les
erreurs, la couverture des jeux, le CPU/RAM/boucle du serveur et la charge du generateur.

## VPS et OVHcloud

Pour mesurer une capacite externe, faire tourner le generateur sur le PC, pas sur le
VPS cible. Un passage local au VPS peut isoler un probleme de transport SSH, mais
partage alors le CPU/RAM de la cible et ne mesure pas le parcours reseau public.
Sur le VPS, lancer
uniquement l'instance isolee, liee a 127.0.0.1:4101, avec une limite memoire et de duree.
Acces depuis le PC par un tunnel dedie :

```powershell
ssh -N -L 127.0.0.1:4102:127.0.0.1:4101 -o ExitOnForwardFailure=yes ktga-vps
```

Copier le manifeste dans un repertoire temporaire prive du PC, puis ajouter
`--target http://127.0.0.1:4102` a la commande du generateur.

Le tunnel evite un flot de connexions HTTP publiques, mais son trafic SSH emprunte
tout de meme le reseau OVHcloud. Il ne garantit pas l'absence de filtrage.
Ne pas desactiver l'anti-DDoS ni ouvrir le port de test sur Internet.
Consulter le [Network Security Dashboard OVHcloud](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/dedicated-servers/network-security-dashboard)
si des perturbations reseau apparaissent. Cette campagne exclut Nginx/TLS/anti-DDoS
et ne certifie donc pas leur capacite; un test public borne doit rester une etape separee.
Le proxy prive optionnel `server/scripts/capacity/nginx.conf` inclut Nginx HTTP,
mais pas TLS ni le chemin public. Il ecoute exclusivement sur loopback:4104 et
utilise une instance/backend dedies sur loopback:4103. Ne pas remplacer la
configuration du Nginx public par ce fichier.

Un seul tunnel SSH peut limiter le test avant le serveur : OpenSSH Windows a
atteint sa limite de fichiers ouverts lors de la premiere tentative a 250.
Le processus distant `sshd-session` utilise aussi habituellement une limite de
1024 fichiers, insuffisante pour 500 joueurs avec deux connexions chacun, plus
HTTP. Ces echecs de transport sont conserves dans les rapports, mais ne donnent
pas une mesure de capacite applicative. Ne pas desactiver les garde-fous pour les
masquer. Utiliser plusieurs tunnels prives (`tunnels.ps1`, `--targets`), ou un
client SSH adapte et une limite relevee uniquement sur son processus distant
identifie. Ne pas modifier les limites de tous les acces SSH du VPS.

Une maintenance requiert l'accord du proprietaire et aucune table reelle active.
`vps-maintenance.sh begin UNITE_TEST` verifie les tables et arme une remise en route
automatique du service normal a 25 minutes avant de le couper. Toujours terminer avec
`vps-maintenance.sh end UNITE_TEST`, verifier la sante publique et fermer le tunnel.
Si l'instance de test a change entre-temps, arreter aussi sa nouvelle unite.
Ne jamais reprendre le fichier `/etc/ktga/server.env` pour configurer une simulation.

## Controle navigateur

Le controle optionnel `client/test/capacity.smoke.mjs` utilise les outils Playwright
deja disponibles localement, Edge, le tunnel 4102 et un proxy Vite temporaire 4251.
Il teste accueil et lancer Yahtzee en desktop/mobile avec un bloqueur de contenu.
Les domaines Google sont bloques pour ne pas fausser Analytics. Il garde les images
dans `docs/previews/capacity-browser` et arrete Vite a la fin.

```powershell
# Dans client
node test/capacity.smoke.mjs --manifest CHEMIN_MANIFESTE
```

Les temps de ce controle incluent la compilation Vite et ne mesurent pas le chargement
des fichiers de production par Nginx. Les captures servent a verifier le rendu et
l'interaction, pas a annoncer un temps de chargement commercial.

## Resultats du 8 octobre 2026

Cible : VPS Debian 13, 2 vCPU, environ 3,8 Go de RAM, Node 24.21.0.
Generateur sur le PC, transport SSH, instances privees avec 1 000 comptes fictifs
plus un compte de mesure. Le service normal a ete suspendu avec autorisation,
sans table active, puis remis en service. Les donnees reelles n'ont pas ete utilisees.

| Joueurs connectes | Requetes | Coups acceptes | Parties terminees naturellement | Erreurs HTTP/reseau | P95 d'un coup |
| --- | ---: | ---: | ---: | ---: | ---: |
| 25 | 4 045 | 1 257 | 31 | 0 | 260 ms |
| 50 | 7 028 | 2 123 | 51 | 0 | 720 ms |
| 100, arrivee etalee | 4 690 | 1 421 | 27 | 40 | 1 050 ms |

25 : palier de 90 secondes, P95 global 360ms, boucle P95 maximum 136ms.
50 : palier de 120 secondes, P95 global 835ms, CPU maximum environ 107% d'un coeur.
100 : cible de 120 secondes, interrompue avant la fin par les garde-fous.
P95 pendant la charge 1 295ms, P99 7 190ms, plusieurs expirations a 8s.
La boucle a depasse 500ms sur trois mesures successives. CPU maximum environ 111%
d'un coeur, RSS maximum environ 262Mo, plus de 3Go de memoire systeme encore libres.
Le generateur est reste reactif : boucle P95 environ 32ms, memoire environ 87Mo.

Un premier essai a 100 avec des ouvertures de table beaucoup plus rapprochees avait
deja expire pendant la mise en place. Le second essai utilise une nouvelle base
et espace les ouvertures initiales de 1,2 seconde; il confirme une degradation sous
charge continue. Les paliers 250 et 500 n'ont pas ete lances apres cet echec.

Le scenario est volontairement intensif : actions rapides, attente de tour passee,
consultations regulieres et creations de nouvelles tables a la fin des parties courtes.
Ce n'est pas une estimation du nombre de comptes inscrits ou de joueurs simplement
connectes. Le palier 50 fonctionne, mais ne constitue pas une marge confortable pour
promettre 50 joueurs tres actifs en toutes circonstances.

Les quinze jeux ont accepte des coups lors du palier 50. Plusieurs jeux longs ne sont
pas arrives a leur terme naturel pendant ces deux minutes; les rapports le montrent.
Le classe a teste file, confirmation, demarrage, temporisation et reglement, dont des
abandons au nettoyage. Un test fonctionnel plus long reste necessaire pour certifier
toutes les fins de partie naturelles et variantes classees.

Les deux controles finaux SQLite sont bons : integrite, cles etrangeres, historiques
sans doublon, reglements classes uniques, recompenses uniques, actions d'evenement
idempotentes, XP correspondant exactement aux recompenses enregistrees et soldes
correspondant exactement aux transactions. Aucun ecart detecte.

Le navigateur desktop/mobile a charge l'accueil et la table Yahtzee pendant le
palier 50 avec un bloqueur de contenu, sans erreur JavaScript detectee. Le premier
controle de clic etait insuffisant : le proxy de test ne transmettait pas l'origine
attendue. Apres correction du proxy, le lancer a ete revalide localement avec une
assertion HTTP 200, cinq des recus et deux relances restantes. Cette derniere
verification n'est pas une mesure navigateur sous charge VPS.
Captures finales : `docs/previews/capacity-browser/`.
Les captures mobiles montrent aussi des intitules de categories Yahtzee tronques;
ce defaut de mise en page preexistant reste a corriger, independamment de la charge.

Rapports bruts :

- `docs/previews/capacity-vps-25.json`
- `docs/previews/capacity-vps-50.json`
- `docs/previews/capacity-vps-100.json` : premier essai d'arrivee groupee.
- `docs/previews/capacity-vps-100-staggered.json` : second essai, mesure de charge.
- `docs/previews/capacity-vps-integrity.json`
- `docs/previews/capacity-vps-100-integrity.json`

Les premiers essais de mise au point (`capacity-local-36*`, `capacity-vps-10.json`)
contiennent des erreurs du generateur : messages trop rapproches et fermeture apres
transfert de l'hote Belote. Ces points ont ete corriges dans les outils de test;
ils ne sont pas comptabilises comme des defaillances de l'application.

Conclusion de cette premiere campagne : le point limitant observe est le temps de traitement du processus Node,
pas une penurie de RAM. Il faut profiler les traitements synchrones, les ecritures
SQLite et les diffusions de listes de tables avant d'augmenter la charge. Ces causes
precises restent des pistes d'investigation, pas un diagnostic de profilage deja fait.
Un test avec les cadences humaines et un test Nginx/TLS borne sont aussi a prevoir.

## Optimisations et deuxieme campagne

Les mesures precedentes sont conservees comme reference avant optimisation. Le
profilage a ensuite confirme des comparaisons JSON globales lors d'ecritures de
salon, des normalisations repetees des parametres, des recalculs de statistiques,
le calcul bcrypt sur le thread principal et des listes completes de salons envoyees
a des connexions qui n'en avaient pas besoin.

Les corrections n'introduisent ni dependance ni migration de schema :

- Ecritures ciblees sur les comptes et salons touches, incluant les joueurs quittant
  une table et les destinataires des transactions; rollback conserve.
- Inventaire, progression et recompenses normalises : seules les donnees modifiees
  sont reecrites, au lieu de supprimer et reinserer tous leurs enfants.
- Statistiques indexees, cachees par joueur et invalidees par ses propres archives.
- Progression des succes cachee par joueur, avec invalidation sur les metriques du
  compte, l'inventaire, l'XP, les archives et les regles admin; cache borne a 2048.
- Configurations normalisees immuables, avec detection des modifications admin.
- Calcul des mots de passe dans un pool borne de workers; memes hashes bcrypt et
  cout, refus explicite temporaire si la file est pleine.
- Validation des JWT HS256 avec reutilisation de la cle.
- Abonnements temps reel distincts pour accueil, table, chat et evenement; deltas
  de salons pour les nouveaux clients et repli compatible pour les anciens.
- Un meme auteur de chat n'est decore qu'une fois par lecture; filtres de visibilite,
  blocage, sourdine et informations privees restent appliques.
- Le chat utilise son abonnement dedie, pas aussi les connexions de jeu/accueil;
  les anciens clients conservent leur abonnement. Le generateur utilise les memes
  flux que le navigateur quand les appels periodiques sont actives.
- Rafraichir `/api/me` ne compare plus les documents de tous les comptes.
- File d'acceptation Node de 4096, connexions HTTP persistantes vers Node (cache
  Nginx de 256 connexions inactives par worker), limites Nginx de 8192 par worker.
  Le correcteur Nginx preserve les autres directives et dispose d'un rollback.

Sur le PC, le scenario intensif de 50 joueurs passe de 385-390ms a 55ms de P95
global (45ms pour les actions), sans erreurs. Ce n'est pas une mesure du VPS.

Sur le VPS, le scenario suivant utilise 3-6 secondes entre deux actions par table,
15-24 secondes entre deux consultations par joueur et, au palier 500, les appels
periodiques du site : notifications, conversations et activite. Chaque joueur a
deux connexions temps reel. La preparation est terminee avant de mesurer la charge.
Ces cadences different de la premiere campagne; ses chiffres ne sont donc pas
directement comparables.

| Joueurs | Duree charge | Requetes totales | Coups acceptes | Fins naturelles | Erreurs | P95 action |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 250 | 90s | 9383 | 2303 | 26 | 0 | 335ms |
| 500 | 90s | 23664 | 3888 | 47 | 0 | 1315ms |

Les requetes totales incluent preparation et nettoyage. A 500 : 1000 connexions
temps reel, CPU maximum environ 116% d'un coeur, boucle P95 maximum 73ms, RSS maximum
460Mo. L'audit de l'integrite, des recompenses, de l'XP et des soldes est bon.
Les quinze jeux ont effectivement accepte des actions. Le navigateur desktop et
mobile a aussi valide un lancer Yahtzee pendant la charge, avec bloqueur de contenu.

Rapports : `docs/previews/capacity-optimized-vps-250-multitunnel.json`,
`capacity-optimized-vps-500-multitunnel.json` et leurs rapports `*-integrity.json`.

Les tunnels SSH ont eux-memes une limite : un seul transport OpenSSH Windows a
atteint sa limite de fichiers ouverts, puis un seul transport PuTTY a provoque des
delais sous charge. Les essais valides utilisent plusieurs transports distincts,
un Nginx prive sur le VPS et des limites de fichiers adaptees uniquement aux sessions
de test. Ils ne traversent ni le TLS public ni l'anti-DDoS OVH. Le serveur public
reste en fonctionnement sur ses donnees reelles, jamais reprises par les simulations.

Les deux premiers essais a 1000 ne sont pas valides : le premier a ete interrompu
sans rapport final apres saturation et le second conserve son rapport d'echec dans
`capacity-optimized-vps-1000-incremental.json`. Ce dernier a 2000 connexions stables
mais des requetes expirant a 8 secondes. Le profilage a alors repere le rafraichissement
global des comptes dans `/api/me`, corrige avant une nouvelle mesure.

Le correctif `/api/me` seul n'a pas suffi. Les rapports suivants conservent deux
autres echecs : `capacity-optimized-vps-1000-focused.json` et
`capacity-optimized-vps-1000-direct.json`. Le second place le generateur sur le VPS
pour retirer SSH de la mesure : les expirations persistent, confirmant une limite
applicative. Le cache de progression et la mutualisation des lectures de configuration
pour tout un classement ont ete ajoutes ensuite. Les audits d'integrite de ces deux
essais restent bons malgre leur arret anticipe.

Le cache seul n'a pas suffi non plus : `capacity-optimized-vps-1000-cached.json`
conserve 585 erreurs, et `capacity-optimized-vps-1000-human-before-proxy.json`
conserve un echec avec une cadence plus lente de 5-10 secondes. Ces essais n'ont
donc pas ete retenus comme preuve de capacite. Le profilage suivant a aussi montre
le cout des diffusions de chat; leur double abonnement a ete retire, les controles
de sourdine rendus sans mutation, et le proxy/acceptation TCP ont ete corriges.

Le dernier scenario intensif apres ces corrections conserve 787 erreurs dans
`capacity-optimized-vps-1000-proxy.json`. Le scenario utilisant l'etat WebSocket,
avec 5-10 secondes entre les coups et 15-24 secondes entre les consultations,
echoue lui aussi : `capacity-optimized-vps-1000-live.json`. Il a accepte 7986 coups
sur les quinze jeux et termine naturellement 96 parties, mais 339 requetes ont
expire avant l'arret de securite. Le P95 de charge est 1580ms et le P99 8005ms.
Les reconnexions programmees ont fonctionne; les 2000 connexions restent stables.
L'audit final `capacity-optimized-vps-1000-live-integrity.json` passe ses 12 controles,
y compris les reglements classes uniques et la reconciliation des soldes et XP.

### Conclusion et suite

**Capacite mesuree : 500 joueurs dans ce scenario pendant 90 secondes sans erreur.
L'objectif de 1000 joueurs actifs n'est pas valide.** Ce palier de 500 ne constitue
pas une garantie de production : il faut encore un test d'endurance, des archives
et inventaires plus volumineux, et une mesure par HTTPS public avec un generateur
exterieur autorise et une charge bornee.

Au palier 1000, le processus applicatif atteint environ un coeur complet pendant
la charge, avec des attentes HTTP et une latence de boucle accrue. La memoire libre
reste confortable. Le generateur sur le VPS consomme aussi du CPU : cela doit etre
pris en compte avant d'attribuer une capacite maximale au materiel.

Pour continuer, profiler les ecritures synchrones et les calculs/diffusions restants,
puis deplacer les lectures lourdes et calculs purs vers des workers avec des files
bornees. Les mutations d'une table et ses reglements doivent garder une autorite
unique, leur atomicite et leur idempotence. Une repartition multi-processus demandera
un routage stable des tables, une presence partagee et une gestion explicite des
invalidations de caches; lancer plusieurs copies du serveur actuel sur les memes
bases ne suffit pas et peut compromettre les soldes et recompenses.

Une machine plus puissante peut etre evaluee separement, mais aucun changement
d'offre payante n'est realise par ces outils. Les rapports d'echec sont conserves;
les delais d'expiration et seuils de securite ne sont pas allonges pour obtenir
artificiellement un resultat positif.

### Deploiement et verification

Les optimisations ont ete deployees le 9 octobre 2026 apres verification de
l'absence de tables actives, avec sauvegarde privee du code, du frontend et des
onze bases. Aucun compte ni secret de production n'a ete remplace. Les onze bases
passent ensuite `quick_check` et le controle des cles etrangeres; le secret TOTP
existant reste dechiffrable.

Verification fonctionnelle : 387 tests serveur passent, avec un test Nginx ignore
sous Windows mais execute avec succes sur Debian. Les 83 tests client passent.
Les tests de proxy Linux confirment aussi la reutilisation de la connexion HTTP
au backend. La verification du site deploye passe sur desktop et mobile, avec
bloqueur de contenu, session privee de diagnostic, boutique, administration,
previsualisation de brouillon, FAQ et status; aucune erreur JavaScript ni image
cassee detectee, et des trames WebSocket de production sont recues.
Captures : `docs/previews/vps-debian-20261007/1791513164488/`.

Les instances privees de charge et leurs tunnels ont ete arretes; les fichiers
d'identifiants de test ont ete supprimes. Le service public reste actif.

## Supervision des workers et caches

Administration > Supervision > Workers et caches expose les workers de mots de
passe et le pool partage de lecture. Aucune metrique de worker de jeu n'est
inventee. L'API `/api/admin/health` reste reservee aux
administrateurs, y compris pour ces nouveaux champs.

- Taille maximale du pool, workers demarres a la demande, occupes et disponibles.
- File d'attente actuelle, limite de 128 et age de la plus ancienne tache.
- Taches admises, terminees, en echec, annulees et refusees pour saturation.
- Erreurs de workers et arrets inattendus; l'arret normal ne compte pas comme panne.
- Durees moyennes et maximales cumulees, et P95 recent d'attente et de traitement.
- Trois caches : configurations, statistiques des joueurs et progression des succes.
  Taille, capacite lorsqu'elle est bornee, reutilisation, recalculs, invalidations
  detectees a la lecture et evictions sont disponibles. Les reutilisations dans
  un meme scope synchrone sont aussi comptees pour les configurations.

Les compteurs sont en memoire, depuis le demarrage du pool ou l'initialisation du
cache; ils repartent apres redemarrage. Les durees recentes utilisent au maximum
les 256 derniers departs/fins sur 60 secondes. Sans observation recente, le P95 est
`null`, affiche comme indisponible et non comme une mesure de 0ms. Aucune valeur
de mot de passe, hash, identifiant joueur ni contenu du cache n'est exposee.

La supervision signale une alerte si l'attente depasse une seconde, si la file
atteint 80% de sa capacite ou pendant 60 secondes apres une anomalie. Elle ne
modifie ni les limites d'admission ni le comportement de la connexion. Les releves
de charge/attente restent dans l'historique existant, borne a 720 points de 5s.

Tests : compteurs, saturation, panne, reprise, annulation, limites des mesures,
invalidation des caches, confidentialite et acces admin; controles navigateur
desktop/mobile avec bloqueur de contenu et alerte simulee. Captures dans
`docs/previews/execution-health/`.
Deploiement du 9 octobre 2026 verifie sur le site public : onglet, trois caches,
quatre indicateurs, affichage desktop/mobile et WebSocket. Tests complets : 395
tests serveur passes (un test de proxy ignore sous Windows) et 83 tests client
passes; les six tests de telemetrie passent aussi sur Debian.

## Services applicatifs et lectures isolees

Les endpoints d'historique, de transactions et de statistiques personnelles
utilisent un pool commun de lecture SQLite, sans import du module de migration.
Les connexions sont en lecture seule et chaque travail utilise un snapshot SQL.
Les filtres, la pagination et les calculs existants sont reutilises; les profils
et permissions sont revalides dans le processus principal avant la reponse.

Par defaut : un worker de lecture, 128 travaux en attente maximum, huit travaux
simultanes maximum par compte, et un delai de dix secondes incluant l'attente.
Une deconnexion annule le travail. Une erreur ou une saturation retourne un 503
explicite, sans reexecution synchrone susceptible de saturer le processus principal.
Un remplacement attend la terminaison effective du worker precedent; une rafale
d'annulations ne cree donc pas une rafale de threads. L'environnement du worker
ne contient que le fuseau du casino, pas les secrets du serveur.

`READING_WORKERS` permet de choisir de 1 a 4 threads pour tout ce pool, pas par
fonctionnalite. Sur le VPS a deux vCPU, conserver la valeur par defaut avant
d'augmenter ce nombre. Le pool bcrypt reste distinct. En mode historique,
les moteurs de table, l'attribution des recompenses, l'Elo et les ecritures restent
synchrones sous une autorite unique. Le mode Game Workers optionnel decrit dans
[GAME-PROCESSES.md](GAME-PROCESSES.md) deplace les moteurs, mais pas encore
les ecritures ni le calcul transactionnel des recompenses.

La supervision distingue neuf services, leur mode d'execution, les compteurs,
files, echecs, annulations, expirations et durees. Les durees incluent le temps
ecoule, et peuvent se recouvrir entre services imbriques : ne pas les additionner
comme du temps CPU exclusif. Pour les workers, elles incluent aussi le demarrage
eventuel et le passage des messages. Les P95 restent limites a 256 mesures / 60s.

Les deltas anonymes sont conserves par releves de cinq minutes, pendant 30 jours,
dans `execution.sqlite` a cote de la base principale (`EXECUTION_DB_PATH` permet
de changer ce chemin). Ce fichier est inclus dans la sauvegarde de /var/lib/ktga.
Un arret normal enregistre aussi le dernier intervalle; un crash peut perdre les
cinq dernieres minutes. Aucune entree individuelle de joueur n'est conservee.
La vue propose les cumuls 24h / 7j / 30j; `/api/admin/execution-history?days=30`
est reserve aux admins et borne a 30 jours. Les moyennes portent uniquement sur
les travaux effectivement demarres, pas sur les refus ou annulations en file.

Regression locale : 60 joueurs / 45s, 1290 requetes, 285 actions sur les quinze
jeux, aucune erreur inattendue et douze controles d'integrite valides. Rapports :
`docs/previews/capacity-service-workers-local-60*.json`. Ce test de regression
ne requalifie pas le palier VPS de 500 et ne valide pas 1000 joueurs actifs.

Deploiement du 9 octobre : neuf services visibles sur desktop/mobile, avec
bloqueur de contenu, et relevés de lecture effectivement verifies sur les donnees
de production sans mutation. Les onze bases metier et la base technique passent
les controles d'integrite; le secret MFA existant reste lisible. Tests : 406 tests
serveur passes, un test Nginx ignore sous Windows, 83 tests client passes et
29 tests cibles passes sur Debian. Les services sensibles ne sont pas distribues.

La 0.2.1 a ete publiee le 9 octobre 2026, en conservant les 31 blocs du brouillon
edite et en ajoutant cinq blocs sur l'optimisation, la capacite et la supervision.
Les 26 insignes sont verifies sur desktop/mobile. Captures de publication :
`docs/previews/patchnote-0.2.1-20261009/`.

## Tests depuis l'administration

Administration > Pilotage > Debug / Tests permet de configurer la charge,
les quinze jeux, les cadences de connexion/action/lecture, le nombre de
connexions paralleles, les activites (chat, evenements, presence, reconnexion,
classe) et les seuils d'arret. Les prereglages commencent a dix joueurs.
Le nombre de jeux qui recevront effectivement une table est affiche avant
le lancement; le rapport expose les actions et parties terminees par jeu.

Le moteur reutilise les adaptateurs CLI et lance un serveur de test sur une
adresse loopback avec port aleatoire. Ses bases, uploads et comptes sont
fictifs; son secret de session est aleatoire, les emails sont desactives.
L'environnement de production et ses secrets ne sont pas transmis. Le
fichier .env du serveur n'est pas charge dans cette instance. La configuration
n'accepte aucune URL cible, commande ou chemin de fichier fourni par l'admin.
Les routes `/api/admin/tests` sont reservees aux administrateurs, pas aux editeurs.

Un seul test peut tourner a la fois. Toute table reelle ouverte, publique ou
privee, bloque le lancement. Le retour d'une vraie table, un manque de memoire
ou une latence excessive du serveur principal provoque l'arret. Les mesures
du serveur de test declenchent aussi l'arret apres trois echantillons consecutifs
hors seuil (intervalle de cinq secondes). Une duree maximale et la perte de
connexion au processus parent ferment les processus enfants, sous Windows
comme Linux. Le bouton Arreter conserve un rapport partiel apres nettoyage.

Les onglets Configuration, Resultats et Historique regroupent graphiques,
couverture des jeux, latences par route, services, comparaison et douze controles
d'integrite. Export JSON fournit la configuration, la version, le materiel,
les echantillons anonymes, erreurs classees et verifications; ni mots de passe,
cookies, tokens, manifeste de test, chemins internes ni comptes reels.
Les rapports sont conserves dans `tests.sqlite`, a cote de la base principale,
pendant trente jours, avec cinquante tests maximum. Ils sont compris dans
la sauvegarde de `/var/lib/ktga`. Une interruption serveur est notee au redemarrage.
Les longs historiques sont bornes ou sous-echantillonnes pour limiter leur taille.

Attention : generateur, instance de test et vrai serveur partagent la meme
machine. Ces resultats ne mesurent ni le reseau public, ni TLS/nginx, ni la
protection anti-DDoS OVH. Un test valide est une regression de son scenario,
pas une certification de capacite. Les connexions WebSocket ne sont pas
equivalentes a des joueurs actifs effectuant toutes les actions simultanement.
Pour une mesure reseau independante, conserver le generateur CLI distant.

Verification navigateur : `node client/test/capacity-admin.smoke.mjs`;
captures et exemple de rapport dans `docs/previews/capacity-admin/`.

Validation du 9 octobre : 414 tests serveur passes (un test Nginx ignore sous
Windows), 83 tests client et 33 tests cibles Debian. Le lancement depuis le
service systemd a ete exerce avec quatre joueurs / dix secondes : 25 actions
legales, aucune erreur inattendue et douze controles d'integrite valides.

Analyse du 10 octobre : voir [le bilan des quatre tests et des optimisations](CAPACITY-REVIEW-2026-10-10.md).
Le superviseur et la CLI acceptent maintenant jusqu'a 2000 comptes, sans
relachement des protections. Un rapport absent ou incomplet reste un echec;
les donnees partielles et diagnostics de processus sont conserves pour analyse.
Cette limite de configuration ne constitue pas une capacite serveur certifiee.

## Comparer Gateway et Game Workers

Le champ `Processus jeux` du test admin et l'option CLI `--game-workers 0..4`
permettent d'exercer le mode historique (0) ou le nouveau registre de rooms.
La commande suivante cree des instances et bases fictives consecutives, avec
le meme scenario et le meme facteur de hash des comptes :

```sh
cd server
npm run capacity:compare -- --workers 0,1 --clients 60 --seconds 30 --output ../docs/previews/game-processes
```

`--guard-db /var/lib/ktga/ktga.sqlite` refuse le test si une vraie room est
ouverte et interrompt les fixtures si une room reelle apparait ensuite. Cette
base de garde est ouverte en lecture seule. Les bases de test ne sont pas des
copies des comptes reels. Le runner ferme les processus enfants et supprime
uniquement les repertoires temporaires dont il a valide le chemin.

Le rapport inclut l'architecture, CPU par processus, boucle, latence IPC et
attente en file, nombre de rooms, actions et echecs des Game Workers. Le P95
mesure inclut le traitement IPC, pas seulement le transfert d'un message.

Essais VPS du 10 octobre : 500 joueurs historiques passent (HTTP P95 485 ms),
mais sans marge CPU sur le Gateway. Le dernier essai multiprocessus a 1000
echoue (1194 erreurs, HTTP P95 8005 ms, arret de securite). Tous les audits
financiers passent. Le mode reste desactive par defaut dans les exemples ; il a
ete active en production ensuite, sur demande explicite, avec un seul worker.
Cette activation ne constitue pas une validation du palier 1000. Les
chiffres complets, fichiers, limites et etapes suivantes sont dans
[GAME-PROCESSES.md](GAME-PROCESSES.md).
