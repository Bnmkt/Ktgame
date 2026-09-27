import { publicBeloteState } from "./engines/belote.js";

const fields = {
  yahtzee: ["dice", "kept", "rollsLeft", "scores", "lastDiceByPlayer"],
  "421": ["dice", "kept", "rollsLeft", "scores", "results", "currentCombination", "maxRounds", "lastDiceByPlayer"],
  "cul-de-chouette": ["dice", "kept", "rollsLeft", "scores", "lastRoll", "maxRounds", "lastDiceByPlayer"],
  farkle: ["dice", "turnScore", "remainingDice", "scores", "bust", "lastRoll", "target", "lastDiceByPlayer"],
  "shut-the-box": ["dice", "boxes", "scores", "lastTotal", "lastDiceByPlayer"],
  "liars-dice": ["diceCounts", "bid", "lastBidderId", "lastReveal"],
  "midnight-dice": ["market", "trays", "scores", "contractOffers", "lastRound", "discardTray"],
  "velvet-ruse": ["edict", "prestige", "lastChallenge", "lastAudit"],
  president: ["pile", "currentSet", "passes", "finishedOrder", "revolution"],
  blackjack: ["bets", "completedPlayerIds", "foldedPlayerIds", "shownPlayerIds", "payouts"],
  "texas-holdem": ["community", "pot", "stacks", "street", "streetBets", "currentBet", "handNumber", "foldedPlayerIds", "allInPlayerIds", "shownPlayerIds", "payouts", "dealerIndex", "smallBlindIndex", "bigBlindIndex"],
  bataille: ["cardCounts", "round", "resolutionEndsAt", "submittedPlayerIds"],
  "golf-solitaire": ["tableau", "waste", "score"],
  accordion: ["piles", "score"],
  belote: ["targetScore", "teamScores", "pendingPoints", "dealerIndex", "bidRound", "passes", "turnedCard", "trump", "takerId", "trick", "lastTrick", "trickNumber", "trickCounts", "cardPoints", "belotePoints", "announcementPoints", "announcementsRevealed", "lastRound"]
};
const pick = (source, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, structuredClone(source[key])]));
const visibleCard = (card) => card ? { rank: card.rank, suit: card.suit } : null;
const hiddenHands = (state) => Object.fromEntries(Object.entries(state.hands ?? {}).map(([id, hand]) => [id, Array(hand.length).fill(null)]));

// An explicit public schema prevents new engine fields from becoming spectator data.
export function spectatorState(state) {
  if (!state) return null;
  const result = pick(state, ["gameId", "players", "modifiers", "finished", "winners", "currentPlayerIndex", "round", "phase", "ranking", "roomPayouts", ...(fields[state.gameId] ?? [])]);
  result.hands = hiddenHands(state);
  result.logs = fields[state.gameId] ? (state.logs ?? []).map((log) => {
    const safe = pick(log, ["id", "at", "actorId", "actor", "type", "text"]);
    if (state.gameId === "blackjack" && !["result", "reveal", "dealer"].includes(log.type)) safe.text = log.type === "bet" ? "engage une mise." : "joue sa main.";
    return safe;
  }) : [];
  if (state.gameId === "blackjack") {
    result.dealer = (state.dealer ?? []).map((card, index) => index === 0 || state.finished ? visibleCard(card) : null);
    for (const id of state.shownPlayerIds ?? []) result.hands[id] = (state.hands[id] ?? []).map(visibleCard);
  }
  if (state.gameId === "texas-holdem") for (const id of state.shownPlayerIds ?? []) result.hands[id] = (state.hands[id] ?? []).map(visibleCard);
  if (state.gameId === "belote") result.announcements = publicBeloteState(state, "").announcements;
  if (state.gameId === "bataille") {
    result.battleLanes = (state.battleLanes ?? []).map((lane) => ({ id: lane.id, tie: lane.tie, cards: lane.cards.map((card) => ({ ownerId: card.ownerId, ...(card.revealedToAll ? visibleCard(card) : { hidden: true }) })) }));
    result.cardCounts ??= Object.fromEntries(Object.entries(state.piles ?? {}).map(([id, pile]) => [id, pile.length]));
  }
  if (state.gameId === "velvet-ruse") {
    result.discard = (state.discard ?? []).slice(-1).map(visibleCard);
    result.pendingClaim = state.pendingClaim ? pick(state.pendingClaim, ["playerId", "claim"]) : null;
    result.dossier = (state.dossier ?? []).map((entry) => pick(entry, ["playerId", "claim"]));
  }
  result.stockCount = state.stock?.length ?? state.deck?.length ?? 0;
  return result;
}
