export const scoredDiceGames = new Set(["421", "cul-de-chouette", "farkle", "yahtzee", "midnight-dice"]);

export function diceScoreRows(state, userId, total = (score) => Number(score) || 0) {
  if (!state || !scoredDiceGames.has(state.gameId)) return [];
  const currentId = state.finished ? null : state.players[state.currentPlayerIndex]?.id;
  return state.players.map((player) => {
    const current = player.id === currentId;
    let pending = 0;
    if (current && state.gameId === "farkle" && !state.bust) pending = state.turnScore ?? 0;
    if (current && state.gameId === "421") pending = state.currentCombination?.rank ?? 0;
    if (current && state.gameId === "cul-de-chouette" && state.lastRoll?.pending && state.lastRoll.playerId === player.id) pending = state.lastRoll.points ?? 0;
    return { player, score: total(state.scores?.[player.id]), pending, current, self: player.id === userId };
  }).sort((left, right) => right.score - left.score);
}
