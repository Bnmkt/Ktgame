// Opt in one game at a time; common presentation has no server dependencies.
export const tableInterfaceGames = new Set(["farkle", "yahtzee", "cul-de-chouette", "texas-holdem", "blackjack", "president"]);

export function tableRoundInfo(state) {
  if (state.gameId === "president") return { label: "Phase", value: state.finished ? "Résultat" : state.revolution ? "Révolution active" : state.currentSet ? "Pli en cours" : "Nouvelle ouverture" };
  if (state.gameId === "yahtzee") {
    const completed = Object.values(state.scores ?? {}).reduce((sum, scores) => sum + Object.keys(scores).length, 0);
    return { label: "Manche", value: `${Math.min(13, Math.floor(completed / Math.max(1, state.players.length)) + 1)} / 13` };
  }
  if (state.gameId === "texas-holdem") return { label: "Main", value: String(state.handNumber ?? 1) };
  if (state.gameId === "blackjack") return { label: "Phase", value: state.finished ? "Résultat" : Object.keys(state.bets ?? {}).length < state.players.filter((player) => !player.isBot).length ? "Mises" : "Décisions" };
  if (state.maxRounds) return { label: "Manche", value: `${state.round} / ${state.maxRounds}` };
  return { label: "Objectif", value: `${state.target ?? 10000} pts` };
}

export function pokerSeatPosition(index, count, selfIndex) {
  // Keep the local seat at the bottom. Spectators see the original seat order.
  const relative = (index - Math.max(0, selfIndex) + count) % count;
  if (count >= 8) {
    // Four seats above the community cards, two at the sides, three below.
    // This avoids compressing two tall seats onto the same end of an ellipse.
    const positions = [[50, 87], [74, 87], [92, 50], [74, 12], [58, 12], [42, 12], [26, 12], [8, 50], [26, 87]];
    const [x, y] = positions[relative];
    return { "--table-seat-x": `${x}%`, "--table-seat-y": `${y}%` };
  }
  const angle = relative * Math.PI * 2 / Math.max(1, count);
  return { "--table-seat-x": `${50 + Math.sin(angle) * 40}%`, "--table-seat-y": `${50 + Math.cos(angle) * 39}%` };
}
