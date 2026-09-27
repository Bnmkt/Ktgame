function integerOption(modifiers, key, fallback, min, max) {
  const parsed = Number(modifiers[key]);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function normalizeBattleModifiers(modifiers = {}) {
  return {
    pileMode: modifiers.pileMode === "single" ? "single" : "double",
    scoringMode: ["high-card", "pile-sum", "poker-combo"].includes(modifiers.scoringMode) ? modifiers.scoringMode : "high-card",
    hiddenDeck: modifiers.hiddenDeck === true,
    returnAfterRounds: Math.max(3, Math.min(20, Math.floor(Number(modifiers.returnAfterRounds) || 3)))
  };
}

export function normalizeGameModifiers(gameId, modifiers = {}) {
  const integer = (key, fallback, min, max) => integerOption(modifiers, key, fallback, min, max);
  if (gameId === "belote") return { frenchRules: modifiers.frenchRules === true, announcements: modifiers.announcements !== false, targetScore: integer("targetScore", 101, 21, 501) };

  if (gameId === "yahtzee") return { rollsPerTurn: integer("rollsPerTurn", 3, 1, 5) };
  if (gameId === "cul-de-chouette") return {
    rollsPerTurn: integer("rollsPerTurn", 3, 1, 5),
    rounds: integer("rounds", 10, 1, 20)
  };
  if (gameId === "421") return {
    rollsPerTurn: integer("rollsPerTurn", 3, 1, 5),
    rounds: integer("rounds", 5, 1, 20),
    paidRerollsEnabled: modifiers.paidRerollsEnabled !== false,
    paidRerollPrice: integer("paidRerollPrice", 25, 1, 1000000),
    paidRerollsPerTurn: integer("paidRerollsPerTurn", 2, 0, 5)
  };
  if (gameId === "blackjack") {
    const minimumBet = integer("minimumBet", 50, 1, 100000000);
    return {
      dealerMode: modifiers.dealerMode === "classic-17" ? "classic-17" : "challenge-best",
      minimumBet,
      maximumBet: Math.max(minimumBet, integer("maximumBet", 100, 1, 100000000))
    };
  }
  if (gameId === "president") return { revolutionEnabled: modifiers.revolutionEnabled !== false };
  if (gameId === "farkle") return {
    targetScore: integer("targetScore", 10000, 3000, 20000),
    entryScore: integer("entryScore", 500, 0, 1000)
  };
  if (gameId === "liars-dice") return { startingDice: integer("startingDice", 5, 3, 8) };
  if (gameId === "shut-the-box") return { maxTile: integer("maxTile", 9, 9, 12) };
  if (gameId === "golf-solitaire") return { wrapRanks: modifiers.wrapRanks === true };
  if (gameId === "accordion") {
    const allowOneApart = modifiers.allowOneApart !== false;
    const allowThreeApart = modifiers.allowThreeApart !== false;
    return { allowOneApart: allowOneApart || !allowThreeApart, allowThreeApart };
  }
  if (gameId === "midnight-dice") return {
    rounds: integer("rounds", 5, 3, 8),
    marketExtra: integer("marketExtra", 2, 0, 6),
    discardsPerRound: integer("discardsPerRound", 1, 0, 3),
    uniqueContracts: modifiers.uniqueContracts !== false
  };
  if (gameId === "velvet-ruse") return {
    targetPrestige: integer("targetPrestige", 20, 10, 50),
    handSize: integer("handSize", 5, 3, 7),
    dossierSize: integer("dossierSize", 6, 3, 12),
    claimRule: ["suit-or-rank", "suit-only", "rank-only"].includes(modifiers.claimRule) ? modifiers.claimRule : "suit-or-rank",
    openDiscardDraw: modifiers.openDiscardDraw !== false
  };
  return {};
}
