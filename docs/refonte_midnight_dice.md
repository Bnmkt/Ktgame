# Midnight Dice — table et cartes Mandat

Livraison du 15 novembre 2026. Le plateau reprend la disposition physique : jusqu'à trois joueurs de chaque côté, marché central, horloge, pioche et défausse, puis mandat personnel et actions. Les septième et huitième places restent disponibles aux extrémités. Le fond du casino et les cosmétiques KTGA sont conservés.

## Cartes et administration

Dans **Administration → Jeux → Dés de Minuit → Visuels**, la section **Apparence des cartes Mandat** configure le modèle du recto, le verso, deux polices, les couleurs, la marge intérieure, les zones de texte et l'espacement des exemples. Les images peuvent être importées avec l'éditeur d'images existant, choisies dans la médiathèque ou renseignées par URL HTTPS/chemin local. Les modèles SVG fournis dans `client/public/midnight-dice/` sont des solutions de repli remplaçables ; les modèles originaux peuvent être importés sans modifier le code. Un modèle contenant déjà les libellés Condition/Exemples désactive leurs doubles HTML ; ce choix reste modifiable.

Le ratio reste **88 × 63**. Le nom, le palier, la prime, la condition et les valeurs des trois exemples sont de vrais textes. `FittedCopy` mesure leur emplacement, ajuste la police entre les bornes configurées et respecte les retours à la ligne. L'éditeur refuse l'enregistrement si un texte visible dépasse sa zone à la taille minimale ; il faut alors agrandir la zone ou réduire cette borne. La consultation agrandie conserve le ratio et reprend la condition complète sous la carte.

Dans **Règles → Mandats → Personnage et aperçu du mandat**, chaque mandat possède son illustration, ses coordonnées, son échelle et son ordre de superposition. Le déplacement et le redimensionnement fonctionnent directement dans l'aperçu, avec des champs numériques et une réinitialisation du positionnement. Ces champs sont indépendants de la condition de réussite et du palier.

`MidnightContractCard` est partagé entre l'administration, la sélection, la consultation, le codex, la défausse et les résultats. Trois exemples valides sont calculés depuis l'évaluateur du mandat. Si une règle ordonnée n'admet qu'une seule combinaison, elle occupe les trois emplacements : aucun exemple invalide n'est inventé. Les dés miniatures imprimés des exemples utilisent le composant existant en mode inline ; tous les dés jouables et récupérés conservent leur rendu 3D, textures, matériaux et cosmétiques.

Le design général est stocké dans `settings.games["midnight-dice"].midnightCardDesign`. L'illustration individuelle est stockée dans `midnightContracts[].artwork`. L'API admin existante valide les URL, polices autorisées, couleurs et dimensions. Une copie accompagne le catalogue de la partie : les réglages et règles d'une partie commencée restent cohérents après reconnexion ou redémarrage.

## Interactions

Les cartes proposées tiennent sur une ligne sur ordinateur et sur deux colonnes sur mobile. Le clic sélectionne ; **Confirmer le mandat** envoie l'action. La consultation agrandie reste distincte de la confirmation. Les autres joueurs ne reçoivent jamais le mandat choisi par un adversaire.

Un clic sur un dé du marché sélectionne sa véritable identité. **Jouer le dé** confirme sa récupération ; **Relancer** utilise une relance et conserve le dé dans le marché. Les restrictions de tour, la présentation des résultats et l'attente d'une requête désactivent les actions appropriées.

Les `marketIds` sont attribués par le serveur et conservés lors d'une relance ; retirer un dé retire uniquement son identifiant. La position des autres dés ne dépend donc pas du nouvel indice dans le tableau. `marketRollKeys` distingue aussi une relance qui retombe sur la même valeur. Les animations suivent les instantanés reçus : elles ne déclenchent aucune action et ne retardent pas la synchronisation. Reconnexion, changement de résolution et plein écran restaurent immédiatement l'état actuel. La réduction des animations est respectée.

## Nouvelles règles confirmées

Les nouvelles parties portent `rulesVersion: 2` :

- Chaque joueur dispose de **deux relances pour l'ensemble de la manche**, sans remise à zéro à chaque passage.
- En mode individuel, les trois cartes non jouées restent en main ; une carte est piochée après la manche pour revenir à quatre.
- Le mode commun reste disponible : les cartes jouées par les participants sont remplacées dans le choix partagé. Il peut donc remplacer plusieurs cartes, afin de conserver une offre commune.
- Quand une pioche est épuisée, les cartes disponibles sont remélangées sans créer de doublon dans la main. Le petit catalogue minimum de six cartes reste pris en charge.
- Le Meneur initial est un joueur aléatoire par défaut ; il tourne ensuite à chaque manche.

