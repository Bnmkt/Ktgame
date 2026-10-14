const lowScoreGames = new Set(["shut-the-box", "golf-solitaire", "accordion"]);

export function classicResults(room) {
  const state = room?.state;
  if (!state?.finished || room.ranked) return [];
  const players = state.players ?? [];
  const ranking = state.ranking?.length ? state.ranking : players;
  let previous;
  return ranking.map((entry, index) => {
    const player = { ...entry, ...players.find((row) => row.id === entry.id), ...room.players?.find((row) => row.id === entry.id) };
    const winner = state.winners?.includes(entry.id) ?? false;
    const raw = Number(entry.score ?? state.scores?.[entry.id] ?? 0);
    // The server sorts lower-is-better games with negative scores, and President
    // with an internal ordering weight. Neither is a player-facing score.
    let score = lowScoreGames.has(state.gameId) ? Math.abs(raw) : raw;
    let unit = "points";
    if (state.gameId === "president") { score = index + 1; unit = "Place"; }
    if (state.gameId === "bataille") unit = "cartes";
    if (state.gameId === "liars-dice") unit = "dés";
    if (state.gameId === "accordion") unit = "piles restantes";
    if (state.gameId === "golf-solitaire") unit = "cartes restantes";
    if (state.gameId === "texas-holdem") unit = "Tapis final";
    if (state.gameId === "blackjack") score = Math.abs(raw);
    const recovered = state.gameId === "texas-holdem"
      ? Number(state.departedPayouts?.[entry.id] ?? state.roomPayouts?.[entry.id] ?? 0)
      : Number(state.payouts?.[entry.id] ?? 0) + Number(state.roomPayouts?.[entry.id] ?? 0);
    const rerollsKnown = state.gameId !== "421" || !state.modifiers?.paidRerollsEnabled || state.paidRerollSpent !== undefined;
    const spent = Number(room.stake ?? 0) + (state.gameId === "blackjack" ? Number(state.bets?.[entry.id] ?? 0) : 0) + Number(state.paidRerollSpent?.[entry.id] ?? 0);
    const tied = state.gameId !== "president" && previous?.raw === raw && previous.winner === winner;
    const rank = tied ? previous.rank : index + 1;
    previous = { raw, winner, rank };
    const push = state.gameId === "blackjack" && !state.foldedPlayerIds?.includes(entry.id) && Number(state.bets?.[entry.id]) > 0 && Number(state.payouts?.[entry.id]) === Number(state.bets[entry.id]);
    return { ...player, rank, score, unit, winner, push, recovered, spent,
      net: player.isBot || !rerollsKnown ? null : recovered - spent };
  });
}
