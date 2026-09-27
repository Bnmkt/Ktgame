export const lowerScores = new Set(["shut-the-box", "golf-solitaire", "accordion", "president"]);
const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function bestScore(match, id) {
  if (finite(match.leaderboardScores?.[id])) return match.leaderboardScores[id];
  if (match.gameId === "belote") return null;
  const score = match.ranking?.find((row) => row.id === id)?.score;
  if (!finite(score)) return null;
  if (match.gameId === "president") return score > 0 ? 1001 - score : null;
  if (match.gameId === "blackjack" && score < 0) return null;
  if (lowerScores.has(match.gameId) && score === -999) return null;
  return lowerScores.has(match.gameId) ? (score === 0 ? 0 : -score) : score;
}
