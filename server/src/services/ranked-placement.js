import { expectedScore } from "./ranked-elo.js";

export const UNRANKED = { id: "unranked", name: "Non classé", division: "", label: "Non classé", insignia: "circle-dashed", insigniaImage: "", order: null };

export function placementStatus(rating, config) {
  const required = config.placementGames ?? 5;
  const completed = !required || rating.placement?.completed === true || !rating.placement && rating.games >= required;
  return { completed, games: completed ? required : Math.min(required, rating.placement?.games ?? 0), required };
}

export function placementElo(evidence, config) {
  if (!evidence.games) return config.initialElo;
  const ratio = (evidence.score + 0.5) / (evidence.games + 1);
  const estimate = evidence.opponentElo / evidence.games + config.d * Math.log10(ratio / (1 - ratio));
  return Math.round(Math.max(config.minimumElo ?? -10000000, Math.min(10000000, estimate)) * 100) / 100;
}

// Each match has equal weight, regardless of its number of opponents.
export function placementEvidence(player, participants, format, config) {
  const opponents = participants.filter((row) => row.id !== player.id && (format !== "teams" || row.team !== player.team));
  const winner = Math.min(...participants.map((row) => row.position));
  const position = (row) => format === "winner-all" ? Number(row.position !== winner) : row.position;
  const score = player.reason !== "result" ? 0 : opponents.reduce((sum, row) => sum + (position(player) < position(row) ? 1 : position(player) > position(row) ? 0 : 0.5), 0) / opponents.length;
  const opponentElo = opponents.reduce((sum, row) => sum + row.elo, 0) / opponents.length;
  const ownElo = format === "teams" ? participants.filter((row) => row.team === player.team).reduce((sum, row, _, team) => sum + row.elo / team.length, 0) : player.elo;
  return { score, opponentElo, expected: expectedScore(ownElo, opponentElo, config.d) };
}

export function recordPlacement(previous, evidence, config) {
  const placement = { games: 0, score: 0, opponentElo: 0, wins: 0, losses: 0, draws: 0, ...previous };
  placement.games++;
  placement.score += evidence.score;
  placement.opponentElo += evidence.opponentElo;
  placement.wins += Number(evidence.score > 0.5);
  placement.losses += Number(evidence.score < 0.5);
  placement.draws += Number(evidence.score === 0.5);
  placement.completed = placement.games >= (config.placementGames ?? 5);
  return placement;
}
