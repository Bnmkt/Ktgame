# Gestion des mandats des Dés de Minuit

Dans **Administration → Jeux → Dés de Minuit → Règles**, la section **Mandats des Dés de Minuit** permet de créer, modifier et supprimer les mandats. Les opérations préparent le catalogue dans le formulaire ; **Enregistrer** applique l'ensemble des changements. **Annuler** les abandonne. La suppression possède sa propre confirmation.

Chaque mandat possède un identifiant stable, un nom, un palier, une condition et éventuellement un texte d'aide. Si ce texte est vide, la condition génère sa description. L'éditeur permet de tester trois valeurs et affiche le résultat, la somme, la prime et le total avec les dés 3D existants.

## Conditions

| Type | Exemple | Résultat attendu |
| --- | --- | --- |
| Dés fixes | 4, puis 2, puis 1 | Réussit avec `[4,2,1]` ; échoue avec `[1,2,4]` |
| Dés variables | Un 4, un 2 et un 1 | Réussit avec toutes les permutations de ces trois valeurs |
| Somme | Égale à 10, au moins 15, au plus 7, ou entre 9 et 12 | Compare la somme des trois dés ; les bornes sont incluses |
| Spéciale : addition | Un dé égale les deux autres additionnés | Réussit notamment avec `[2,4,2]`, `[5,2,3]`, `[1,2,3]`, dans n'importe quel ordre |

Les conditions spéciales incluent également les trois valeurs différentes, exactement une paire, un brelan, une suite, trois nombres pairs ou impairs, la présence de certaines valeurs et un intervalle applicable à chaque dé. Ces choix permettent aussi de modifier les douze mandats historiques. La présence et les dés variables respectent les répétitions : exiger deux 2 ne revient pas à exiger un seul 2.

La réussite exige trois dés valides de 1 à 6. La somme rapporte toujours ses points ; la prime s'ajoute uniquement si la condition réussit.

## Paliers

Le palier est réglable pour chaque mandat : Bronze (+18), Argent (+30), Or (+45), Platine (+65), Diamant (+100). Le formulaire affiche les primes existantes ; cette livraison ajoute le choix du palier, sans créer de nouvelles catégories de paliers.

Le catalogue contient de 6 à 24 mandats. Le minimum conserve assez de groupes distincts de quatre pour huit joueurs. Le maximum borne le coût du calcul d'équilibrage. Les propositions sont calculées avec les règles et paliers configurés, et les mandats consommés restent retirés pendant leur rotation.

## Sauvegarde et parties en cours

La configuration est stockée avec les réglages du jeu dans `settings.games["midnight-dice"].midnightContracts`, au moyen du point d'entrée admin existant `PATCH /api/admin/games/:id`. Le serveur valide l'intégralité du catalogue avant de modifier les réglages et vérifie le rôle administrateur. Aucun texte de condition n'est exécuté comme du code.

Le catalogue validé est copié dans `state.contractCatalog` au lancement de la partie. Modifier, supprimer ou changer le palier d'un mandat ne change donc pas les règles d'une partie déjà commencée. Cette copie est conservée dans les états persistés et les échanges avec les workers. La reconnexion et le redémarrage retrouvent le même catalogue.

Les parties plus anciennes qui ne possèdent pas cette propriété continuent d'utiliser les douze définitions historiques. Le codex, les aperçus, les scores, les bots et les spectateurs lisent le catalogue de leur partie. La liste complète des définitions est publique ; les propositions individuelles et les mandats effectivement choisis restent protégés par les projections existantes.

Les succès conservent les identifiants des mandats réussis, y compris les mandats personnalisés ou ensuite retirés. Le succès existant demandant douze mandats compte douze identifiants distincts ; sa cible n'est pas recalculée à chaque modification du catalogue.

## Code et vérification

- `client/src/features/games/midnightDice/contracts.js` : définitions par défaut, validation déclarative, exemples et évaluateur partagé.
- `client/src/features/games/midnightDice/model.js` : interface de compatibilité pour les appels du client.
- `client/src/components/admin/MidnightContractsEditor.jsx` : catalogue et testeur, intégré au panneau de règles de `GameEditor.jsx`.
- `server/src/index.js` : lecture du catalogue configuré et validation de la mise à jour admin.
- `server/src/services/room-runtime.js` : transmission de la configuration à la création de partie, également utilisée par les workers.
- `server/src/games/engines/midnight-dice.js` : copie par partie, rotations équilibrées et prise en compte des conditions par les bots. Le cache des groupes de propositions est limité à huit versions de catalogue.
- `GameBoards.jsx`, `RoomPanels.jsx`, `spectator-state.js` et `result-achievements.js` : affichage, projection publique et suivi des réussites.

Les tests `server/test/midnight-catalog.test.js` parcourent les 216 combinaisons pour les quatre nouveaux types, vérifient les exemples fournis, les répétitions, les bornes du catalogue, les règles invalides, les bots, les points d'une vraie manche et la conservation du catalogue après sérialisation. Les scénarios historiques de mandats et de résultats restent couverts.

`server/test/admin-contact-api.test.js` vérifie les permissions HTTP, la validation, l'enregistrement, le redémarrage et la conservation d'un ancien catalogue dans un salon commencé. `server/test/game-worker-kernel.test.js` couvre le même principe dans le runtime isolé des workers.

`client/test/midnight-contract-editor.smoke.mjs` exerce la création, modification, suppression confirmée ou annulée, le palier, les quatre types de conditions, les prévisualisations, l'enregistrement, le rechargement, l'annulation et le codex personnalisé. L'interface est vérifiée sur ordinateur et mobile avec Ghostery activé. Les essais utilisent des données et serveurs isolés.
