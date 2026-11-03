# Harmonisation des tables par famille

## Périmètre

Les quinze jeux utilisent désormais `TableHud` et les panneaux secondaires repliables de `TableInterface`. Les six tables déjà refaites conservent leur organisation. Les neuf tables suivantes rejoignent ce cadre :

| Famille | Jeux | Zones conservées |
| --- | --- | --- |
| Dés | 421 | Conservation des dés, combinaison, validation et relances payantes si configurées |
| Dés | Dés du menteur | Gobelets adverses fermés, dés privés, enchère et contestation |
| Dés | Shut the Box | Tuiles, total du lancer, sélection et suggestions de fermeture |
| Dés | Dés de Minuit | Choix du mandat, marché, plateaux des joueurs et défausses |
| Cartes | Bataille | Paquet de chaque camp, pioche privée, placement secret et confrontation |
| Cartes | Belote | Équipes, sièges, retournée, choix d'atout, plis et annonces |
| Cartes | Velours Noir | Influence, dossier, pioche/défausse, déclaration et contestation |
| Solitaires | Golf | Sept colonnes, paquet restant et carte active |
| Solitaires | Accordion | Ruban déjà distribué, sélection de la source et cibles légales |

Les titres, phases et comptes du HUD proviennent des états existants. Les jeux sans objectif chiffré ne reprennent plus l'objectif par défaut du Farkle. La Bataille indique des actions simultanées. Les tableaux possédant leurs propres sièges ne répètent pas les joueurs dans une deuxième bande au-dessus du plateau.

Les historiques de confrontation, résultats détaillés de manche, audits et options secondaires sont consultables dans des blocs repliables. Les décisions et commandes de jeu restent accessibles dans leur zone spécifique. Le bilan final commun reste ouvert en fin de partie.

## Pièces et mouvements

`CardStock` réutilise trois instances de `PlayingCard` face cachée pour représenter un paquet. Chaque couche conserve la profondeur et le thème équipé. Le nombre affiché correspond à la longueur autorisée par le serveur ; une pioche vide affiche un emplacement vide.

`CardMotionSurface` conserve les mouvements des cartes jouées et reconnaît aussi leur source de pioche. Les tirages se déplacent depuis le paquet vers la destination, face cachée pendant le trajet ; la face locale ou publique apparaît à l'arrivée. Les mains adverses gardent leurs dos. Les vols ne remplacent pas les modèles par des images et n'altèrent ni les valeurs ni les matériaux.

Les distributions initiales sont préparées par `tableDealSequence`, à partir des comptes et des positions de l'état reçu. La Belote suit les paquets de trois puis deux cartes en commençant après le donneur, puis la retournée. Velours Noir suit les mains dans l'ordre des joueurs, puis les cartes publiques. Le Golf suit les colonnes existantes puis la carte active. La Bataille reçoit les deux paquets déjà déterminés. Accordion distribue les 52 cartes déjà présentes dans le ruban : aucun bouton de pioche ni nouvelle règle n'est ajouté à ce solitaire.

L'animation commence sur une transition observée de salle d'attente vers une nouvelle partie, ou sur une nouvelle donne de Belote. Le chargement d'une partie en cours et la reconnexion restaurent immédiatement l'état reçu. Un marqueur de session empêche également la répétition d'une distribution déjà vue. Une action ou un nouvel état interrompt la distribution ; le moteur et le réseau n'attendent jamais sa fin.

Un bouton permet de passer la distribution. Un changement de taille, le plein écran ou un changement de visibilité annule les vols et restaure les cartes. La préférence système de réduction des mouvements désactive la distribution. Le nombre de clones simultanés reste limité ; aucune boucle de jeu supplémentaire ni nouveau message réseau n'est créé.

Les composants `Die`, `DieSolid` et `DiceThrowTray`, leurs textures, leurs animations de lancer et leur moteur de rendu restent réutilisés.

## Organisation du code

- `client/src/features/games/table-families.js` : familles, indications contextuelles et séquences visuelles de distribution.
- `client/src/features/games/table-interface.js` : activation des quinze tables et compteurs de manche/phase.
- `client/src/components/room/TableInterface.jsx` : HUD et panneaux communs.
- `client/src/components/room/family-tables.css` : disposition des neuf nouvelles tables, sans changement des matériaux des pièces.
- `client/src/components/game/CardStock.jsx` : paquet de cartes 3D commun.
- `client/src/components/game/CardMotionSurface.jsx` : mouvements, distribution, interruption et nettoyage des clones.
- `client/src/components/game/SolitaireTable.jsx` : présentation extraite des blocs existants du Golf et d'Accordion.
- `GameBoards.jsx`, `BeloteBoard.jsx` et `RoomPage.jsx` : intégration des présentations aux commandes existantes.

Aucun moteur de jeu, règle, stockage serveur ou événement multijoueur n'est modifié.

## Validation

`client/test/table-families.test.js` compare les séquences aux états des moteurs et vérifie qu'elles ne les modifient pas. `client/test/table-families.smoke.mjs` charge le vrai composant `Room`, applique ses actions aux moteurs existants et utilise Socket.IO pour les mises à jour entre deux vues. Les réponses de test masquent les mains adverses comme les projections serveur.

Le scénario couvre les formats 1920 × 1080, 1366 × 768, 820 × 1180, 390 × 844 et 320 × 740, le plein écran, les cartes et dés 3D, les thèmes, les commandes, les distributions et leur interruption. Ghostery est activé pour vérifier la présence du HUD et des nouvelles zones.

Les scénarios existants des cinq premières tables et du Président servent de contrôles de régression. Les moteurs serveur restent la source des règles dans tous les scénarios.

Résultats de validation de cette livraison : 35 tests ciblés réussis ; scénarios navigateur réussis pour les neuf nouvelles tables, les cinq premières tables et le Président ; build client et SSR réussi. Les 22 clés de traduction utilisées par cette refonte ont une source française et des paramètres cohérents avec l'anglais.

Le contrôle global `client/test/locales.test.js` signale une incohérence antérieure à cette livraison : certaines clés anglaises, dont `Prix maximum par monnaie`, n'ont pas d'entrée dans le JSON français du commit de départ. Cette vérification globale reste donc en échec ; les clés historiques et les changements locaux sans rapport ne sont pas réécrits par cette refonte.

Une correction du cycle d'affichage des dés réarme leur observation de visibilité lors d'un redimensionnement. Elle permet de repeindre les canevas qui reviennent à l'écran après un changement de grille, sans modifier la géométrie, les matériaux, les textures ni la trajectoire de lancer.
