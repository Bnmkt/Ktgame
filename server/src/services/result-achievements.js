import { blackjackTotal } from "../games/engines/blackjack.js";
import { MIDNIGHT_CONTRACTS } from "../games/engines/midnight-dice.js";
import { totalYahtzee, YAHTZEE_CATEGORIES } from "../games/engines/yahtzee.js";

export const MIDNIGHT_CONTRACT_RESULT_PREFIX = "midnight-contract-completed:";

export function midnightContractResultId(contract) {
  return `${MIDNIGHT_CONTRACT_RESULT_PREFIX}${contract}`;
}

export function completedMidnightContractCount(resultIds = []) {
  const ids = new Set(resultIds);
  return MIDNIGHT_CONTRACTS.filter((contract) => ids.has(midnightContractResultId(contract))).length;
}

export function gameResultAchievementIds(state, playerId) {
  if (!state || !playerId) return [];
  const ids = new Set();

  if (state.gameId === "yahtzee") {
    const scores = state.scores?.[playerId] ?? {};
    if ((scores.yahtzee ?? 0) > 0) ids.add("yahtzee-first-yahtzee");
    if ((scores["large-straight"] ?? 0) > 0) ids.add("yahtzee-large-straight");
    if ((scores["full-house"] ?? 0) > 0) ids.add("yahtzee-full-house");
    const upper = YAHTZEE_CATEGORIES.slice(0, 6).reduce((sum, key) => sum + (scores[key] ?? 0), 0);
    if (upper >= 63) ids.add("yahtzee-upper-bonus");
    const total = totalYahtzee(scores);
    if (total >= 250) ids.add("yahtzee-score-250");
    if (total >= 300) ids.add("yahtzee-score-300");
    if (total >= 375) ids.add("yahtzee-perfect");
    const values = Object.values(scores);
    if (values.filter((score) => score === 0).length >= 3) ids.add("yahtzee-three-zeroes");
    if (values.length === YAHTZEE_CATEGORIES.length && values.every((score) => score > 0)) ids.add("yahtzee-clean-card");
  }

  if (state.gameId === "blackjack") {
    const hand = state.hands?.[playerId] ?? [];
    const total = blackjackTotal(hand);
    const dealerTotal = blackjackTotal(state.dealer ?? []);
    const folded = state.foldedPlayerIds?.includes(playerId);
    if (total === 21) ids.add("blackjack-21");
    if (total === 21 && hand.length === 2) ids.add("blackjack-natural");
    if ((state.winners ?? []).includes(playerId) && dealerTotal > 21) ids.add("blackjack-dealer-bust");
    if (!folded && total === 21 && dealerTotal === 21 && state.payouts?.[playerId] === state.bets?.[playerId]) ids.add("blackjack-push");
    if (!folded && hand.length >= 5 && total <= 21) ids.add("blackjack-five-card-hand");
  }

  if (state.gameId === "farkle") {
    const logs = (state.logs ?? []).filter((log) => log.actorId === playerId);
    if (logs.some((log) => log.text?.includes("Suite 1-6"))) ids.add("farkle-straight");
    if ((state.stats?.[playerId]?.hotDiceSelections ?? 0) > 0) ids.add("farkle-hot-dice");
    if (logs.some((log) => log.text?.includes("Trois paires"))) ids.add("farkle-three-pairs");
    if (logs.some((log) => log.text?.includes("Deux brelans"))) ids.add("farkle-two-triplets");
    if ((state.stats?.[playerId]?.maxRollScore ?? 0) >= 1000) ids.add("farkle-roll-1000");
    if ((state.stats?.[playerId]?.maxRollScore ?? 0) >= 3000) ids.add("farkle-roll-3000");
    if ((state.stats?.[playerId]?.maxTurnScore ?? 0) >= 10000) ids.add("farkle-one-shot-10000");
    if ((state.winners ?? []).includes(playerId)) ids.add("farkle-target");
  }

  if (state.gameId === "midnight-dice") {
    const stats = state.stats?.[playerId] ?? {};
    if ((stats.perfectContracts ?? 0) > 0) ids.add("midnight-perfect-contract");
    if ((stats.marketDiscards ?? 0) >= 3) ids.add("midnight-market-shaker");
    if ((stats.contractsAttempted ?? 0) >= (state.modifiers?.rounds ?? 1) && stats.contractsCompleted === stats.contractsAttempted) ids.add("midnight-flawless-contracts");
    for (const contract of stats.completedContractIds ?? []) ids.add(midnightContractResultId(contract));
    if ((stats.completedContractIds ?? []).includes("triple")) ids.add("midnight-diamond-contract");
  }

  return [...ids];
}