Les anciens états sans version, ou explicitement en version 1, gardent leurs groupes de quatre manches et leur nombre de défausses configuré. Aucune migration ne réinterprète une partie déjà commencée.

## Modificateurs de table

| Paramètre | Par défaut | Autres choix |
| --- | --- | --- |
| Premier joueur | Joueur aléatoire | Premier siège ; Dés de minuit (option aléatoire) |
| Condition de victoire | Score le plus haut | Score le plus bas ; le plus de mandats réussis ; Dés de minuit (option aléatoire) |
| Révélation de la condition de victoire | Début de partie | Fin de partie, si la condition est aléatoire |

« Dés de minuit » tire une option du réglage concerné **une seule fois côté serveur**, au lancement. Le résultat est persisté dans `resolvedOptions`. Une condition aléatoire révélée à la fin est remplacée par `null` dans les projections réseau tant que la partie n'est pas terminée, y compris pour les spectateurs. Le classement intermédiaire n'utilise pas cette condition cachée. Le plateau affiche « Condition secrète », puis la véritable condition dans les résultats finaux. Les critères connus sont affichés sur le plateau dès le départ.

Le moteur calcule les gagnants, les classements classique et classé utilisent le même critère et les égalités exactes partagent la victoire. Les points cumulés restent affichés comme des points, y compris lorsqu'un score bas gagne.

## Confidentialité et composants

- `server/src/games/engines/midnight-dice.js` : version des règles, sélection, pioches, identités des dés, budgets, rotation du Meneur et résultats.
- `client/src/features/games/midnightDice/contracts.js` : évaluateur partagé, exemples, critère de classement et projection des options publiques.
- `appearance.js` : configuration graphique centralisée et validation indépendante des règles.
- `MidnightTable.jsx` : zones Joueur, marché, horloge, sélection, consultation, animations et révélations.
- `MidnightContractCard.jsx` : composition unique du mandat et ajustement du texte.
- `MidnightCardDesignEditor.jsx` : import d'images, design commun et manipulation individuelle.
- `server/src/index.js` et `spectator-state.js` : suppression des pioches futures, des propositions privées et des conditions de victoire différées dans les réponses. Les identités des cartes déjà révélées sont publiques.
- `room-runtime.js`, `ranked.js`, `ClassicCompletion.jsx` et `RankedCompletion.jsx` : règles dans les workers, classements et bilans finaux.

## Vérification

Résultats : **86 tests ciblés réussis**, **16 tests API réussis** (un test historique de suspension de processus indisponible sous Windows), deux parcours navigateur réussis et build client/SSR validé.

Captures : [plateau sur ordinateur](./previews/midnight-physical-20261115/1794703674507/plateau-laptop.png), [plateau sur mobile](./previews/midnight-physical-20261115/1794703674507/plateau-mobile.png), [mandat agrandi](./previews/midnight-physical-20261115/1794703674507/mandat-agrandi.png), [éditeur graphique](./previews/midnight-contracts-20261104/1794703769590/apparence-admin.png).

Les tests de règles couvrent deux à huit joueurs, les catalogues de six et douze mandats, huit manches, les modes individuel et commun, l'épuisement des pioches, les budgets partagés de relance, les identités stables, les tirages uniques, les trois critères de victoire et les états historiques. Les tests API réels couvrent les rôles, les réglages graphiques invalides, la sauvegarde, le redémarrage et les projections privées. Les tests du runtime isolé des workers et du mode classé restent exécutés.

Les parcours navigateur utilisent Ghostery et deux vues privées reliées par Socket.IO au moteur réel. Ils vérifient la sélection/confirmation, le secret des mandats et de la victoire, les relances, la récupération, la pioche suivante, les révélations et le bilan final. Résolutions : 1366 × 768, 1920 × 1080, tablette 820 px, mobiles 390/320 px et plein écran. L'éditeur est exercé par création/modification/suppression, glisser-déposer du personnage, redimensionnement, réinitialisation, recto/verso et conservation de la logique du mandat.

Commandes principales :

```powershell
node --test server/test/midnight-physical.test.js server/test/midnight-contracts.test.js server/test/midnight-catalog.test.js server/test/game-modules.test.js server/test/game-worker-kernel.test.js server/test/ranked-runtime.test.js client/test/classic-completion.test.js client/test/room-sounds.test.js
node --test server/test/admin-contact-api.test.js
node client/test/midnight-table.smoke.mjs
node client/test/midnight-contract-editor.smoke.mjs
npm --prefix client run build
```
