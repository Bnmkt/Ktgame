export const scoreCategories = [
  ["upper-1", "As"], ["upper-2", "Deux"], ["upper-3", "Trois"], ["upper-4", "Quatre"], ["upper-5", "Cinq"], ["upper-6", "Six"],
  ["three-kind", "Brelan"], ["four-kind", "Carré"], ["full-house", "Full"], ["small-straight", "Petite suite"],
  ["large-straight", "Grande suite"], ["yahtzee", "Yahtzee"], ["chance", "Chance"]
];

export const yahtzeeScoreHelp = {
  "upper-1": "Total des dés affichant 1", "upper-2": "Total des dés affichant 2", "upper-3": "Total des dés affichant 3",
  "upper-4": "Total des dés affichant 4", "upper-5": "Total des dés affichant 5", "upper-6": "Total des dés affichant 6",
  "three-kind": "Somme des 5 dés si au moins 3 sont identiques", "four-kind": "Somme des 5 dés si au moins 4 sont identiques",
  "full-house": "25 points pour un brelan accompagné d'une paire", "small-straight": "30 points pour 4 valeurs consécutives",
  "large-straight": "40 points pour 5 valeurs consécutives", yahtzee: "50 points pour 5 dés identiques", chance: "Somme des 5 dés, sans condition"
};

export const yahtzeeFixedScores = { "full-house": 25, "small-straight": 30, "large-straight": 40, yahtzee: 50 };
export const defaultBattleModifiers = { pileMode: "double", scoringMode: "high-card", hiddenDeck: false, returnAfterRounds: 3 };
export const battleScoringLabels = { "high-card": "Hauteur de carte", "pile-sum": "Addition des piles", "poker-combo": "Combo Poker" };

