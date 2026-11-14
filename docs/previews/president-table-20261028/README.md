# Table Président — 28 octobre 2026

## Ajustements du 14 novembre 2026

« Jouer la sélection » se trouve à gauche en vert et « Passer » à droite en rouge. Le nouveau bouton « Trier les cartes », sous « Tout désélectionner », classe la main de la plus faible à la plus forte selon l'ordre actuel. Cette opération est uniquement déclenchée au clic : ni la distribution, ni une mise à jour serveur, ni une révolution ne trient implicitement la main. Les cartes de même rang conservent leur position relative et la sélection reste attachée aux identités. Le glisser-déposer et la mémorisation locale de l'ordre restent disponibles ; aucune action métier n'est envoyée pour le tri.

Une pastille près du joueur local affiche l'ordre des valeurs et une courte échelle des cartes. Chaque changement réel de `state.revolution` déclenche un contour lumineux et un message pendant 4,5 secondes, y compris le retour à l'ordre classique. La reconnexion restaure l'indicateur sans rejouer le signal. L'indicateur possède son espace dans la ligne d'identité ; sur mobile, il occupe une ligne distincte. Les préférences de réduction des animations sont respectées.

Les scénarios navigateur incluent deux carrés joués par le moteur, la synchronisation de l'indicateur entre deux joueurs, le tri normal et inversé, la conservation de la sélection et de l'ordre après reconnexion, la position et la couleur des actions ainsi que l'absence de chevauchement de l'indicateur avec la main. Le parcours utilise Ghostery et couvre les résolutions ci-dessous.

Validation : 11 tests ciblés et parcours navigateur complet réussis ; build client et SSR validé. Captures : [révolution et commandes](./1794649298324/revolution-controls.png), [indicateur et tri sur mobile](./1794649298324/direction-mobile.png).

## Refonte initiale

Captures validées : [1793197177027](./1793197177027/).

- [1366 × 768, six joueurs](./1793197177027/6-players-laptop.png)
- [1920 × 1080](./1793197177027/6-players-desktop.png)
- [Main de 18 cartes, trois joueurs](./1793197177027/3-players-laptop.png)
- [Sélection multiple](./1793197177027/multiple-selection.png)
- [Paire jouée](./1793197177027/played-pair.png)
- [Plein écran](./1793197177027/fullscreen.png)
- [Mobile](./1793197177027/6-players-mobile.png)
- [Résultats des contrôles](./1793197177027/results.json)

Les cartes utilisent `PlayingCard`, ses volumes, ses textures et les cosmétiques équipés. Le survol, la sélection et le glisser-déposer conservent une opacité de 1. Les mains adverses ne reçoivent que des dos et leur nombre réel de cartes.

La main conserve l’ordre de distribution du serveur. Son ordre manuel est mémorisé localement, par partie et par joueur, puis réconcilié par identité à chaque snapshot. Il ne provoque aucune requête métier. Alt + flèche permet aussi de déplacer une carte au clavier.

La distribution représente les 52 cartes déjà attribuées par le serveur, siège après siège. Elle peut être accélérée ou passée ; une action serveur, un changement de résolution ou de plein écran l’arrête immédiatement. Une connexion à une partie en cours et une reconnexion restaurent les mains sans relancer cette animation. Les préférences de réduction des animations sont respectées.

Le moteur retire désormais les identités sélectionnées par indices décroissants : une sélection réordonnée ne peut plus retirer une carte voisine. Aucun barème, tour, règle de révolution ou événement multijoueur n’a changé. Les rangs sont affichés à partir de l’ordre réel des sorties ; la maquette n’ajoute aucune règle d’échange.

Validation : 59 tests ciblés ; parcours navigateur avec Ghostery activé, de 3 à 6 joueurs et de 320 à 2560 px ; serveur isolé avec trois comptes et deux navigateurs ; régressions de passage automatique, révolution, sons, reconnexion et décision de tapis au poker ; build client et SSR.

Commandes :

```powershell
node client/test/president-table.smoke.mjs
node client/test/president-multiplayer.smoke.mjs
node --test client/test/president.test.js client/test/card-solid.test.js client/test/room-sounds.test.js client/test/turn-notice.test.js server/test/president-order.test.js server/test/game-modules.test.js server/test/ranked-runtime.test.js
npm --prefix client run build
```
