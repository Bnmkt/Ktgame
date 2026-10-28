# Interfaces des tables

Deuxième itération : Farkle, Yahtzee, Cul de Chouette, Texas Hold’em et Blackjack. Les dix autres jeux et la salle d’attente conservent leur interface. Aucun moteur serveur, événement Socket.IO ou protocole d’action n’est modifié.

## Composants communs

`client/src/components/room/TableInterface.jsx` fournit le HUD, les joueurs et leurs scores, le titre du plateau, les informations de manche, l’indication du tour, les statistiques, la zone de commandes et les panneaux repliables. `table-stage.css` ajoute la composition avec HUD compact, grandes pièces et dock de commandes. Les feuilles CSS sont limitées aux tables qui possèdent la classe `table-interface`. Les couleurs de surface suivent les variables du thème existant ; les apparences des pièces gardent leurs propres styles.

`client/src/features/games/table-interface.js` contient la liste des jeux intégrés et les fonctions de présentation des manches et des sièges. Pour intégrer un autre jeu, réutiliser les composants communs, adapter les informations à son état réel, puis l’ajouter à cette liste après vérification de ses commandes et de son rendu. Les tables de huit ou neuf joueurs au poker utilisent quatre sièges en haut, deux sur les côtés et les autres en bas pour éviter les chevauchements dans les fenêtres basses. Il ne faut pas activer les quinze jeux en bloc sans cette adaptation.

`RoomPage.jsx` conserve les appels d’action, les verrouillages pendant les requêtes, les confirmations de score, les mises, le plein écran, les résultats, le classement et la synchronisation temps réel. La gestion des joueurs reste disponible dans « Informations de la table » et dans le panneau « Table » sur mobile.

## Adaptations par jeu

- **Farkle** : grande piste centrale, six dés sur une ligne quand l’espace le permet, statistiques du joueur actif, actions existantes, suggestions et guide repliable extrait du composant d’origine. Le seuil d’entrée, les dés chauds et la perte du tour restent gérés par le moteur existant.
- **Yahtzee** : feuille de score interactive à droite sur ordinateur et sous le plateau sur mobile. Les points possibles utilisent le calcul existant ; les catégories utilisées et les tours adverses restent désactivés. La confirmation, notamment pour zéro point, est conservée. Les scores de tous les joueurs restent consultables séparément.
- **Cul de Chouette** : aperçu réel de la figure et du cumul, trois dés et mode de sélection conservés. Le guide reprend les règles déjà présentes dans KTGA, avec leurs formules, au lieu des exemples Farkle du visuel de référence.
- **Texas Hold’em** : table ovale, sièges autour du tapis, statut de chaque joueur et main locale dans le dock. Au-delà de six joueurs sur mobile, les sièges passent en grille pour rester lisibles. Les réglages de mise supplémentaires sont repliables ; le champ et l’action de relance utilisent la même valeur bornée par les limites existantes.

- **Blackjack** : `BlackjackTable.jsx` réutilise `PlayingCard` et `AnimatedDealerHand`, les limites de mise et tous les gestionnaires existants de Room. Les décisions restent simultanées contre le croupier. Le sélecteur et les préréglages respectent le minimum, le maximum et le solde ; tirer, rester, doubler, se coucher et montrer sa main restent disponibles selon les mêmes conditions. Les résultats suivent les gagnants calculés par le serveur, avec distinction victoire, Blackjack, égalité, défaite et dépassement. Aucune assurance, séparation ou règle de paiement 3:2 n’est ajoutée : le moteur ne les prévoit pas. L’historique concerne la main courante. Les places libres suivent la capacité réelle et les mains longues réduisent leurs cartes à l’intérieur de leur siège.

## Rendu et performance

`GamePieces`, `DieSolid`, le moteur Three.js, les textures, matériaux et peintures de faces, ainsi que les faces de profondeur des cartes et `CardMotionSurface`, sont réutilisés sans modification. Les cartes cachées restent cachées. Les pictogrammes de règles déjà existants restent des illustrations du guide.

Le HUD regroupe désormais le jeu, la phase ou la manche, les joueurs et leurs scores. Les informations redondantes ont été retirées des plateaux. La hauteur utile se mesure sous l’en-tête du site ; en 1366 × 768, 1920 × 1080 et 2560 × 1440, plateau et commandes restent dans la fenêtre. Les panneaux secondaires et la feuille de score défilent indépendamment. Les nouveaux retours visuels reposent sur des transitions courtes de bordure, de fond et de sélection, ainsi qu’une apparition brève des résultats Blackjack. Aucun rendu continu ni bibliothèque supplémentaire n’est ajouté. Le budget d’animation existant et la préférence de réduction des mouvements sont conservés.

## Vérifications

Le scénario `node client/test/table-interface.smoke.mjs` utilise les vrais composants de `RoomPage` et les moteurs existants avec un transport HTTP contrôlé. Il vérifie les actions de sélection, relance, score, validation, encaissement, suivi et relance poker ; les pixels des dés 3D ; les cosmétiques ; les faces de profondeur des cartes ; les cartes adverses cachées ; le plein écran ; les résolutions 320, 390, 820, 1366, 1920 et 2560 px ; l’absence de défilement vertical des éléments essentiels sur ordinateur ; une table de neuf joueurs sans sièges qui se chevauchent ; et un Blackjack à cinq joueurs avec une main longue. Ghostery avec EasyList et EasyPrivacy reste activé pendant ces contrôles. Les captures et résultats sont enregistrés sous `docs/previews/table-stage-20261028/`.

Les scénarios existants `dice-solid.smoke.mjs` et `card-solid.smoke.mjs` couvrent également les textures, animations, sélections, déplacements, confidentialité, absence de rendu continu au repos et repli sans WebGL.

Le mode `node client/test/rooms-events.smoke.mjs --tables-only` lance un vrai serveur isolé et deux navigateurs pour vérifier jonction à une table protégée, préparation, démarrage, lancers synchronisés, verrouillage des requêtes, plein écran et exclusion avec réception de l’événement par le second client. Ses comptes sont précréés dans une base temporaire, sans dépendre d’un envoi d’email. Les exécutables navigateur de ces scénarios se configurent avec `PLAYWRIGHT_MODULE` et `BLOCKER_MODULE` selon les conventions des tests existants.

Les tests ciblés des moteurs et de l’état public passent : 72 contrôles serveur et 20 contrôles des pièces, sons et tours côté client. Le build client et SSR passe. La suite globale comporte des échecs hors de cette refonte : source française manquante pour « Prix maximum par monnaie », attente CSP de Tag Manager et sauvegarde de migration SQLite. Deux échecs de démarrage sous la charge de la suite complète passent lors de la relance isolée.

## Publication

`deploy/debian/update-table-interface.sh` construit une version isolée à partir des sources en production et applique uniquement les fichiers des tables et leurs nouvelles traductions. Le manifeste de livraison vérifie les empreintes de départ et le script refuse de publier si les sources ont changé pendant la compilation. Les cosmétiques, réglages d’apparence, données et autres personnalisations du site sont conservés.

La publication prend le verrou de déploiement existant, vérifie l’absence de tables ouvertes, sauvegarde les sources et le build précédent, conserve les anciens assets pour les onglets ouverts, publie les documents d’entrée en dernier et relance le service à vide pour actualiser son HTML en mémoire. Une erreur provoque le retour au build précédent ; les URL publiques et le nouvel asset d’entrée sont contrôlés avant de confirmer la livraison.
