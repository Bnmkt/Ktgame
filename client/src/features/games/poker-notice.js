export function pokerAllInDecision(state, userId, expected) {
  if (state?.gameId !== "texas-holdem" || !expected || state.finished || state.nextHandAt || state.foldedPlayerIds?.includes(userId) || state.allInPlayerIds?.includes(userId)) return null;
  const toCall = Math.max(0, state.currentBet - (state.streetBets?.[userId] ?? 0));
  if (!toCall) return null;
  const opponents = state.players.filter((player) => player.id !== userId && state.allInPlayerIds?.includes(player.id) && (state.streetBets?.[player.id] ?? 0) === state.currentBet);
  if (!opponents.length) return null;
  return { key: `${state.handNumber}:${state.street}:${state.turnStartedAt}:${state.currentBet}:${opponents.map((player) => player.id).join(",")}`, opponents, amount: Math.min(toCall, state.stacks?.[userId] ?? 0), ownAllIn: toCall >= (state.stacks?.[userId] ?? 0) };
}