export const gameModifierDefinitions = {
  belote: [
    { key: "frenchRules", type: "toggle", label: "Belote française", enabledLabel: "Redistribution après huit passes", disabledLabel: "Variante belge avec prise forcée", help: "Française : roi/dame dans l'ordre de ton choix et défausse libre si ton partenaire tient le pli. Belge : roi avant dame pour la belote; sous-coupe obligatoire sur le partenaire si tu ne peux pas monter.", defaultValue: false },
    { key: "announcements", type: "toggle", label: "Annonces", enabledLabel: "Tierces, cinquantes, cents et carrés", disabledLabel: "Belote-rebelote uniquement", help: "Les annonces sont déclarées automatiquement au premier pli et révélées au second. La meilleure équipe marque ses annonces.", defaultValue: true },
    { key: "targetScore", type: "range", label: "Objectif belge (dizaines)", help: "101 par défaut. En variante française, les points sont comptés sans arrondi : objectif multiplié par 10.", min: 21, max: 501, step: 10, defaultValue: 101 }
  ],
  yahtzee: [{ key: "rollsPerTurn", type: "range", label: "Lancers par tour", help: "Entre 1 et 5 lancers avant de choisir une case.", min: 1, max: 5, defaultValue: 3 }],
  "421": [
    { key: "rounds", type: "range", label: "Nombre de manches", help: "Le classement final additionne les combinaisons de toutes les manches.", min: 1, max: 20, defaultValue: 5 },
    { key: "rollsPerTurn", type: "range", label: "Lancers gratuits", help: "Ajuste la marge de relance de chaque joueur.", min: 1, max: 5, defaultValue: 3 },
    { key: "paidRerollsEnabled", type: "toggle", label: "Relances payantes", enabledLabel: "Relances supplémentaires achetables", disabledLabel: "Relances limitées aux tentatives gratuites", help: "Après les lancers gratuits, chaque joueur peut acheter des tentatives supplémentaires.", defaultValue: true },
    { key: "paidRerollPrice", type: "range", label: "Prix de la première relance", help: "Le prix double après chaque achat pendant le même tour.", min: 5, max: 1000000, step: 5, defaultValue: 25 },
    { key: "paidRerollsPerTurn", type: "range", label: "Achats maximum par tour", help: "Limite le nombre de relances payantes; de 0 à 5.", min: 0, max: 5, defaultValue: 2 }
  ],
  "cul-de-chouette": [
    { key: "rounds", type: "range", label: "Nombre de manches", help: "Chaque joueur joue une fois par manche; le meilleur cumul l’emporte.", min: 1, max: 20, defaultValue: 10 },
    { key: "rollsPerTurn", type: "range", label: "Lancers par tour", help: "Entre 1 et 5 tentatives pour construire sa figure.", min: 1, max: 5, defaultValue: 3 }
  ],
  blackjack: [
    { key: "minimumBet", type: "range", label: "Mise minimale", help: "Montant minimal à engager pour recevoir sa main.", min: 1, max: 100000000, step: 1, defaultValue: 50 },
    { key: "maximumBet", type: "range", label: "Mise maximale", help: "Plafond autorisé pour la mise initiale d’une main.", min: 1, max: 100000000, step: 1, defaultValue: 100 },
    { key: "dealerMode", type: "select", label: "Politique du croupier", help: "Choisis la règle qui détermine quand le croupier s'arrête.", defaultValue: "challenge-best", options: [["challenge-best", "Challenger", "Tente de battre la meilleure main encore en jeu."], ["classic-17", "Classique · 17", "S'arrête dès que sa main atteint 17 points."]] }
  ],
  president: [{ key: "revolutionEnabled", type: "toggle", label: "Révolution sur un carré", enabledLabel: "Un carré inverse l’ordre des cartes", disabledLabel: "L’ordre des cartes reste classique", help: "Inverse l'ordre des cartes jusqu'au prochain carré.", defaultValue: true }],
  farkle: [
    { key: "targetScore", type: "range", label: "Objectif de points", help: "Score à atteindre pour remporter la table.", min: 3000, max: 20000, step: 1000, defaultValue: 10000 },
    { key: "entryScore", type: "range", label: "Seuil d’entrée", help: "Points à encaisser en un tour avant de commencer à conserver son score.", min: 0, max: 1000, step: 100, defaultValue: 500 }
  ],
  "liars-dice": [{ key: "startingDice", type: "range", label: "Dés de départ", help: "Nombre de dés cachés confiés à chaque joueur.", min: 3, max: 8, defaultValue: 5 }],
  "shut-the-box": [{ key: "maxTile", type: "range", label: "Dernière tuile", help: "Joue avec les tuiles 1–9, jusqu'à 1–12.", min: 9, max: 12, defaultValue: 9 }],
  "golf-solitaire": [{ key: "wrapRanks", type: "toggle", label: "Boucle Roi–As", enabledLabel: "Roi et As sont consécutifs", disabledLabel: "Roi et As restent séparés", help: "Autorise le Roi sur l'As et l'As sur le Roi.", defaultValue: false }],
  accordion: [
    { key: "allowOneApart", type: "toggle", label: "Voisine immédiate", enabledLabel: "Déplacement vers la pile voisine autorisé", disabledLabel: "Déplacement voisin interdit", help: "Autorise un déplacement d'une pile vers la gauche.", defaultValue: true },
    { key: "allowThreeApart", type: "toggle", label: "Trois piles plus loin", enabledLabel: "Déplacement de trois piles autorisé", disabledLabel: "Déplacement de trois piles interdit", help: "Autorise le déplacement classique de trois piles vers la gauche.", defaultValue: true }
  ],
  "midnight-dice": [
    { key: "rounds", type: "range", label: "Nombre de manches", help: "Chaque manche comporte trois choix de dés par joueur.", min: 3, max: 8, defaultValue: 5 },
    { key: "marketExtra", type: "range", label: "Dés supplémentaires", help: "Ajoute des options au marché; les dés restants seront écartés.", min: 0, max: 6, defaultValue: 2 },
    { key: "discardsPerRound", type: "range", label: "Défausses tactiques", help: "Nombre de dés qu'un joueur peut remplacer dans le marché à chaque manche.", min: 0, max: 3, defaultValue: 1 },
    { key: "individualContracts", type: "toggle", label: "Mandats individuels", enabledLabel: "Quatre mandats aléatoires propres à chaque joueur", disabledLabel: "Quatre mandats communs à toute la table", help: "Chaque joueur reçoit sa propre sélection secrète. Les sélections peuvent partager des mandats mais ne sont pas identiques. Elles sont renouvelées toutes les quatre manches.", defaultValue: true },
    { key: "uniqueContracts", type: "toggle", label: "Rotation des mandats", enabledLabel: "Mandats sans répétition avant rotation", disabledLabel: "Mandats à nouveau disponibles immédiatement", help: "Interdit de reprendre un mandat avant d'avoir essayé les quatre.", defaultValue: true }
  ],
  "velvet-ruse": [
    { key: "targetPrestige", type: "range", label: "Prestige à atteindre", help: "La partie s'arrête dès qu'un joueur atteint ce total.", min: 10, max: 50, step: 5, defaultValue: 20 },
    { key: "handSize", type: "range", label: "Cartes en main", help: "Taille de la main conservée après chaque cycle de pioche et de jeu.", min: 3, max: 7, defaultValue: 5 },
    { key: "dossierSize", type: "range", label: "Taille du dossier", help: "Nombre de déclarations acceptées avant l'audit automatique.", min: 3, max: 12, defaultValue: 6 },
    { key: "claimRule", type: "select", label: "Règle de déclaration", help: "Condition que la carte annoncée doit respecter par rapport à la carte d'influence.", defaultValue: "suit-or-rank", options: [["suit-or-rank", "Enseigne ou rang", "La règle la plus flexible pour les déclarations."], ["suit-only", "Enseigne uniquement", "Seule la couleur annoncée doit correspondre."], ["rank-only", "Rang uniquement", "Seule la valeur annoncée doit correspondre."]] },
    { key: "openDiscardDraw", type: "toggle", label: "Récupérer la défausse", enabledLabel: "Pioche publique dans la défausse autorisée", disabledLabel: "Pioche limitée au paquet personnel", help: "Autorise à piocher publiquement la carte supérieure de la défausse.", defaultValue: true }
  ]
};

export function defaultGameModifiers(gameId) {
  return Object.fromEntries((gameModifierDefinitions[gameId] ?? []).map((field) => [field.key, field.defaultValue]));
}

export function payoutRatesForPlayerCount(count) {
  if (count <= 1) return [100];
  if (count === 2) return [70, 30];
  return [60, 30, 10];
}

export const suits = {
  S: { symbol: "♠", name: "Pique", red: false },
  H: { symbol: "♥", name: "Coeur", red: true },
  D: { symbol: "♦", name: "Carreau", red: true },
  C: { symbol: "♣", name: "Trèfle", red: false }
};

export function playerName(players = [], id) {
  return players.find((player) => player.id === id)?.pseudo ?? "Joueur";
}

const gameTitles = {
  belote: "Belote",
  yahtzee: "Yahtzee", "421": "421", "cul-de-chouette": "Cul de Chouette", blackjack: "Blackjack",
  "texas-holdem": "Texas Hold'em", bataille: "Bataille", president: "Président", farkle: "Farkle",
  "liars-dice": "Liar's Dice", "shut-the-box": "Shut the Box", "golf-solitaire": "Golf Solitaire",
  accordion: "Accordion", "midnight-dice": "Dés de Minuit", "velvet-ruse": "Velours Noir"
};

export function gameTitle(id) {
  return gameTitles[id] ?? id;
}
