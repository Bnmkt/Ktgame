# Bonus d’XP selon les participants

## Réglages

Dans **Administration → Paramètres → XP et titres → XP gagnée et titres**, deux réglages complètent les montants de base existants :

- `completionParticipantXp` : **10 XP** par participant supplémentaire pour une partie terminée.
- `victoryParticipantXp` : **5 XP** par participant supplémentaire pour une victoire.

Ils sont configurables globalement ou pour un jeu, avec la même transmission des valeurs communes que les autres réglages d’XP. Un coefficient à zéro désactive le bonus concerné. Les valeurs sont des entiers entre 0 et 1 000 000, validés par l’API réservée aux administrateurs. Les montants de base actuels sont conservés.

## Calcul

Pour N participants, avec E = max(0, N − 1) :

- Partie terminée : base de participation + E × coefficient de participation.
- Victoire : montant précédent + base de victoire + E × coefficient de victoire.

Avec des bases de **20 XP** pour une partie terminée et **25 XP** pour la victoire :

| Participants | Défaite | Victoire |
| --- | ---: | ---: |
| 1 | 20 | 45 |
| 2 | 30 | 60 |
| 3 | 40 | 75 |
| 4 | 50 | 90 |
| 8 | 90 | 150 |

Les bots et les invités comptent dans N ; les spectateurs sont exclus. Les conditions existantes d’attribution restent en place : les comptes permanents reçoivent l’XP persistante, les bots et invités n’en reçoivent pas, et les abandons classés restent exclus de l’attribution.

## Exécution et conservation

`server/src/services/game-progression.js` normalise les deux coefficients et centralise `gameCompletionXp` et `gameXpParticipantCount`. `room-runtime.startRoomRound` enregistre les identifiants des participants dans `state.xpParticipantIds`, après la répartition réelle des sièges. Un départ ne réduit pas ce nombre. Le comptage déduplique les sièges connus, les joueurs du moteur et les éventuels joueurs partis ; une ancienne partie sans cette liste utilise les participants encore connus.

`finishRoomIfNeeded` dans `server/src/index.js` applique le calcul aux parties classiques et classées. Le nombre est enregistré dans `historyRow.xpParticipantCount` et les gains effectifs restent consignés dans `xpAwards`. Les protections contre une seconde attribution et le plafond d’XP sont conservés. Le bilan de fin de partie reçoit le montant calculé par le mécanisme existant.

Aucune réattribution automatique n’est effectuée. L’outil manuel de rattrapage `game-xp-backfill.js` utilise le même calcul pour les parties non créditées, avec le nombre enregistré ou les joueurs connus de l’historique. Il conserve les reçus existants et ne devine pas les participants manquants des anciens résultats.

## Vérification

**66 tests ciblés réussis**, build client et SSR validé, parcours de l’administration réussi avec Ghostery sur ordinateur et mobile. Les contrôles couvrent les exemples, les héritages et exceptions par jeu, zéro, les valeurs invalides, les bots et invités, les départs, les quinze moteurs, les classements et le rattrapage idempotent.

Un test HTTP réel avec deux Game Workers termine une partie de 421 avec deux comptes, un bot et un invité. L’historique enregistre quatre participants ; chaque compte reçoit exactement 50 XP ou 90 XP selon son résultat. Les consultations répétées ne créditent rien de plus.

Le parcours navigateur modifie les deux coefficients communs, crée une exception par jeu, vérifie l’héritage d’un autre jeu et recharge la page pour confirmer la sauvegarde. Il vérifie la présence des champs avec Ghostery et leur adaptation au mobile.

Captures : [ordinateur](./previews/xp-participants-20261115/1794775648644/coefficients-desktop.png), [mobile](./previews/xp-participants-20261115/1794775648644/coefficients-mobile.png), [résultats navigateur](./previews/xp-participants-20261115/1794775648644/results.json).

```powershell
node --test server/test/game-progression.test.js server/test/game-xp-backfill.test.js server/test/game-worker-kernel.test.js server/test/ranked-runtime.test.js server/test/game-worker-api.test.js client/test/classic-completion.test.js
$env:KTGA_BROWSER_TOOLS="$env:TEMP/ktga-president-controls-tools"
node client/test/xp-participants.smoke.mjs
npm --prefix client run build
```
