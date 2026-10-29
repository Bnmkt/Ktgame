# Audit des performances multijoueurs de KTGA

**Date : 28–29 octobre 2026.** Base de lecture : HEAD `56845cd72e185373f79b334e341c0fac5a83debd` et arbre de travail local, comportant des modifications préexistantes. Audit documentaire exclusivement : aucun fichier fonctionnel modifié pour cet audit, aucune charge envoyée à la production et aucun nouveau benchmark lancé.

L'[architecture détaillée](architecture_multijoueur.md) décrit les processus, le protocole de transition et le cycle de vie réel ; le [diagramme autonome](architecture_multijoueur.mmd) représente uniquement les composants implémentés. Les évolutions décrites ci-dessous sont des propositions.

## 1. Évaluation générale

**L'architecture actuelle ne permet pas de certifier 1 000 joueurs actifs durables, et aucun résultat versionné examiné ne valide 5 000, 10 000 ou 20 000 joueurs.** Le comparatif à 1 000 clients du 10 octobre échoue. Le chemin multiprocessus fournit une séparation utile des moteurs et un protocole de reprise ; il ne retire pas du gateway les écritures SQLite, les projections privées, le réseau et plusieurs calculs métier.

Lors des essais historiques, le principal consomme environ un cœur, tandis que le processus de jeu demeure peu chargé. Ajouter des workers de jeu ne corrige donc pas mécaniquement la limite observée. Ce résultat ne démontre ni une limite absolue de Node.js ni une nécessité de réécrire les moteurs. Il indique où commencer le profilage.

**Preuves :** [comparatif 500](previews/game-processes-20261010/results-500/comparison.json), [comparatif 500 après optimisations](previews/game-processes-20261010/results-500-scoped/comparison.json), [comparatif 1 000](previews/game-processes-20261010/results-1000/comparison.json) ; [GAME-PROCESSES.md](GAME-PROCESSES.md), section « Mesures du 10 octobre 2026 » ; [game-gateway.js](../server/src/services/game-gateway.js), `commit` et `execute` ; [index.js](../server/src/index.js), `emitRoomUpdate` et `finishRoomIfNeeded`.

## 2. Mesures disponibles et portée

### 2.1 Rapports versionnés exploitables

Les trois comparatifs ont été produits le **10 octobre 2026**, avec Node **24.21.0**, sur un hôte à **2 CPU logiques annoncés**, générateur de charge sur le même hôte. Ils utilisent des bases fictives et des exécutions isolées successives. La documentation de campagne décrit les quinze jeux, deux sockets par joueur, des actions toutes les secondes, des lectures toutes les cinq secondes et les polls habituels. Les résultats ne traversent pas le TLS/Nginx public et ne mesurent pas le réseau public ni une protection réseau d'hébergeur.

| Scénario historique | Verdict du rapport | Requêtes | Actions | Erreurs inattendues | HTTP P95 / P99 | CPU gateway / total | Boucle gateway P95 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| 500 clients, historique, 0 worker jeu | Réussi pour ce scénario | 23 605 | 7 658 | 0 | 485 / 655 ms | 99,88 / 99,88 % | 120,24 ms |
| 500 clients, 1 worker, premier essai | Échec | 21 540 | 6 324 | 4 | 695 / 1 085 ms | 103,54 / 113,59 % | 92,88 ms |
| 500 clients, 1 worker, optimisations de portée/caches | Échec | 22 937 | 7 207 | 1 | 545 / 785 ms | 102,88 / 114,38 % | 74,46 ms |
| 1 000 clients, 1 worker, reprise des conflits élargie | Échec et arrêt de sécurité | 14 237 | 1 624 | 1 194 | 8 005 / 8 060 ms | 96,23 / 105,52 % | 82,03 ms |

Les CPU sont reproduits tels quels ; environ 100 % représente un cœur CPU, pas tout le budget de l'hôte à deux CPU. Le « total » du comparatif ne doit pas être interprété comme une mesure de toute la machine incluant générateur, proxy et noyau. Le P95 HTTP regroupe les requêtes du rapport : il n'est pas un P95 des seules actions ni une mesure du délai d'affichage chez tous les participants.

La campagne documente environ 60 s demandées pour les essais 500. L'essai 1 000 est arrêté après environ **23 s de charge active**, et les comptes de requêtes/actions incluent préparation et nettoyage. Diviser ces totaux par 60 pour annoncer un débit stable serait incorrect. Le document de campagne rapporte, en charge, un gateway autour de 102–104 % CPU, un worker autour de 9–10 %, une file à 184 commandes et une attente IPC P95 à 488 ms, sans timeout IPC dans les relevés considérés. Les 227 annulations de requêtes à l'arrêt sont distinguées des 1 194 erreurs inattendues.

Les douze contrôles d'intégrité déclarés sont vrais pour ces quatre lignes : intégrité SQLite, clés étrangères, unicité de résultats/règlements/historiques/récompenses/actions d'événement, validité XP et cohérence soldes/transactions, comptes fictifs. **L'intégrité finale ne suffit pas à valider la disponibilité ou les délais** : le scénario 1 000 échoue malgré ces contrôles réussis.

**Sources de chiffres :** les trois JSON liés ci-dessus ; [GAME-PROCESSES.md](GAME-PROCESSES.md), explication de la durée, des conflits et des échantillons de charge. Les rapports détaillés `workers-*.json` voisins étaient présents localement mais non suivis par Git au moment de l'audit ; les conclusions chiffrées reproductibles reposent ici sur les comparatifs versionnés et le compte rendu versionné, pas sur leur disponibilité dans un autre checkout.

### 2.2 Ce que ces essais ne prouvent pas

