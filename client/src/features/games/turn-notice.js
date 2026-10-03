export function playerActionExpected(room, userId) {
  const state = room?.state;
  if (!state || room.spectator || room.finished || !room.players?.some((player) => player.id === userId && !player.isBot) || room.pacing || state.finished || state.nextHandAt || state.finishedOrder?.includes(userId)) return false;
  if (state.gameId === "blackjack") {
    if (!state.bets?.[userId]) return true;
    return Object.keys(state.bets ?? {}).length >= state.players.filter((player) => !player.isBot).length && !state.completedPlayerIds?.includes(userId);
  }
  if (state.gameId === "bataille") return !state.resolutionEndsAt && !state.submittedPlayerIds?.includes(userId);
  if (["golf-solitaire", "accordion"].includes(state.gameId)) return state.players[0]?.id === userId;
  if (state.gameId === "texas-holdem" && (state.foldedPlayerIds?.includes(userId) || state.allInPlayerIds?.includes(userId))) return false;
  return state.players?.[state.currentPlayerIndex]?.id === userId;
}

export function turnSoundKey(state) {
  if (state?.gameId === "texas-holdem") return `${state.handNumber}:${state.street}:${state.turnStartedAt}`;
  if (state?.gameId === "yahtzee") return Object.values(state.scores ?? {}).reduce((sum, scores) => sum + Object.keys(scores).length, 0);
  return `${state?.round ?? ""}:${state?.gameId === "midnight-dice" ? state.phase : ""}`;
}
