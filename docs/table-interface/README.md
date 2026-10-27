# Interfaces des tables

Première étape : Farkle, Yahtzee, Cul de Chouette et Texas Hold’em. Les onze autres jeux et la salle d’attente conservent leur interface. Aucun moteur serveur, événement Socket.IO ou protocole d’action n’est modifié.

## Composants communs

`client/src/components/room/TableInterface.jsx` fournit le HUD, les joueurs et leurs scores, le titre du plateau, les informations de manche, l’indication du tour, les statistiques, la zone de commandes et les panneaux repliables. Sa feuille CSS est limitée aux tables qui possèdent la classe `table-interface`. Les couleurs de surface suivent les variables du thème existant ; les apparences des pièces gardent leurs propres styles.

`client/src/features/games/table-interface.js` contient la liste des jeux intégrés et les fonctions de présentation des manches et des sièges. Pour intégrer un autre jeu, réutiliser les composants communs, adapter les informations à son état réel, puis l’ajouter à cette liste après vérification de ses commandes et de son rendu. Il ne faut pas activer les quinze jeux en bloc sans cette adaptation.

`RoomPage.jsx` conserve les appels d’action, les verrouillages pendant les requêtes, les confirmations de score, les mises, le plein écran, les résultats, le classement et la synchronisation temps réel. La gestion des joueurs reste disponible dans « Informations de la table » et dans le panneau « Table » sur mobile.

## Adaptations par jeu

- **Farkle** : grande piste centrale, six dés sur une ligne quand l’espace le permet, statistiques du joueur actif, actions existantes, suggestions et guide repliable extrait du composant d’origine. Le seuil d’entrée, les dés chauds et la perte du tour restent gérés par le moteur existant.
- **Yahtzee** : feuille de score interactive à droite sur ordinateur et sous le plateau sur mobile. Les points possibles utilisent le calcul existant ; les catégories utilisées et les tours adverses restent désactivés. La confirmation, notamment pour zéro point, est conservée. Les scores de tous les joueurs restent consultables séparément.
- **Cul de Chouette** : aperçu réel de la figure et du cumul, trois dés et mode de sélection conservés. Le guide reprend les règles déjà présentes dans KTGA, avec leurs formules, au lieu des exemples Farkle du visuel de référence.
- **Texas Hold’em** : table ovale, sièges autour du tapis, statut de chaque joueur et main locale dans le dock. Au-delà de six joueurs sur mobile, les sièges passent en grille pour rester lisibles. Les réglages de mise supplémentaires sont repliables ; le champ et l’action de relance utilisent la même valeur bornée par les limites existantes.

## Rendu et performance

`GamePieces`, `DieSolid`, le moteur Three.js, les textures, matériaux et peintures de faces, ainsi que les faces de profondeur des cartes et `CardMotionSurface`, sont réutilisés sans modification. Les cartes cachées restent cachées. Les pictogrammes de règles déjà existants restent des illustrations du guide.

Les nouveaux retours visuels reposent sur des transitions courtes de bordure, de fond et de sélection. Aucun rendu continu ni bibliothèque supplémentaire n’est ajouté. Le budget d’animation existant et la préférence de réduction des mouvements sont conservés.

## Vérifications

Le scénario `node client/test/table-interface.smoke.mjs` utilise les vrais composants de `RoomPage` et les moteurs existants avec un transport HTTP contrôlé. Il vérifie les actions de sélection, relance, score, validation, encaissement, suivi et relance poker ; les pixels des dés 3D ; les cosmétiques ; les faces de profondeur des cartes ; les cartes adverses cachées ; le plein écran ; les résolutions 320, 390, 820, 1280 et 1672 px ; ainsi qu’une table de neuf joueurs. Ghostery avec EasyList et EasyPrivacy reste activé pendant ces contrôles. Les captures et résultats sont enregistrés sous `docs/previews/table-interface-20261027/`.

Les scénarios existants `dice-solid.smoke.mjs` et `card-solid.smoke.mjs` couvrent également les textures, animations, sélections, déplacements, confidentialité, absence de rendu continu au repos et repli sans WebGL.

Le mode `node client/test/rooms-events.smoke.mjs --tables-only` lance un vrai serveur isolé et deux navigateurs pour vérifier jonction à une table protégée, préparation, démarrage, lancers synchronisés, verrouillage des requêtes, plein écran et exclusion avec réception de l’événement par le second client. Ses comptes sont précréés dans une base temporaire, sans dépendre d’un envoi d’email. Les exécutables navigateur de ces scénarios se configurent avec `PLAYWRIGHT_MODULE` et `BLOCKER_MODULE` selon les conventions des tests existants.

Les tests ciblés des moteurs et de l’état public passent : 72 contrôles serveur et 20 contrôles des pièces, sons et tours côté client. Le build client et SSR passe. La suite globale comporte des échecs hors de cette refonte : source française manquante pour « Prix maximum par monnaie », attente CSP de Tag Manager et sauvegarde de migration SQLite. Deux échecs de démarrage sous la charge de la suite complète passent lors de la relance isolée.