- Le succès historique à 500 ne certifie pas la révision actuelle, une journée d'endurance, une marge de sécurité ou un mélange arbitraire de jeux.
- Le mode multiprocessus à 500 n'a pas obtenu de nouveau palier validé dans ces comparatifs ; le dernier essai à 1 000 inclut des corrections supplémentaires et échoue néanmoins.
- Un nombre de connexions établies, un nom de fichier contenant « 2000 » ou un HTTP `/health` réussi n'est pas une preuve de capacité de jeu actif.
- Aucune mesure de RAM par joueur, de taille de snapshot P99, de fsync P99 ou de débit WebSocket à 20 000 joueurs n'est établie par ces trois comparatifs.
- Le [rapport d'activation](previews/game-processes-live-20261010/checks.json) déclare explicitement absence de test de charge production et `capacity1000Validated:false`. Ses contrôles fonctionnels ne remplacent pas une mesure de capacité.

## 3. Limites techniques et risques

Dans les sections suivantes, **mesuré** se rapporte aux campagnes ci-dessus ; **constat de code** à un mécanisme vérifiable ; **risque** à une conséquence à confirmer par instrumentation. Aucun risque théorique n'est présenté comme un incident observé.

### 3.1 Connexions simultanées et trafic périphérique

**Constat de code.** Le même processus possède Express et Socket.IO. `RoomPage`, `LobbyPage` ou `SpectatorPage` créent leur connexion temps réel ; `useConversationInbox` utilise une connexion de conversation distincte. L'association compte → sockets et salon → sockets est mémoire locale. Plusieurs onglets et spectateurs ajoutent des connexions sans ajouter nécessairement des joueurs assis.

La configuration Socket.IO examinée ne fixe pas de quota global applicatif de connexions ou de budget d'émission par client lent. La protection `/api` est une limite de requêtes HTTP, pas une limite d'événements de socket ou un contrôle d'admission interinstances. Le backlog 4 096 de `listen()` concerne l'attente d'établissement, pas le nombre total de joueurs. `LimitNOFILE=65536` de l'unité systemd est un plafond de descripteurs d'un processus ; `keepalive 256` de Nginx est un cache de connexions upstream inactives, pas une limite de 256 joueurs.

**Risque.** Handshakes TLS, polling, rafales de reconnexion, file descriptors, buffers et trafic de fond peuvent limiter un palier avant les règles de jeu. Le proxy possède aussi des connexions client et backend ; il faut mesurer ses descripteurs et sa mémoire séparément de ceux de Node. La configuration réellement active et les limites noyau ne sont pas connues par ce seul audit.

**Déjà présent.** Nginx décharge des assets et TLS dans le modèle ; présence avec grâce, groupes Socket.IO ciblés, invalidations de notifications et rate limiting HTTP réduisent certains coûts.

**Preuves :** [index.js](../server/src/index.js), construction `io`, `roomPresence`, middleware `rateLimit`, `server.listen` ; [RoomPage.jsx](../client/src/pages/RoomPage.jsx), effet Socket.IO ; [useConversationInbox.js](../client/src/components/social/useConversationInbox.js), `useConversationInbox` ; [ktga.service](../deploy/debian/ktga.service), `LimitNOFILE` ; [nginx-common.conf](../deploy/debian/nginx-common.conf), upstream ; [nginx-https.conf](../deploy/debian/nginx-https.conf), routes et délais proxy.

### 3.2 Attribution des salons et charge des moteurs

**Constat de code.** `ownership()` choisit le worker avec le moins de salons, parmi 1 à 4 enfants locaux. Il ne pondère ni le nombre de joueurs ni le type de jeu et ne rééquilibre pas activement. Chaque enfant exécute tous ses moteurs sur sa boucle JS. Le gateway conserve un miroir complet des états validés.

**Risque.** Beaucoup de salons légers peuvent être mieux supportés qu'un petit nombre de salons coûteux avec spectateurs ; le simple comptage ne prévient pas un worker chaud. Le coût de la fonction poker de prévisualisation reste même dans la projection gateway. La perte d'un enfant touche tous ses salons ; leur reprise concentre de l'IPC et des copies au même moment.

**Mesuré.** Les essais historiques désignent surtout le gateway. Ils ne justifient pas de multiplier immédiatement les workers ou de porter les moteurs dans un autre langage.

**Déjà présent.** Propriétaire unique, FIFO par salon, arrêt de l'ancien enfant avant reprise, checkpoints, contexte de comptes restreint et configuration transmise par révision.

**Preuves :** [game-workers.js](../server/src/services/game-workers.js), `ownership`, `run`, `execute` ; [game-gateway.js](../server/src/services/game-gateway.js), `context` ; [index.js](../server/src/index.js), `serializeRoom` et `pokerHandPreview` ; [game-room-kernel.js](../server/src/services/game-room-kernel.js), `register`, `prepareTransition`.

### 3.3 CPU principal, boucles et tâches synchrones

**Constat de code.** Les accès `DatabaseSync`, la comparaison JSON des collections, les projections de vues, le traitement final des effets de succès/XP/règlement et diverses tâches périodiques restent dans le principal. Plusieurs recherches utilisent `db.users.find(...)` ou des parcours de salons : leur coût dépend aussi du nombre total de comptes persistés, pas seulement des connexions présentes.

Le matchmaking mérite une mesure distincte : `matchQueue()` essaie des ancres et `queueGroupFor()` filtre et trie les candidats pour chacune. Dans un cas défavorable sans groupe compatible, plusieurs tris de la même file peuvent être répétés ; la croissance peut être superlinéaire. C'est une analyse de l'algorithme, pas une mesure de sa part CPU dans les rapports. `status()` peut aussi calculer un groupe disponible lors d'une lecture du statut de file.

**Risque.** Un commit, un fsync lent, un parcours global ou un cycle de sérialisation retarde HTTP, timers et sockets simultanément. Une baisse du délai P95 de boucle sans gain de débit net ne suffit pas à démontrer une marge de capacité.

**Déjà présent.** Historique/statistiques déportés en lecture ; bcrypt dans un pool ; mode comptes optionnel ; caches de configuration ; index des salons et sélections de persistance ; garde de 30 itérations dans la progression des bots d'un tour ; logs de jeu limités à 80 entrées.

**Preuves :** [db.js](../server/src/db.js), `persistDatabase`, `snapshotCollections` ; [index.js](../server/src/index.js), `serializeRoom`, `finishRoomIfNeeded`, intervalles et `collectServerHealthSample` ; [ranked.js](../server/src/services/ranked.js), `matchQueue`, `queueGroupFor` ; [ranked-runtime.js](../server/src/services/ranked-runtime.js), `status`, `match`, `tick` ; [room-runtime.js](../server/src/services/room-runtime.js), `runBotTurns` ; [engine-context.js](../server/src/games/engine-context.js), `appendLog`.

### 3.4 Mémoire et copies des états

**Constat de code.** Le principal garde les comptes et salons hydratés, plus des snapshots JSON de comparaison, les index, sessions invitées, présence et files. Chaque worker garde les états de ses salons et, pendant une transition, un brouillon cloné ainsi que le contexte. L'IPC sérialise encore les données ; la diffusion crée des vues privées et des buffers réseau.

**Risque.** Les coûts s'additionnent ; le passage en processus ne retire pas la mémoire des salons du gateway. Le RSS comprend les heaps, les caches SQL et les allocations natives ; additionner des heaps JS seulement sous-estime le budget. Une phase de reprise ou de GC peut amplifier les pics. Aucune estimation fiable en Go ne peut être déduite sans tailles d'états et profils de heap représentatifs.

**Déjà présent.** Archives historiques/transactions différées plutôt qu'historique entier chargé ; caches de télémétrie et reçus bornés ; contextes ciblés ; suppression des salons ; fenêtres de logs limitées. Ces bornes n'impliquent pas une taille maximale uniforme de tous les états ni de toutes les Maps de présence/permissions.

**Preuves :** [db.js](../server/src/db.js), `loadDatabase`, `snapshotCollections` ; [game-room-kernel.js](../server/src/services/game-room-kernel.js), `prepareTransition`, `commit` ; [duration-telemetry.js](../server/src/services/duration-telemetry.js), anneau de 256 échantillons ; [archives.js](../server/src/storage/archives.js), `Archive` ; [index.js](../server/src/index.js), Maps et `emitRoomUpdate`.

### 3.5 IPC et planification des échéances

**Constat de code.** Une commande modifiant l'état implique en régime courant `prepare` et `commit`, donc deux échanges aller-retour IPC, auxquels s'ajoutent éventuellement `register` et `configure`. Un tick sans mutation implique `prepare` puis `abort`. Le résultat préparé renvoie un état complet avec effets ; le commit transporte aussi les champs métier validés. Les contextes et brouillons sont clonés.

`kernel.due()` parcourt les salons du worker toutes les secondes. Poker, Bataille et ranked actifs peuvent générer des vérifications régulières, même si le tick ne modifie rien. Le gateway déduplique les ticks en cours et le pool n'en planifie pas un nouveau lorsqu'une commande est déjà admise pour ce salon.

La file globale jeux est bornée à 512, chaque salon à 8, et le transport possède 256 places d'attente et 16 requêtes en vol. Son délai 10 s commence dès la mise en file. Le code de `dispatch()` vérifie l'erreur du callback `child.send()` mais n'utilise pas sa valeur de retour pour réguler les octets en attente. Le compteur de messages ne borne donc pas le volume mémoire du canal. La documentation Node précise qu'un retour `false` peut signaler une accumulation excessive ; ce signal est un levier possible de régulation. [Référence Node, contrat de child_process.send](https://nodejs.org/api/child_process.html#subprocesssendmessage-sendhandle-options-callback).

**Risque.** De nombreux salons temporisés peuvent consommer du CPU gateway et de l'IPC sans action humaine. Des gros états ralentissent davantage qu'un même nombre de petits messages. Une expiration arrête tout l'enfant, provoquant une reprise groupée. Augmenter arbitrairement les files risque surtout d'allonger les délais et la mémoire.

**Déjà présent.** Déduplication des ticks, absence de publication/commit pour certains ticks inchangés, contexte restreint, caches de configuration et quotas d'admission. La métrique `wait` du transport existe ; elle ne mesure pas toute la FIFO en amont du salon.

**Preuves :** [game-ipc-transport.js](../server/src/services/game-ipc-transport.js), `request`, `dispatch`, `stop` ; [game-workers.js](../server/src/services/game-workers.js), `run`, `execute`, gestion de `due` ; [game-gateway.js](../server/src/services/game-gateway.js), `onDue`, `execute` ; [game-room-kernel.js](../server/src/services/game-room-kernel.js), `due`, `prepareTransition` ; [game-worker-process.js](../server/src/services/game-worker-process.js), intervalles.

### 3.6 Fréquence et volume des diffusions

**Constat de code.** Les états de table sont des snapshots complets filtrés par destinataire. `emitRoomUpdate()` parcourt les sockets présents et `serializeRoom()` reconstruit les champs privés ; la réponse HTTP de l'action contient également une vue. Il n'y a pas de delta de table ou de coalescence par version/client lent dans ce chemin. La liste du lobby dispose en revanche d'un regroupement 250 ms et de patches pour les clients compatibles.

Le trafic de fond est significatif avant toute action : les notifications sont vérifiées toutes les 10 s lorsque la page est visible, le compteur de conversations toutes les 60 s avec des rafraîchissements événementiels, et d'autres polls dépendent de la vue, du compte ou du consentement. À titre de **calcul de scénario**, si 20 000 comptes inscrits ont une page visible et exécutent tous le poll de notifications, celui-ci représente à lui seul environ **2 000 requêtes/s** ; ce n'est ni un trafic observé ni un coût CPU mesuré. Le poll conversations ajoute environ 333 requêtes/s sous la même hypothèse de cadence continue. Les rafraîchissements au focus et sur événements peuvent augmenter le total.

**Risque.** Le coût augmente avec sockets, spectateurs, taille des états et fréquence de transitions. Une table très regardée peut coûter plus cher que de nombreux petits salons. Les paquets d'un client lent peuvent accumuler du retard ; augmenter la compression peut aussi déplacer la charge vers le CPU. Aucun gain chiffré n'est garanti sans mesure de taille et de compression effectivement active.

**Déjà présent.** Cache de présentations partagé pendant une émission, séparation lobby/table/conversation, liste de lobby sans état privé, patches de lobby et comparaisons JSON client évitant certains rerenders.

**Preuves :** [index.js](../server/src/index.js), `emitRoomUpdate`, `serializeRoom`, `sanitizeLobbyRoom` ; [lobby-broadcast.js](../server/src/services/lobby-broadcast.js), `flush`, `schedule` ; [RoomPage.jsx](../client/src/pages/RoomPage.jsx), `commitRoom` et réponse d'action ; [App.jsx](../client/src/App.jsx), effet de notifications à 10 000 ms ; [useConversationInbox.js](../client/src/components/social/useConversationInbox.js), intervalle à 60 000 ms, `scheduleRefresh` et handlers d'invalidation.

### 3.7 SQLite, concurrence et durabilité

**Constat de code.** La base principale utilise WAL et un écrivain métier coordonné dans le principal. Les lecteurs délégués utilisent des connexions en lecture seule. Une écriture met à jour l'état en mémoire et persiste les différences avec `BEGIN IMMEDIATE` et `DatabaseSync`, sur la boucle du principal. Un `busy_timeout` de 5 s peut donc faire attendre cet appel de façon synchrone en cas de contention ; cela n'est pas un délai de requête asynchrone isolé.

WAL facilite le chevauchement lecture/écriture, mais conserve un seul écrivain à un instant donné et suppose des accès locaux compatibles à son index partagé. Il ne transforme pas SQLite en base multi-écrivains intermachines. Les checkpoints et lecteurs longs peuvent également influencer le WAL. [Référence SQLite WAL](https://sqlite.org/wal.html).

**Risque.** Latence fsync, checkpoints, croissance du ledger et écritures de services annexes peuvent retarder la boucle. Ouvrir un deuxième gateway écrivain sur le même fichier n'est pas une extension sûre : chaque instance garderait son propre `cachedDb`, ses snapshots et ses révisions, sans invalidation distribuée. Des transactions SQL sérialisées ne garantissent pas la fraîcheur de ces objets applicatifs.

Le cache local de révisions d'entités est borné à 8 192 entrées ; lorsque ce seuil est atteint, son epoch change. Cela invalide des gardes en cours et peut produire des conflits supplémentaires sur une forte diversité d'entités. Ce mécanisme borne la mémoire ; sa fréquence à grande échelle reste à mesurer.

**Déjà présent.** Persistance ciblée des salons/comptes, `settings:false`, index et requêtes d'archives, normalisation de progression, contraintes d'unicité, révision des lectures et rollback rechargeant un état validé. Conserver la durabilité financière est prioritaire : changer `FULL` en `NORMAL` ne doit pas servir de correction non évaluée de la saturation.

**Preuves :** [db.js](../server/src/db.js), pragmas, `readDb`, `persistDatabase`, `restoreCommittedState`, `entityRevisions` ; [sqlite-settings.js](../server/src/storage/sqlite-settings.js), `sqliteSettings` ; [reading-tasks.js](../server/src/services/reading-tasks.js), `createReadingTasks` ; [normalized.js](../server/src/storage/normalized.js), tables et contraintes ; [selected-rows.js](../server/src/storage/selected-rows.js), sélection indexée ; [game-gateway.js](../server/src/services/game-gateway.js), portée et garde de `commit`.

### 3.8 Saturation, événements manqués et reprise

**Constat de code.** La saturation des queues produit des refus explicites. Une panne de worker peut être reprise depuis checkpoint. Le navigateur se réabonne et reçoit l'état courant, mais les événements n'ont pas ici d'outbox durable ni de mécanisme applicatif de relecture exhaustive. Les logs de requêtes ont séparément une file de 1 000 entrées et un compteur `dropped` ; leur perte volontaire n'est pas une perte prouvée d'action de jeu.

**Risque de publication.** Une interruption après COMMIT et avant émission peut faire manquer un événement ; le snapshot restaure l'état, pas nécessairement l'événement. Les garanties standard de Socket.IO ne suffisent pas à rendre la diffusion durable. [Référence Socket.IO](https://socket.io/docs/v4/delivery-guarantees/).

**Risque de vue ancienne.** `commitRoom()` déduplique par JSON mais n'applique pas de numéro de version public. HTTP et WebSocket peuvent apporter deux snapshots d'âges différents. Ce risque ne démontre pas une corruption du serveur et n'est pas un défaut d'ordre interne de Socket.IO.

**Risque de retry.** `commandId` est généré pour l'exécution serveur, sans identifiant durable fourni/rejoué systématiquement par le client HTTP. Après une réponse perdue, une nouvelle requête peut être une nouvelle action ; les moteurs et contraintes métiers empêchent certains doublons, pas nécessairement tout effet possible. Le protocole protège expressément le cas COMMIT réussi / accusé IPC perdu, ce qui est une garantie plus précise et limitée.

**Cas particulier de fermeture.** La suppression du salon retire aussi son checkpoint. Si son accusé IPC est perdu après COMMIT, `run()` ne retrouve pas `snapshot(roomId)?.gameWorker` et ne peut pas confirmer la réussite par cette branche de reprise. Une erreur et une publication manquée restent possibles malgré les effets SQL déjà validés. Prévoir un reçu durable de commande/fermeture ou une autre preuve de suppression, et tester cette fenêtre ; aucune double dépense n'est établie par cette lecture.

**Risque de redémarrage.** `recover()` examine les salons persistés séquentiellement avant l'écoute réseau. La file ranked, les propositions, les invités et certaines permissions temporaires sont volatils. Un arrêt du principal peut déclencher des reconnexions et une charge de récupération simultanées. Les durées RTO/RPO réelles et le drainage de la fenêtre d'arrêt de 10 s n'ont pas été mesurés ici.

**Preuves :** [game-workers.js](../server/src/services/game-workers.js), `run`, `execute`, `ownership` ; [game-gateway.js](../server/src/services/game-gateway.js), `recover`, `execute` ; [index.js](../server/src/index.js), `serializeRoom`, `watch-room`, `shutdown`, `sessions` et `spectatorAccess` ; [ranked-runtime.js](../server/src/services/ranked-runtime.js), Maps ; [RoomPage.jsx](../client/src/pages/RoomPage.jsx), `commitRoom` ; [request-logs.js](../server/src/services/request-logs.js), `append`, `flush`.

## 4. Modèle de dimensionnement : hypothèses, pas résultats

Compter des « joueurs simultanés » exige de définir la charge : connecté au lobby, assis sans agir, partie active, bots, spectateurs, onglets, et fréquence des actions. La quantité de comptes enregistrés intervient aussi dans la mémoire et certaines recherches. Les profils suivants ne sont **pas** des prédictions de capacité.

Pour illustrer les ordres de grandeur, supposons **2 sockets par joueur**, **4 humains par salon**, **aucun spectateur**, et **une transition humaine toutes les 4 secondes par salon** :

| Joueurs | Sockets illustratifs | Salons illustratifs | Actions humaines/s illustratives | Destinations de snapshots/s, 4 par transition |
| --- | ---: | ---: | ---: | ---: |
| 1 000 | 2 000 | 250 | 62,5 | 250 |
| 5 000 | 10 000 | 1 250 | 312,5 | 1 250 |
| 10 000 | 20 000 | 2 500 | 625 | 2 500 |
| 20 000 | 40 000 | 5 000 | 1 250 | 5 000 |

Ce modèle est volontairement différent d'un test qui tente des actions toutes les secondes. Il exclut HTTP de fond, bots, ticks, chat, doublons d'onglets, résultats, départs, spectateurs et la réponse HTTP de l'action. À mêmes joueurs, davantage de parties solo produit plus de salons et de scans ; davantage de spectateurs augmente le fan-out sans modifier la colonne joueurs assis.

Formules utiles pour une campagne :

- `sockets = joueurs × sockets_moyens + sockets_spectateurs/onglets_supplémentaires`.
- `débit_sortant_snapshots ≈ Σ(transitions_par_salon × destinataires × octets_vue_privée)` ; ajouter HTTP, lobby, chat et overhead réseau. Une mesure d'octets encodés est nécessaire.
- `charge_IPC ≈ transitions + ticks + tâches_de_reprise`, chacune multipliée par ses échanges et tailles réelles ; le nombre d'actions HTTP seul sous-estime les messages.
- `mémoire = modèle_principal + snapshots/index + sockets/buffers + états/brouillons_workers + copies_IPC + caches/connexions_SQL + services_annexes`.

**Fondement du modèle :** fan-out de `emitRoomUpdate` dans [index.js](../server/src/index.js), snapshots et clones de [game-room-kernel.js](../server/src/services/game-room-kernel.js), deux connexions possibles dans `RoomPage` et `useConversationInbox`, scan `due()` et protocole `run()` dans [game-workers.js](../server/src/services/game-workers.js). Les paramètres numériques du tableau sont des hypothèses explicites, pas des valeurs extraites de production.

## 5. Évaluation par palier

| Palier | Évaluation à partir des preuves | Limiteurs à examiner en priorité | Confirmation nécessaire |
| --- | --- | --- | --- |
| **1 000 joueurs actifs** | Non validé. Échec historique avec 1 worker et principal proche d'un cœur. L'objectif reste à démontrer sur la révision actuelle et une charge définie. | CPU principal, projections/JSON, writes SQLite, polls, FIFO et attente IPC ; régime de bots/ticks. | Rejouer d'abord 500 puis 1 000, générateur séparé, profilage CPU et transactions ; 1 h stable puis endurance plus longue ; pertes réseau et mort d'un worker ; intégrité financière avant/après. |
| **5 000** | Aucune mesure versionnée examinée ne le valide. Plus de CPU et des workers supplémentaires sont une piste, sans gain linéaire garanti. | Même principal écrivain/projecteur, nombre de salons scannés, mémoire miroir et snapshots, coût de matchmaking, connexions et trafic de fond. | Montée progressive 1k→2k→5k après corrections mesurées ; tests connexion seule vs activité ; comparaison 1/2/4 workers sur hôte adapté ; tailles états, GC, temps fsync et coût par service. |
| **10 000** | Non démontré ; point de décision sur la capacité du coordinateur et la nécessité de séparer des services ou plusieurs gateways. | Admission réseau, fan-out, client lent, stockage transactionnel, concurrence des comptes intersalons, temps de reprise de milliers de checkpoints. | TLS/proxy réel, polling et WebSocket, spectateurs concentrés, gros historique/comptes, redémarrage principal, partition transport de test et rafale de reconnexions ; vérification de toute nouvelle autorité distribuée. |
| **20 000** | Objectif d'évolution, pas une capacité actuelle annoncée. Une cible sur plusieurs machines est raisonnable à étudier ; aucune nécessité de réécrire Node ou les moteurs n'est démontrée. | Autorité centrale unique, cohérence des comptes, publication privée, sockets, disque et disponibilité du coordinateur ; coordination d'ownership si distribution. | Charge mixte et endurance prolongée, générateurs distribués, panne d'hôte et de stockage, récupération et drainage, audit de doubles règlements, absence de fuite de mains, validation SLO/RTO/RPO. |

La colonne des limiteurs est une **hypothèse de travail**, appuyée par les fonctions analysées en section 3 ; elle n'affirme pas qu'un composant saturera exactement à ce nombre. Un objectif « 20 000 connexions au lobby » et « 20 000 joueurs actifs avec chat, ranked et spectateurs » demande deux campagnes différentes.

## 6. Extension horizontale : ce qui est prêt et ce qui manque

### 6.1 Extension possible aujourd'hui

Les calculs de jeu sont déjà isolables dans plusieurs enfants **sur une machine**, avec contrat `configure/register/prepare/commit/abort`, propriété de salon, garde de version et reprise. On peut mesurer l'effet de 1 à 4 workers et de davantage de CPU sans changer les règles. Le processus comptes et les lectures déportées sont également des options existantes.

Cela constitue du parallélisme de calcul local. `fork` n'est pas un transport intermachines, le propriétaire est une Map locale et les écritures restent centrales. La limite de 4 workers est un garde logiciel actuel, pas une limite intrinsèque de Node ; la lever sans vérifier le coordinateur, la mémoire et les files n'apporte aucune garantie.

**Preuves :** [game-ipc-transport.js](../server/src/services/game-ipc-transport.js), constructeur ; [game-workers.js](../server/src/services/game-workers.js), validation `size`, Maps et `ownership` ; [game-gateway.js](../server/src/services/game-gateway.js), `context`, `commit` ; [accounts-work.js](../server/src/services/accounts-work.js), `createAccountsWork`.

### 6.2 Pourquoi plusieurs gateways identiques ne suffisent pas

Placer deux `index.js` derrière un round-robin créerait deux copies de `cachedDb`, deux registres de propriétaires, deux présences et deux matchmakers. Un adapter Socket.IO répartirait certains événements mais ne corrigerait pas ces divergences ni l'autorité des écritures. La persistance sur un fichier SQLite commun ne met pas automatiquement à jour les modèles mémoire de l'autre instance.

Avec plusieurs serveurs Socket.IO, la distribution des messages et l'affinité des requêtes Engine.IO sont deux sujets distincts. Si le long-polling est conservé, il faut une affinité adaptée ; imposer WebSocket seul est une autre option, avec un compromis de compatibilité à tester. L'affinité d'une session réseau ne résout pas, à elle seule, le routage de tous les participants d'un salon vers son propriétaire. [Référence officielle Socket.IO multi-nœuds](https://socket.io/docs/v4/using-multiple-nodes/).

**Preuves applicatives :** [db.js](../server/src/db.js), `cachedDb`, `readDb`, révisions ; [game-workers.js](../server/src/services/game-workers.js), `owners` ; [index.js](../server/src/index.js), `roomPresence`, `sessions`, `spectatorAccess` et configuration Socket.IO ; [ranked-runtime.js](../server/src/services/ranked-runtime.js), `queue`/`offers` ; [nginx-common.conf](../deploy/debian/nginx-common.conf), upstream unique.

### 6.3 Chemin d'évolution proposé

Les étapes suivantes sont **absentes de la topologie actuelle** et ne figurent donc pas comme services existants dans le diagramme principal.

1. **Mesurer et alléger le coordinateur unique.** Réduire les polls inutiles, la sérialisation répétée, les scans et les writes non ciblés ; confirmer le budget du gateway. Garder les mêmes moteurs.
2. **Si les writes synchrones dominent, isoler un service de persistance transactionnelle.** Garder initialement SQLite et un seul écrivain est envisageable, à condition de déplacer l'autorité de comptes et les commits vers ce service, avec commandes validées, reçus durables et réponses de version. Simplement envoyer `writeDb()` dans un thread tout en conservant plusieurs modèles mutables serait insuffisant. L'atomicité comptes/salon/résultats doit être conservée.
3. **Distribuer les projections et connexions si elles dominent.** Plusieurs gateways pourraient servir des vues issues d'une autorité de salons clairement définie, avec adapter compatible, invalidations/reprises et gardes sur les vues privées. Externaliser ou partitionner présence, files ranked, accès temporaires et limites d'admission, sans dédoubler les décisions métier.
4. **Distribuer le calcul de salons si nécessaire.** Remplacer le transport `fork` par un transport intermachines borné, ajouter un registre de routage, des leases avec fencing durable et du drainage. Les commits doivent rejeter un ancien propriétaire même après partition réseau. Le protocole et les moteurs existants offrent une base ; le contrôle local `epoch` ne suffit pas tel quel.
5. **Faire évoluer le stockage seulement lorsque ses besoins l'imposent.** Si l'écrivain local, la disponibilité ou l'accès intermachines deviennent incompatibles avec les SLO mesurés, une base transactionnelle serveur, par exemple PostgreSQL, est une option. Préserver contraintes d'unicité, ledger et checkpoint/outbox atomiques ; éviter le double write sans protocole de migration. Redis peut servir au routage ou à la présence, pas remplacer implicitement l'autorité des soldes.

La nécessité et l'ordre des étapes 2–5 dépendent des profils de charge. Ce document ne propose ni microservice par jeu ni refonte du moteur avant preuve d'un coût problématique des règles.

## 7. Recommandations classées

**P0** : prérequis pour annoncer une capacité fiable et protéger la cohérence. **P1** : optimisations incrémentales à mesurer. **P2** : séparation/distribution conditionnée aux résultats. Les gains sont qualitatifs faute de campagne comparative actuelle.

| Priorité / recommandation | Problème et preuve | Solution proposée | Gain attendu, sans garantie chiffrée | Difficulté et risques |
| --- | --- | --- | --- | --- |
| **P0 — Profiler les phases réelles** | Principal historiquement saturé ; métriques de fenêtres différentes. `collectServerHealthSample`, `DurationTelemetry`, `createServiceExecution`. | Mesurer attente FIFO, préparation contexte, IPC, moteur, revalidation, SQL, projection et octets par vue ; profils CPU/heap, GC, disque et clients lents. Générateur séparé. | Identifier le coût dominant et éviter des optimisations sans effet. | Faible à moyenne ; surcoût de métriques et collecte de données privées à éviter. Échantillonner les tailles, pas les mains ni jetons. |
| **P0 — Campagnes et SLO définis** | Rapport 1 000 échoué ; ancien 500 sans marge prouvée. | Définir population active, cadence, mix et budgets ; rejouer 500/1 000 puis paliers, endurance et pannes ; audit financier systématique. | Capacité annoncée reproductible et régression détectable. | Moyenne ; charge uniquement sur environnement isolé ou test explicitement organisé. |
| **P0 — Révision publique de salon** | `serializeRoom` retire la version interne ; `commitRoom` compare les JSON. | Ajouter une révision monotone publique commune HTTP/WS et ignorer les vues plus anciennes ; snapshot de resynchronisation si trou détecté. | Évite les régressions visuelles intercanaux et prépare coalescence/deltas. | Moyenne ; gérer suppression, replay, mode historique et reconnexion. Une version ne garantit pas la livraison. |
| **P0 — Idempotence des commandes sensibles** | `execute` crée le `commandId` côté serveur ; reçu kernel borné ; checkpoint retiré lors de la fermeture. | Identifiant de requête fourni par le client, liaison acteur/salon/action, reçu durable et réponse rejouable dans la transaction, y compris reçu de fermeture. | Retry sûr après timeout sans doubler les effets financiers et confirmation après suppression. | Moyenne à forte ; durée de rétention, collisions, abus et migration. Ne pas réessayer tous les POST avant cette protection. |
| **P1 — Réduire le trafic HTTP de fond** | Poll notifications 10 s et conversations 60 s malgré invalidations. `App`, `useConversationInbox`. | Coalescer les invalidations, cache/version/ETag, espacement et jitter, page visible, fallback borné de resynchronisation ; examiner partage de connexion. | Réduit le RPS gateway et les pointes synchronisées. | Moyenne ; notifications manquées si le push devient seul mécanisme ; ne pas confondre compte et onglet. |
| **P1 — Projections privées et diffusion** | Snapshot complet par socket et réponse HTTP ; `emitRoomUpdate`, `serializeRoom`. | Cache par révision et droit de vue, données publiques partagées ; coalescence des snapshots remplaçables, puis deltas versionnés si utiles ; récupération complète conservée. | Moins de JSON, CPU et bande passante ; meilleure gestion des clients lents. | Moyenne à forte ; risque de fuite de mains ou de perdre un événement non remplaçable. Séparer snapshots et effets critiques. |
| **P1 — Échéances ciblées** | `due()` parcourt les salons et certains types tickent chaque seconde. | Indexer les prochaines échéances, éviter `prepare` quand aucune échéance n'est due, étaler les vérifications et conserver les gardes de présence. | Moins d'IPC et de CPU à grand nombre de salons. | Moyenne ; erreurs de forfait/pacing si un changement d'état n'actualise pas l'échéance. Tests d'horloge déterministes. |
| **P1 — Persistance ciblée et index mémoire** | `snapshotCollections` et certaines recherches globales restent coûteux. | Mesurer puis restreindre toutes les collections réellement touchées ; index comptes avec invalidation correcte ; limiter recalculs de succès et présentations. | Réduit travail par action et dépendance au volume total de comptes. | Moyenne ; mutations oubliées ou index obsolète. Contrôles d'intégrité et tests rollback. |
| **P1 — Admission et budgets de buffers** | Files bornées en messages ; `child.send` sans exploitation du retour ; absence de budget client lent explicite. | Quotas par compte/salon et octets, suivi du backlog, pause/régulation IPC, refus précoces et coalescence sûre des vues ; politique client lent et reconnexion avec jitter. | Latence et mémoire mieux bornées sous surcharge. | Moyenne ; starvation, faux rejets sous NAT, délais financiers. Ne pas jeter une commande déjà validée. |
| **P1 — Reprise et drainage éprouvés** | `recover` séquentiel avant écoute, délai forcé d'arrêt 10 s. | Mesurer restauration de milliers de salons, borne de parallélisme intersalons, mode indisponible explicite, drainage d'admission et tests crash avant/après COMMIT. | RTO plus prévisible et redémarrages moins perturbants. | Moyenne ; surcharge au démarrage, horloges ranked et double publication à vérifier. |
| **P1 — Matchmaking sous grande file** | `matchQueue` / `queueGroupFor` répètent des filtrages et tris. | Mesurer puis indexer par jeu/fenêtre/rang, mémoriser les calculs d'un cycle, éviter un recalcul complet à chaque statut. | Réduit le coût lorsque la file de recherche grandit. | Moyenne ; équité, remplissage et élargissement des fenêtres à préserver. |
| **P2 — Écrivain transactionnel séparé** | `DatabaseSync` et finalisation restent sur la boucle HTTP. | Si le profil le justifie, service/worker propriétaire du ledger, des versions et du COMMIT, API de commandes et outbox atomique. | Décharge la boucle HTTP et clarifie l'autorité durable. | Forte ; aucun gain assuré si le disque ou le débit logique du writer reste dominant. Risque majeur d'atomicité si modèles dupliqués. |
| **P2 — Gateways et calcul distribués** | Toutes les Maps et gardes sont locales ; transport `fork`. | Routage et adapter, présence cohérente, file ranked coordonnée, leases/fencing durables, transport avec délais/budgets ; stockage serveur si justifié. | Répartition des connexions et calculs entre hôtes, maintenance et disponibilité améliorables. | Forte ; partitions réseau, anciens propriétaires, cohérence de comptes intersalons et migrations. Déployer par étapes avec retour arrière. |

**Sources des recommandations :** chaque ligne renvoie aux fonctions explicitées en sections 3 et 6 ; [service-execution.js](../server/src/services/service-execution.js), [duration-telemetry.js](../server/src/services/duration-telemetry.js), [index.js](../server/src/index.js), [game-gateway.js](../server/src/services/game-gateway.js), [game-workers.js](../server/src/services/game-workers.js), [game-ipc-transport.js](../server/src/services/game-ipc-transport.js), [db.js](../server/src/db.js), [ranked.js](../server/src/services/ranked.js), [RoomPage.jsx](../client/src/pages/RoomPage.jsx), [App.jsx](../client/src/App.jsx) et [useConversationInbox.js](../client/src/components/social/useConversationInbox.js).

## 8. Plan d'essais pour décider des évolutions

### 8.1 Conditions et mesures

Utiliser l'outillage isolé de [CAPACITY-TESTING.md](CAPACITY-TESTING.md) et [server/scripts/capacity/](../server/scripts/capacity), puis compléter les scénarios manquants. `serve.mjs` prépare l'environnement de test ; `run.mjs` génère les clients ; `inspect.mjs` examine les invariants ; `compare.mjs` organise les comparaisons. Les gardes automatiques existantes ne sont pas une preuve que le scénario représente tous les usages. Aucun de ces tests n'a été lancé pour cet audit.

Pour chaque exécution, enregistrer commit exact, drapeaux, versions Node/Socket.IO/SQLite, CPU/RAM/disque, proxy/TLS, limites de fichiers et noyau, taille et ancienneté des données fictives, mix des jeux, bots, spectateurs, onglets, sockets et cadence. Séparer générateurs et serveurs pour ne pas attribuer au backend la saturation du générateur.

Consigner aussi les limites HTTP, l'IP effectivement vue par Express et la distribution des IP clientes : de nombreux clients issus d'une seule adresse peuvent tester le rate limiter plutôt que le moteur. Tester distinctement la capacité sans ce biais et l'efficacité des protections avec leur configuration cible ; ne pas extrapoler une campagne qui désactive les limites à la production protégée.

Mesurer au minimum :

- Connexions demandées/établies, échecs de handshake, latence et nombre de reconnexions, part WebSocket/polling.
- RPS et P50/P95/P99 **par route et type d'action**, taux de refus métier attendu, 429, 409, 503, timeouts et annulations séparés.
- Délai d'une commande acceptée jusqu'à la réception de la nouvelle révision chez les autres participants, staleness et révisions manquées.
- CPU par PID, RSS/heap/GC, délai/utilisation de boucle, mémoire des buffers et descripteurs par processus.
- Profondeur et octets de queues, attente FIFO et IPC, temps moteur, sérialisation/projection et volume des paquets privés.
- Temps des transactions, fsync/checkpoints, taille du WAL, lecteurs longs, `SQLITE_BUSY`, temps des stores annexes et logs abandonnés.
- Invariants avant/après : soldes/transactions, mises et cash-outs, XP, unicité règlements/historiques/récompenses, absence de carte privée chez un autre joueur ou un spectateur.

Les objectifs chiffrés de délai, taux d'erreur, marge CPU/mémoire, RTO et RPO doivent être **choisis par l'équipe**, puis publiés avec le rapport. Une erreur métier attendue n'est pas une erreur serveur ; un scénario qui s'arrête avant la durée prévue ne peut pas être déclaré réussi sur la seule moyenne de latence.

### 8.2 Matrice minimale

| Scénario | Ce qu'il isole | Paliers et contrôles |
| --- | --- | --- |
| Connexions inactives | Coût sockets/TLS/polling et descripteurs | Rampes 1k/5k/10k/20k connexions selon capacité de l'environnement ; aucune assimilation à des joueurs actifs. |
| Mix des quinze jeux | Charge normale de commandes, bots et états privés | 500 puis 1k, durée stable proposée ≥1 h ; montée graduelle ensuite, endurance proposée 6–24 h. Durées proposées, pas essais réalisés. |
| Salons solo et tables pleines | Coût par salon vs par joueur | Même nombre de clients, nombre de salons différent ; observer `due`, IPC et commits. |
| Poker / Bataille / ranked | Ticks, horloges, présence et règlements | Silences, échéances simultanées, forfaits, cash-outs, bot pacing et reconnexions. |
| Spectateurs concentrés | Fan-out et risque de fuite | Un salon fortement regardé et beaucoup de petits salons ; tailles privées/publics et CPU projection. |
| Données anciennes volumineuses | Coût lié aux comptes/historiques enregistrés | Même nombre de joueurs, variations du nombre de comptes et taille d'archives ; index, mémoire et startup. |
| Réseau perturbé et clients lents | Staleness, buffers et retries | Latence/jitter/pertes contrôlés ; vérifier convergence par snapshot, sélection d'une action après timeout, aucune double écriture. |
| Crash worker avant/après COMMIT | Garantie du protocole local | Interrompre séparément prepare, SQL, accusé commit ; perte de réponse et replay de commande ; invariants et nombre de publications. |
| Redémarrage gateway et reprise | RTO, Maps volatiles et pointe de charge | Milliers de salons, invités, queues ranked, accès privés ; arrêt chargé et reconnexions étalées puis groupées. |
| Arrêt/partition d'un hôte futur | Fencing et disponibilité distribuée | Seulement après implémentation multi-hôte ; ancien propriétaire ne peut plus committer, unicité des résultats et ledger. |

À chaque palier, garder les **mêmes cadences** pour comparer le nombre de clients, puis varier un seul facteur pour expliquer une limite. Les comparatifs 1/2/4 workers doivent garder ressources et mélange comparables ; les CPU du générateur, du proxy et du stockage doivent être identifiés séparément.

### 8.3 Critères de décision

- Si le CPU de projection domine, commencer par vues/caches/flux et éventuellement plusieurs gateways ; ajouter des moteurs n'attaque pas ce coût.
- Si les commits synchrones dominent, étudier l'autorité de persistance séparée et le disque ; changer uniquement la bibliothèque HTTP ne résout pas ce point.
- Si les moteurs dominent après ces optimisations, répartir les salons et ajuster leur attribution ; leur interface actuelle permet de conserver les règles.
- Si la reprise, l'admission ou les clients lents échouent malgré un bon débit moyen, le palier n'est pas validé pour un service durable.
- Si la disponibilité ou la coordination intermachines l'impose, introduire le stockage/routage distribué progressivement et tester le fencing, plutôt que répliquer sans contrôle les Maps et le fichier SQLite.

Ces décisions exigent de nouvelles mesures. L'existant fournit déjà un socle réutilisable de moteurs, propriété de salon, validation, persistance atomique et récupération ; le travail pour 20 000 joueurs porte principalement sur le coordinateur, les flux, la persistance et la coordination à démontrer.
