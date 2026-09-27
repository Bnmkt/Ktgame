# Architecture de développement

Le projet suit désormais un découpage progressif par responsabilité. Les gros points d'entrée historiques restent compatibles pendant la migration, mais toute nouvelle fonctionnalité doit être placée dans un module métier dédié.

## Client

```text
client/src/
├── App.jsx                         # session, navigation et composition racine
├── api.js                          # transport HTTP et authentification
├── config/
│   └── site.js                     # réglages publics, règles et catalogues visuels
├── components/
│   ├── cosmetics/Cosmetics.jsx     # rendu et conception des objets de boutique
│   ├── feedback/Feedback.jsx       # notifications, toasts et pagination
│   ├── room/RoomPanels.jsx         # statut, scores, mises et journal d'une table
│   └── game/
│       ├── GamePieces.jsx          # composants visuels carte et dé
│       ├── GameSupport.jsx         # règles et fonctions d'affichage partagées
│       └── GameBoards.jsx          # plateaux spécialisés extraits de la room
├── features/
│   └── games/
│       ├── config.js               # métadonnées et options communes
│       ├── midnightDice/model.js   # affichage et calculs du jeu
│       └── velvetRuse/model.js     # validation locale des annonces
├── pages/
│   ├── AuthPage.jsx                # connexion, inscription et invité
│   ├── LobbyPage.jsx               # catalogue et création/rejoint de tables
│   ├── RoomPage.jsx                # orchestration temps réel d'une partie
│   ├── ProfilePage.jsx             # compte, boutique et profil public
│   └── AdminPage.jsx               # administration et studio boutique
└── utils/
    └── presentation.jsx            # dates, libellés et statistiques d'affichage
```

`App.jsx` ne contient plus les écrans : il conserve uniquement la session, la navigation globale, les notifications et le chargement des styles cosmétiques. Les composants partagés ne doivent pas connaître une page complète. Les données statiques et fonctions pures vont dans `config`, `features` ou `utils`; l'état React et les appels réseau restent dans la page qui les orchestre.

## Serveur

```text
server/src/
├── index.js                        # démarrage HTTP, routes et orchestration des rooms
├── services/
│   └── cosmetic-validation.js      # validation CSS, animations et designs boutique
└── games/
    ├── shared.js                   # cartes, dés et primitives communes
    ├── modifiers.js                # validation centralisée des variantes
    ├── engine-context.js           # journal et représentation publique
    ├── engines.js                  # registre et routeur sans règle métier
    └── engines/
        ├── yahtzee.js              # score, tours et IA Yahtzee
        ├── four-twenty-one.js      # classement, tours et IA 421
        ├── cul-de-chouette.js      # figures, tours et IA Cul de Chouette
        ├── farkle.js               # dés scorants, banque et IA Farkle
        ├── liars-dice.js           # enchères, révélations et IA Liar's Dice
        ├── shut-the-box.js         # combinaisons de tuiles et IA
        ├── blackjack.js            # mains simultanées et résolution du croupier
        ├── president.js            # plis, révolution, classement et IA
        ├── texas-holdem.js         # blindes, enchères, pots annexes et mains suivantes
        ├── bataille.js             # piles, connaissance des pioches et résolutions différées
        ├── golf-solitaire.js       # tableau et pioche du Golf
        ├── accordion.js            # piles et déplacements de l'Accordion
        ├── midnight-dice.js        # état, règles, actions et IA
        └── velvet-ruse.js           # état, règles, actions et IA
```

Chaque jeu possède désormais son propre moteur. Un moteur dédié expose idéalement trois fonctions : création de l'état, application d'une action et décision de l'IA. Les règles utilisées par l'IA doivent appeler les mêmes fonctions pures que les actions humaines afin de ne pas dupliquer les calculs. Les transitions pilotées par le temps, comme la fin d'une confrontation ou le lancement d'une nouvelle main, restent elles aussi dans le moteur concerné.

## Ajouter ou modifier un jeu

1. Ajouter les valeurs par défaut et leurs bornes dans `server/src/games/modifiers.js`.
2. Créer un moteur dans `server/src/games/engines/<jeu>.js`.
3. Enregistrer uniquement sa création et ses actions dans les tables de routage de `server/src/games/engines.js`.
4. Placer sa configuration d'interface dans `client/src/features/games/config.js` et ses calculs d'affichage dans son propre dossier.
5. Ajouter un test de cycle de jeu dans `server/test` puis lancer `npm test` dans `server` et `npm run build` dans `client`.

Depuis la racine, `npm run check` exécute ces deux validations en une seule commande. `npm run dev:client` et `npm run dev:server` permettent aussi de démarrer chaque moitié du projet sans changer de dossier.

## Règles de dépendance

- Un moteur ne dépend jamais d'Express, de Socket.IO ou de la base de données.
- Les routes orchestrent; elles ne recalculent pas les règles d'un jeu.
- Le client peut prévisualiser un score, mais le serveur reste la source de vérité.
- Les fonctions pures et constantes partagées ont un seul propriétaire.
- Une modification de schéma doit être rétrocompatible avec les données existantes et accompagnée d'un test ciblé.

## Migration restante

`styles.css` et `server/src/index.js` contiennent encore plusieurs domaines historiques. La prochaine passe côté client pourra scinder les styles par domaine et déplacer progressivement les plateaux encore rendus directement dans `RoomPage.jsx`. Leur découpage doit rester progressif : extraire un écran ou un service à la fois, vérifier le build et les tests, puis seulement supprimer l'ancienne implémentation.
