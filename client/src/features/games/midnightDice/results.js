export const midnightVictoryLabels = {
  highest: "Score total", rounds: "Champion des manches", prestige: "Chasseur de prestige",
  consistency: "Régularité", record: "Record de Minuit", bounties: "Chasseur de primes",
  lowest: "Score le plus bas", contracts: "Le plus de mandats réussis"
};
export const midnightVictoryModes = ["highest", "rounds", "prestige", "consistency", "record", "bounties"];

// Older snapshots only contain their last known round. Never fabricate earlier results.
export function midnightRoundHistory(state) {
  const rounds = new Map();
  for (const entry of [...(state.roundHistory ?? []), state.lastRound]) {
    if (entry && Number.isInteger(entry.round) && Array.isArray(entry.results)) rounds.set(entry.round, entry);
  }
  return [...rounds.values()].sort((a, b) => a.round - b.round);
}
export function midnightRoundWinners(round) {
  const best = Math.max(...round.results.map(result => result.points));
  return round.results.filter(result => result.points === best).map(result => result.playerId);
}
export function midnightRankingVector(state, playerId) {
  const criterion = state.resolvedOptions?.victory ?? "highest";
  const rounds = midnightRoundHistory(state), results = rounds.map(round => round.results.find(result => result.playerId === playerId));
  if (criterion === "rounds") return [rounds.filter(round => midnightRoundWinners(round).includes(playerId)).length];
  if (criterion === "prestige") return ["diamond", "platinum", "gold", "silver", "bronze"].map(tier => results.filter(result => result?.achieved && result.tier === tier).length);
  if (criterion === "consistency") return results.map(result => result?.points ?? 0).sort((a, b) => a - b);
  if (criterion === "record") return [Math.max(0, ...results.map(result => result?.points ?? 0))];
  if (criterion === "bounties") return [results.reduce((sum, result) => sum + (result?.achieved ? result.bonus : 0), 0)];
  if (criterion === "contracts") return [state.stats?.[playerId]?.contractsCompleted ?? results.filter(result => result?.achieved).length];
  const points = state.scores?.[playerId] ?? 0;
  return [criterion === "lowest" ? -points : points];
}
// A positive result means the left player ranks ahead. Exact ties stay ties.
export function compareMidnightPlayers(state, leftId, rightId) {
  const left = midnightRankingVector(state, leftId), right = midnightRankingVector(state, rightId);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
export function midnightRankingScore(state, playerId) { return midnightRankingVector(state, playerId)[0] ?? 0; }
