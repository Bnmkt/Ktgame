// Opt in one game at a time; common presentation has no server dependencies.
export const tableInterfaceGames = new Set(["farkle", "yahtzee", "cul-de-chouette", "texas-holdem"]);

export function tableRoundInfo(state) {
  if (state.gameId === "yahtzee") {
    const completed = Object.values(state.scores ?? {}).reduce((sum, scores) => sum + Object.keys(scores).length, 0);
    return { label: "Manche", value: `${Math.min(13, Math.floor(completed / Math.max(1, state.players.length)) + 1)} / 13` };
  }
  if (state.gameId === "texas-holdem") return { label: "Main", value: String(state.handNumber ?? 1) };
  if (state.maxRounds) return { label: "Manche", value: `${state.round} / ${state.maxRounds}` };
  return { label: "Objectif", value: `${state.target ?? 10000} pts` };
}

export function pokerSeatPosition(index, count, selfIndex) {
  // Keep the local seat at the bottom. Spectators see the original seat order.
  const relative = (index - Math.max(0, selfIndex) + count) % count;
  const angle = relative * Math.PI * 2 / Math.max(1, count);
  return { "--table-seat-x": `${50 + Math.sin(angle) * 40}%`, "--table-seat-y": `${50 + Math.cos(angle) * 39}%` };
}
