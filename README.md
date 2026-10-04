<div align="center">

# 🎲 KTGA.ME

### Jeux de cartes, dés et casino social

Une plateforme multijoueur avec progression, profils, succès, classements, événements et personnalisation.

</div>

---

## 🎯 Le projet

KTGA.ME est une plateforme de jeux de cartes et de dés pensée comme un casino social sans argent réel.

Le site rassemble plusieurs jeux dans une progression commune. Les joueurs peuvent rejoindre des tables, jouer avec leurs amis, observer des parties, gagner des jetons virtuels, débloquer des succès, personnaliser leur profil et participer à des événements communautaires.

Les jetons restent entièrement internes au site. Ils servent aux mises virtuelles, aux récompenses, aux événements et aux achats cosmétiques.

Les règles importantes sont validées côté serveur afin de conserver des parties cohérentes et de protéger les informations privées des joueurs.

---

## ✨ Fonctionnalités

### 🎮 Parties et multijoueur

Les joueurs peuvent créer des tables publiques ou privées, utiliser un code ou un lien d'invitation, protéger une table par mot de passe et jouer en temps réel avec Socket.IO.

Les parties peuvent intégrer des joueurs humains et, selon le jeu, des bots. Les résultats, scores, gains et statistiques sont enregistrés dans l'historique du joueur.

Une partie déjà commencée peut être ouverte en mode spectateur. Le spectateur ne prend aucune place, ne mise aucun jeton et ne reçoit jamais les informations privées comme les mains cachées ou les dés secrets.

### 👤 Profil et communauté

Un compte enregistré dispose d'un profil public, de statistiques, d'un historique de parties, d'un historique de transactions, de jeux favoris et d'éléments cosmétiques équipés.

Le système social permet de rechercher des joueurs, envoyer et accepter des demandes d'ami, inviter directement un ami dans une table et recevoir des notifications persistantes.

Un mode invité reste disponible pour jouer sans créer de compte.

### 🪙 Progression

Les jetons constituent la monnaie virtuelle interne de KTGA.ME.

Ils peuvent être gagnés ou dépensés à travers les parties, le bonus journalier, certains événements et la boutique.

Le site propose également un système de succès configurable. Les objectifs peuvent dépendre d'une victoire, d'une action précise, d'une statistique, d'un achat, de l'activité du site ou d'un autre succès.

Les classements permettent de comparer les joueurs selon leurs victoires, leurs gains, leurs records, certains scores propres aux jeux et leur solde de jetons.

### 🎨 Personnalisation

La boutique permet de débloquer et d'équiper plusieurs catégories de cosmétiques :

- Icônes
- Effets de pseudo
- Apparences de dés
- Apparences de cartes
- Cartes de membre

Certains éléments disposent de variantes classiques, premium ou animées.

### 🎪 Événements communautaires

Les événements communautaires permettent de créer des objectifs temporaires avec progression globale, participation des joueurs, paliers, récompenses et effets liés aux cartes ou aux dés.

Ils peuvent continuer à fonctionner après l'atteinte de leur objectif principal afin de rester actifs pendant toute leur durée prévue.

### 🛠️ Administration

L'administration permet de gérer les joueurs, les jeux, les objets de la boutique, les succès, les événements, les statistiques et les informations techniques du serveur.

Dans **Supervision > Statut public**, les incidents détectés sont regroupés par service et par épisode. Leur description automatique et leur diagnostic restent privés ; l'administration peut ajouter une analyse en Markdown, suivre les actions et clôturer le dossier. Le retour à la normale et la clôture du suivi sont indépendants. Un incident public doit être publié explicitement.

Les anciens relevés conservés sont repris au premier démarrage de cette version, avec des heures approximatives. Pour les emails, une vérification réussie est conservée quinze minutes ; un échec est revérifié après une minute. Les codes SMTP utiles sont conservés côté administration, sans identifiants de connexion.

---

## 🃏 Jeux disponibles

| Jeu                | Description                                                                                      |
| :----------------- | :----------------------------------------------------------------------------------------------- |
| 🂡 Belote           | Jeu de plis en équipes de deux avec variante belge par défaut et variante française optionnelle. |
| ♠️ Texas Hold'em   | Poker communautaire avec mises, tours d'enchères et classement final des mains.                  |
| 🃏 Blackjack       | Affrontez le croupier et tentez d'approcher 21 sans le dépasser.                                 |
| ⚔️ Bataille        | Comparez les cartes tirées et résolvez les égalités avec le système de bataille.                 |
| 👑 Président       | Débarrassez vous de vos cartes avec combinaisons, passes et révolution.                          |
| 🎲 Yahtzee         | Lancez cinq dés et complétez les catégories de votre feuille de score.                           |
| 🎲 421             | Effectuez jusqu'à trois lancers et conservez les dés nécessaires à votre combinaison.            |
| 🦉 Cul de Chouette | Jeu de dés inspiré de Kaamelott avec combinaisons et règles de score spécifiques.                |
| 🔥 Farkle          | Marquez des points avec vos dés puis choisissez entre sécuriser votre score ou continuer.        |
| 🎭 Liar's Dice     | Bluffez sur les dés cachés et contestez les annonces de vos adversaires.                         |
| 🔢 Shut the Box    | Fermez les valeurs disponibles à partir du résultat des dés et réduisez votre score final.       |
| ⛳ Golf Solitaire  | Retirez les cartes en jouant une valeur immédiatement supérieure ou inférieure.                  |
| 🪗 Accordion       | Réduisez progressivement le paquet en empilant les cartes selon leurs correspondances.           |
| 🌙 Midnight Dice   | Complétez des contrats et objectifs spécifiques au fil de vos lancers.                           |
| 🎴 Velvet Ruse     | Jeu de cartes centré sur le bluff, les décisions cachées et la lecture des adversaires.          |

---

## ⚙️ Technologies

Client : React, Vite et Socket.IO.

Serveur : Node.js, Express, Socket.IO et SQLite.

Authentification : JWT.

Protection serveur : Helmet, CORS et limitation des requêtes.

Tests : suites serveur, client et parcours navigateur.

---

## 🚧 État du projet

Le cœur de KTGA.ME est déjà fonctionnel avec quinze jeux, les tables multijoueurs, les modes solo disponibles, les bots, les spectateurs, les profils, les amis, les invitations, les notifications, la boutique, les cosmétiques, les succès, les classements, les événements communautaires et l'administration.

Les principaux travaux encore prévus concernent la validation des longues sessions multijoueurs sur plusieurs navigateurs, le chat de table, l'amélioration de la stratégie des bots, le renforcement de la sécurité des comptes, les conditions de déblocage de cosmétiques liées aux succès et l'approfondissement de certaines variantes de jeu.

---

KTGA.ME est actuellement en développement actif.
