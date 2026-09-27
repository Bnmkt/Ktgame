import { casinoDateKey, shiftDateKey } from "./time.js";
import { Archive } from "../storage/archives.js";
import { bestScore, lowerScores } from "./leaderboard-score.js";
import { prepared } from "../storage/statements.js";

const scoreLabels = { president: "Place finale", "texas-holdem": "Tapis final", bataille: "Cartes restantes", "liars-dice": "Des restants", "shut-the-box": "Points restants", "golf-solitaire": "Cartes restantes", accordion: "Piles restantes" };
const seasonFor = (day) => `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function leaderboardPeriod(query, now = new Date()) {
  const today = casinoDateKey(now), currentSeason = seasonFor(today);
  const period = query.period ?? "season";
  if (!["all", "day", "season"].includes(period)) throw new Error("Periode invalide.");
  if (period === "all") return { period, start: null, end: null, today, currentSeason, label: "Depuis le debut" };
  if (period === "day") {
    const date = query.date || today;
    if (!validDay(date) || date > today) throw new Error("Date invalide.");
    return { period, date, start: date, end: shiftDateKey(date, 1), today, currentSeason, label: date };
  }
  const season = query.season || currentSeason;
  if (!/^\d{4}-Q[1-4]$/.test(season) || season > currentSeason) throw new Error("Saison invalide.");
  const [year, quarter] = season.split("-Q").map(Number);
  const start = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const end = quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
  if (!validDay(start) || !validDay(end)) throw new Error("Saison invalide.");
  return { period, season, start, end, today, currentSeason, label: `T${quarter} ${year}` };
}

export function buildLeaderboard(db, query = {}, viewerId = "", now = new Date(), gameIds = []) {
  const period = leaderboardPeriod(query, now);
  const gameId = query.game || "all", metric = query.metric || "balance";
  if (gameId !== "all" && !gameIds.includes(gameId)) throw new Error("Jeu invalide.");
  if (!["wins", "gains", "record", "score", "balance"].includes(metric)) throw new Error("Classement invalide.");
  if ((metric === "score" && gameId === "all") || (metric === "balance" && gameId !== "all")) throw new Error("Ce classement ne correspond pas au jeu selectionne.");
  const eligible = new Map(db.users.filter((user) => !user.guest && !user.isBot && user.active !== false).map((user) => [user.id, user]));
  const stats = new Map(), seasons = new Set([period.currentSeason]);
  if (period.season) seasons.add(period.season);
  const inPeriod = (day) => day && (!period.start || day >= period.start) && (!period.end || day < period.end) && day <= period.today;
  const get = (id) => {
    if (!stats.has(id)) stats.set(id, { id, games: 0, wins: 0, gains: 0, record: 0, score: null, achievedAt: null });
    return stats.get(id);
  };
  const indexed = db.history instanceof Archive && db.transactions instanceof Archive;
  const clauses = ["m.day <> ''", "m.day <= ?", "m.is_bot = 0", "m.player_order >= 0"], params = [period.today];
  if (period.start) { clauses.push("m.day >= ?"); params.push(period.start); }
  if (period.end) { clauses.push("m.day < ?"); params.push(period.end); }
  if (gameId !== "all") { clauses.push("m.game_id = ?"); params.push(gameId); }
  const where = clauses.join(" AND ");
  if (indexed) {
    const sql = db.history.sqlite;
    for (const row of prepared(sql, `SELECT user_id AS id, count(*) AS games, sum(won) AS wins, sum(gain) AS gains, max(gain) AS record, ${gameId === "all" ? "NULL" : `${lowerScores.has(gameId) ? "min" : "max"}(score)`} AS score FROM history_members m WHERE ${where} GROUP BY user_id`).iterate(...params)) {
      if (eligible.has(row.id)) stats.set(row.id, { ...row, achievedAt: null });
    }
    for (const row of prepared(sql, "SELECT DISTINCT day FROM history WHERE day <> '' AND day <= ? UNION SELECT DISTINCT day FROM transactions WHERE day <> '' AND day <= ?").iterate(period.today, period.today)) seasons.add(seasonFor(row.day));
  }
  const seenMatches = new Set();
  for (const match of indexed ? db.history.pending : db.history) {
    if (match.id && seenMatches.has(match.id)) continue;
    if (match.id) seenMatches.add(match.id);
    const day = casinoDateKey(match.finishedAt);
    if (day && day <= period.today) seasons.add(seasonFor(day));
    if (!inPeriod(day) || (gameId !== "all" && match.gameId !== gameId)) continue;
    const ids = new Set((match.players ?? []).filter((player) => !player.isBot).map((player) => player.id));
    for (const id of ids) {
      if (!eligible.has(id)) continue;
      const row = get(id);
      row.games++;
      if (match.winners?.includes(id)) row.wins++;
      const gain = Math.max(0, finite(match.payouts?.[id]) ? match.payouts[id] : 0) + Math.max(0, finite(match.blackjackPayouts?.[id]) ? match.blackjackPayouts[id] : 0);
      row.gains += gain;
      if (gain > row.record) { row.record = gain; if (metric === "record") row.achievedAt = match.finishedAt; }
      const score = gameId === "all" ? null : bestScore(match, id);
      if (score !== null && (row.score === null || (lowerScores.has(gameId) ? score < row.score : score > row.score))) {
        row.score = score;
        if (metric === "score") row.achievedAt = match.finishedAt;
      }
    }
  }
  const balances = new Map();
  const closed = period.end && period.end <= period.today;
  if (indexed && metric === "balance" && closed) {
    const statement = db.transactions.sqlite.prepare("SELECT balance, created_at AS createdAt FROM transactions WHERE user_id = ? AND day <> '' AND day < ? AND balance IS NOT NULL ORDER BY julianday(created_at) DESC, rowid DESC LIMIT 1");
    for (const id of eligible.keys()) {
      const transaction = statement.get(id, period.end);
      if (transaction) balances.set(id, transaction);
    }
  }
  for (const transaction of indexed ? db.transactions.pending : db.transactions) {
    const day = casinoDateKey(transaction.createdAt);
    if (day && day <= period.today) seasons.add(seasonFor(day));
    if (metric !== "balance" || !closed || !day || day >= period.end || !finite(transaction.balance)) continue;
    const previous = balances.get(transaction.userId);
    if (!previous || Date.parse(transaction.createdAt) >= Date.parse(previous.createdAt)) balances.set(transaction.userId, transaction);
  }
  if (metric === "balance") for (const user of eligible.values()) {
    const created = casinoDateKey(user.createdAt);
    if (created && period.end && created >= period.end) continue;
    const value = closed ? balances.get(user.id)?.balance : user.tokens;
    if (finite(value)) get(user.id).balance = value;
  }
  const ascending = metric === "score" && lowerScores.has(gameId);
  const rows = [...stats.values()].filter((row) => finite(row[metric]) && (["balance", "score"].includes(metric) || row[metric] > 0))
    .sort((left, right) => (ascending ? left[metric] - right[metric] : right[metric] - left[metric]) || left.id.localeCompare(right.id));
  let rank = 0, previous;
  const ranked = rows.map((row, index) => {
    if (row[metric] !== previous) rank = index + 1;
    previous = row[metric];
    return { ...row, rank, value: row[metric] };
  });
  if (indexed && ["score", "record"].includes(metric)) {
    const statement = db.history.sqlite.prepare(`SELECT h.finished_at FROM history_members m JOIN history h ON h.id = m.history_id WHERE ${where} AND m.user_id = ? AND m.${metric === "score" ? "score" : "gain"} = ? ORDER BY h.rowid LIMIT 1`);
    for (const row of ranked.filter((entry, index) => index < 100 || entry.id === viewerId)) {
      if (!row.achievedAt) row.achievedAt = statement.get(...params, row.id, row[metric])?.finished_at ?? null;
    }
  }
  return {
    gameId, metric, period, ascending, scoreLabel: scoreLabels[gameId] ?? "Points", total: ranked.length,
    seasons: [...seasons].sort().reverse(), rows: ranked.slice(0, 100), self: ranked.find((row) => row.id === viewerId) ?? null,
    generatedAt: now.toISOString(), balanceAt: closed ? shiftDateKey(period.end, -1) : period.today
  };
}
