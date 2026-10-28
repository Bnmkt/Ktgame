# Sélecteur de jeux et cartes Président — 28 octobre 2026

La nouvelle vue immersive est indépendante de la grille classique. Les deux utilisent les mêmes jeux filtrés, favoris, modes, permissions, flux de tables et boîtes de création/rejointure. Le choix de vue est mémorisé sur l’appareil. Le mode classique conserve son balisage de cartes et ses actions.

Les jeux décrivent une ellipse avec profondeur et inclinaison ; une seule variable CSS pilotée par une animation amortie détermine leur rotation. Il n’y a ni défilement horizontal des cartes ni rendu React à chaque image d’animation. La molette est capturée seulement sur le sélecteur. Navigation au clavier, clic direct, flèches et glissement tactile restent disponibles. Sur mobile, les sièges éloignés sont masqués.

L’illustration centrale utilise l’icône Discord existante (`discordIconImage`), puis la couverture du jeu ou une mascotte si nécessaire. Les autres sièges réutilisent les couvertures. La sélection aléatoire respecte le filtre et la disponibilité, anime le plateau puis s’aligne sur le résultat ; elle ne crée aucune table et ne rejoint aucune file.

Captures du parcours validé [1793214705108](./1793214705108/) :

- [1366 × 768](./1793214705108/immersive-laptop.png)
- [1920 × 1080](./1793214705108/immersive-desktop.png)
- [Mobile](./1793214705108/immersive-mobile.png)
- [Petite résolution](./1793214705108/immersive-small.png)
- [Vue classique](./1793214705108/classic-laptop.png)
- [Résultats](./1793214705108/results.json)

Pour Président, les valeurs et les symboles sont de nouveau centrés. Le chevauchement s’adapte pour laisser le centre visible dans une main de 18 cartes. Les volumes, matériaux, dos, couleurs et cosmétiques restent ceux de `PlayingCard`.

- [Thème encadré](../president-table-20261028/1793213902638/centred-premium-frame.png)
- [Thème sombre](../president-table-20261028/1793213902638/centred-premium-obsidian.png)
- [Thème royal](../president-table-20261028/1793213902638/centred-premium-royal.png)

Validation : 22 tests unitaires ciblés ; parcours du sélecteur avec les 15 illustrations, Ghostery, navigation circulaire, molette sans défilement de page, tactile Chromium réel, filtres simples/avancés partagés, vues mémorisées, création/rejointure et mode classé ; parcours Président avec thèmes et opacité ; serveur isolé avec deux navigateurs pour démarrage, temps réel, reconnexion et plein écran. Build client et SSR validé. Aucun moteur de jeu ne change dans cette livraison.

```powershell
node --test client/test/game-selector.test.js client/test/president.test.js client/test/game-presentation.test.js client/test/room-sounds.test.js client/test/card-solid.test.js
node client/test/game-selector.smoke.mjs
node client/test/president-table.smoke.mjs
node client/test/rooms-events.smoke.mjs --tables-only
npm --prefix client run build
```

Le parcours historique plus large `game-presentation.smoke.mjs` est configuré pour la vue classique ; il atteint ensuite l’administration des traductions et échoue sur l’attente « Translations saved. ». Les contrôles fonctionnels du catalogue ci-dessus passent. Les modifications préexistantes de l’administration et du thème ne font pas partie de cette livraison.
