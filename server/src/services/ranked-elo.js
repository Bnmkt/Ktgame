export const ELO_FORMATS = ["auto", "duel", "ranking", "winner-all", "teams"];
export const ELO_EXIT_POLICIES = ["rank", "penalty", "cancel"];
export const DEFAULT_PROVISIONAL = [{ through: 10, k: 48 }, { through: 25, k: 40 }];

function number(value, fallback, minimum, maximum, integer = false) {
  const result = Number(value ?? fallback);
  if (!Number.isFinite(result) || result < minimum || result > maximum || (integer && !Number.isSafeInteger(result))) throw new Error("Paramètre Elo invalide.");
  return result;
}
function choice(value, fallback, values) {
  const result = value ?? fallback;
  if (!values.includes(result)) throw new Error("Méthode de calcul Elo invalide.");
  return result;
}
export function normalizeEloConfig(input = {}) {
  const initialElo = number(input.initialElo, 1000, 100, 5000, true);
  const provisional = input.provisional ?? DEFAULT_PROVISIONAL;
  if (!Array.isArray(provisional) || provisional.length > 10) throw new Error("Définis au maximum dix paliers provisoires.");
  const tiers = provisional.map((row) => ({ through: number(row.through, 0, 1, 1000, true), k: number(row.k, 48, 1, 128) }));
  if (tiers.some((row, index) => index && row.through <= tiers[index - 1].through)) throw new Error("Les seuils provisoires doivent être strictement croissants.");
  return {
    initialElo, k: number(input.k, 32, 1, 128), d: number(input.d, 400, 1, 10000), gamma: number(input.gamma, .75, 0, 2),
    placementGames: number(input.placementGames, 5, 0, 25, true),
    calculation: choice(input.calculation, "auto", ELO_FORMATS), provisional: tiers,
    maximumVariation: input.maximumVariation == null || input.maximumVariation === "" ? null : number(input.maximumVariation, null, .01, 10000),
    minimumElo: input.minimumElo == null || input.minimumElo === "" ? null : number(input.minimumElo, null, 0, initialElo),
    ties: choice(input.ties, "draw", ["draw", "ignore"]),
    abandonPolicy: choice(input.abandonPolicy, "penalty", ELO_EXIT_POLICIES),
    disconnectPolicy: choice(input.disconnectPolicy, "penalty", ELO_EXIT_POLICIES),
    abandonPenalty: number(input.abandonPenalty, 20, 0, 500, true), afkPenalty: number(input.afkPenalty, 15, 0, 500, true)
  };
}
export function coefficientFor(games, rules) {
  return rules.provisional.find((tier) => games + 1 <= tier.through)?.k ?? rules.k;
}
export function expectedScore(own, opponent, d = 400) {
  return 1 / (1 + 10 ** ((opponent - own) / d));
}

// Round the conserved pool once, rather than independently rounding each player.
function conservedCents(rows, values) {
  const scaled = values.map((value) => value * 100);
  const cents = scaled.map((value) => Math.floor(value + 1e-9));
  const remainder = -cents.reduce((sum, value) => sum + value, 0);
  const order = rows.map((row, index) => ({ index, id: row.id, fraction: scaled[index] - cents[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id));
  for (let i = 0; i < remainder; i++) cents[order[i % order.length].index]++;
  return cents;
}

export function calculateElo(participants, input = {}, gameId = "") {
  const rules = normalizeEloConfig(input);
  if (!Array.isArray(participants) || participants.length < 2 || participants.length > 100 || new Set(participants.map((row) => row.id)).size !== participants.length || participants.some((row) => typeof row.id !== "string" || !Number.isFinite(row.elo) || Math.abs(row.elo) > 10000000 || !Number.isSafeInteger(row.position) || row.position < 1 || !Number.isSafeInteger(row.games ?? 0) || (row.games ?? 0) < 0)) throw new Error("Résultat classé invalide.");
  const format = rules.calculation === "auto" ? gameId === "belote" ? "teams" : "ranking" : rules.calculation;
  if (format === "duel" && participants.length !== 2) throw new Error("Le calcul duel nécessite deux joueurs.");
  const rows = participants.map((row) => ({ ...row, k: coefficientFor(row.games ?? 0, rules), penalty: 0 }));
  const teams = new Map();
  if (format === "teams") {
    for (const row of rows) {
      if (row.team == null || !["string", "number"].includes(typeof row.team)) throw new Error("Équipe manquante.");
      const group = teams.get(row.team) ?? [];
      group.push(row); teams.set(row.team, group);
    }
    if (teams.size < 2 || [...teams.values()].some((group) => group.some((row) => row.position !== group[0].position))) throw new Error("Classement d’équipe incohérent.");
  }
  const teamRating = (team) => teams.get(team).reduce((sum, row) => sum + row.elo, 0) / teams.get(team).length;
  const policies = rows.map((row) => row.reason && row.reason !== "result" ? row.reason === "disconnect" ? rules.disconnectPolicy : rules.abandonPolicy : null);
  const cancelled = policies.includes("cancel");
  const deltas = rows.map(() => 0);
  const expected = rows.map(() => 0), comparisons = rows.map(() => 0);
  const divisor = (rows.length - 1) ** rules.gamma;
  const winnerPosition = Math.min(...rows.map((row) => row.position));
  if (!cancelled) for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (format === "teams" && a.team === b.team) continue;
    const left = format === "winner-all" ? Number(a.position !== winnerPosition) : a.position;
    const right = format === "winner-all" ? Number(b.position !== winnerPosition) : b.position;
    if (left === right && rules.ties === "ignore") continue;
    const actual = left < right ? 1 : left > right ? 0 : .5;
    const expectation = expectedScore(format === "teams" ? teamRating(a.team) : a.elo, format === "teams" ? teamRating(b.team) : b.elo, rules.d);
    const transfer = ((a.k + b.k) / 2) / divisor * (actual - expectation);
    deltas[i] += transfer; deltas[j] -= transfer;
    expected[i] += expectation; expected[j] += 1 - expectation;
    comparisons[i]++; comparisons[j]++;
  }
  if (!cancelled) rows.forEach((row, index) => {
    if (policies[index] !== "penalty") return;
    const recipients = rows.map((other, i) => i).filter((i) => !policies[i] && (format !== "teams" || rows[i].team !== row.team));
    if (!recipients.length) return;
    row.penalty = row.reason === "afk" ? rules.afkPenalty : rules.abandonPenalty;
    deltas[index] -= row.penalty;
    for (const i of recipients) deltas[i] += row.penalty / recipients.length;
  });
  let scale = 1;
  rows.forEach((row, index) => {
    const delta = deltas[index];
    if (rules.maximumVariation != null && delta) scale = Math.min(scale, Math.floor(rules.maximumVariation * 100) / 100 / Math.abs(delta));
    // Existing ratings below a newly configured floor are not artificially promoted.
    if (!row.placementPending && rules.minimumElo != null && delta < 0) scale = Math.min(scale, Math.max(0, row.elo - Math.min(row.elo, Math.ceil(rules.minimumElo * 100) / 100)) / -delta);
  });
  const cents = conservedCents(rows, deltas.map((value) => value * scale));
  const averageElo = rows.reduce((sum, row) => sum + row.elo, 0) / rows.length;
  return rows.map((row, index) => ({ ...row, delta: cents[index] / 100, after: Math.round((row.elo + cents[index] / 100) * 100) / 100,
    penalty: cancelled ? 0 : Math.round(row.penalty * scale * 100) / 100,
    expected: comparisons[index] ? expected[index] / comparisons[index] : null,
    playerCount: rows.length, averageElo, format, scale, cancelled }));
}
