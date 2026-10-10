import { Temporal } from "@js-temporal/polyfill";
import { RANKED_GAMES, RANK_DIVISIONS } from "./ranked.js";
import { casinoDateKey, shiftDateKey, CASINO_TIME_ZONE } from "./time.js";

export function rankedMetricsPeriod(period = "30", now = new Date()) {
  if (!["7", "30", "90", "365", "season", "all"].includes(period)) throw new Error("Période invalide.");
  const end = casinoDateKey(now);
  const start = period === "all" ? null : period === "season"
    ? `${end.slice(0, 4)}-${String(Math.floor((Number(end.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
    : shiftDateKey(end, 1 - Number(period));
  const midnight = (day) => Temporal.PlainDate.from(day).toZonedDateTime(CASINO_TIME_ZONE).toInstant().toString({ fractionalSecondDigits: 3 });
  return { id: period, start, end, from: start ? midnight(start) : "0000", until: midnight(shiftDateKey(end, 1)) };
}

export function queryRankedMetrics(sqlite, config, { gameId = "", period = "30" } = {}, now = new Date()) {
  if (typeof gameId !== "string" || gameId && !RANKED_GAMES.includes(gameId)) throw new Error("Jeu classé introuvable.");
  const range = rankedMetricsPeriod(period, now);
  const ids = gameId ? [gameId] : RANKED_GAMES;
  const placeholders = ids.map(() => "?").join(",");
  const run = (sql, params = ids) => sqlite.prepare(sql).all(...params);
  const placements = `CASE e.game_id ${ids.map((id)=>`WHEN '${id}' THEN ${config.games[id].placementGames}`).join(" ")} END`;
  const population = `WITH population AS (
    SELECT e.* FROM user_game_elo e JOIN users u ON u.id=e.user_id LEFT JOIN user_ranked_placements p ON p.user_id=e.user_id AND p.game_id=e.game_id
    WHERE e.game_id IN (${placeholders}) AND e.games>0 AND u.guest=0
      AND json_extract(u.data,'$.active') IS NOT 0 AND json_extract(u.data,'$.isBot') IS NOT 1
      AND (${placements}=0 OR json_extract(p.data,'$.completed')=1 OR p.data IS NULL AND e.games>=${placements})
  )`;
  const eloFields = `COUNT(*) AS profiles, COUNT(DISTINCT user_id) AS players, AVG(elo) AS averageElo,
    AVG(CASE WHEN rn IN ((total+1)/2,(total+2)/2) THEN elo END) AS medianElo,
    MIN(elo) AS minimumElo, MAX(elo) AS maximumElo`;
  const overall = run(`${population}, ordered AS (SELECT *,ROW_NUMBER() OVER(ORDER BY elo) rn,COUNT(*) OVER() total FROM population) SELECT ${eloFields} FROM ordered`)[0];
  const byGame = run(`${population}, ordered AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY game_id ORDER BY elo) rn,COUNT(*) OVER(PARTITION BY game_id) total FROM population) SELECT game_id AS gameId,${eloFields} FROM ordered GROUP BY game_id`);
  // Bin thresholds mirror rankFor, including its boundary tolerance, without returning player rows.
  const divisions = config.ranks.flatMap((rank, index) => Array.from({ length: rank.divisions }, (_, step) => ({
    id: `${rank.id}-${step}`, rankId: rank.id, name: rank.name,
    division: rank.divisions > 1 ? RANK_DIVISIONS[step] : "",
    minimum: rank.minimum + step * ((config.ranks[index + 1]?.minimum ?? rank.minimum) - rank.minimum) / rank.divisions,
    tolerance: step ? ((config.ranks[index + 1].minimum - rank.minimum) / rank.divisions) * 1e-10 : 0,
    count: 0,
  })));
  const bin = `CASE ${divisions.map((row, index) => ({ row, index })).reverse().map(({ row, index }) => `WHEN elo >= ${row.minimum - row.tolerance} THEN ${index}`).join(" ")} ELSE 0 END`;
  for (const row of run(`${population} SELECT ${bin} AS bin,COUNT(*) AS count FROM population GROUP BY bin`)) divisions[row.bin].count = row.count;
  for (const row of divisions) row.percent = overall.profiles ? row.count / overall.profiles * 100 : 0;
  const ranks = config.ranks.map((rank) => {
    const count = divisions.filter((row) => row.rankId === rank.id).reduce((n, row) => n + row.count, 0);
    return { id: rank.id, name: rank.name, count, percent: overall.profiles ? count / overall.profiles * 100 : 0 };
  });

  const history = `WITH selected AS (
    SELECT r.match_id,r.user_id,r.game_id,h.day,
      json_extract(r.data,'$.position') AS position,
      COALESCE(json_extract(r.data,'$.reason'),'result') AS reason,
      COALESCE(json_extract(r.data,'$.cancelled'),0) AS cancelled,
      json_extract(r.data,'$.before') AS before,
      json_extract(r.data,'$.delta') AS delta
    FROM ranked_results r JOIN history h ON h.id=r.history_id
    WHERE r.game_id IN (${placeholders}) AND r.finished_at>=? AND r.finished_at<?
  ), matches AS (
    SELECT match_id,MIN(position) AS best,MAX(position) AS worst FROM selected GROUP BY match_id
  ), outcomes AS (
    SELECT s.*,CASE WHEN s.reason!='result' THEN 'loss' WHEN m.best=m.worst THEN 'draw'
      WHEN s.position=m.best THEN 'win' ELSE 'loss' END AS outcome
    FROM selected s JOIN matches m USING(match_id) WHERE s.cancelled=0
  )`;
  const historyParams = [...ids, range.from, range.until];
  const resultFields = `COUNT(DISTINCT match_id) AS matches,COUNT(*) AS participations,COUNT(DISTINCT user_id) AS activePlayers,
    SUM(outcome='win') AS wins,SUM(outcome='loss') AS losses,SUM(outcome='draw') AS draws,
    SUM(reason='abandon') AS abandons,SUM(reason='disconnect') AS disconnects,SUM(reason='afk') AS afk,
    AVG(ABS(delta)) AS averageVariation,AVG(before) AS averageStartingElo`;
  const summary = run(`${history} SELECT ${resultFields} FROM outcomes`, historyParams)[0];
  const gamesResults = run(`${history} SELECT game_id AS gameId,${resultFields} FROM outcomes GROUP BY game_id`, historyParams);
  const cancelled = run(`${history} SELECT COUNT(DISTINCT match_id) AS count FROM selected WHERE cancelled=1`, historyParams)[0].count;
  const firstDay = sqlite.prepare(`SELECT MIN(h.day) AS day FROM ranked_results r JOIN history h ON h.id=r.history_id WHERE r.game_id IN (${placeholders})`).get(...ids).day;
  const start = range.start ?? firstDay ?? range.end;
  const monthly = (Date.parse(range.end) - Date.parse(start)) / 86400000 >= 365;
  const bucket = monthly ? "substr(day,1,7)" : "day";
  const dailyMap = new Map(run(`${history} SELECT ${bucket} AS date,${resultFields} FROM outcomes GROUP BY date ORDER BY date`, historyParams).map((row) => [row.date, row]));
  const series = [];
  for (let day = monthly ? `${start.slice(0, 7)}-01` : start; day <= range.end;) {
    const date = monthly ? day.slice(0, 7) : day;
    series.push({ date, matches: 0, activePlayers: 0, wins: 0, losses: 0, draws: 0, ...dailyMap.get(date) });
    day = monthly ? Temporal.PlainDate.from(day).add({ months: 1 }).toString() : shiftDateKey(day, 1);
  }
  function results(row = {}) {
    const normalized = { matches: 0, participations: 0, activePlayers: 0, wins: 0, losses: 0, draws: 0, abandons: 0, disconnects: 0, afk: 0,
      averageVariation: null, averageStartingElo: null, ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? (key.startsWith("average") ? null : 0)])) };
    const decisions = (normalized.wins ?? 0) + (normalized.losses ?? 0);
    const exits = (normalized.abandons ?? 0) + (normalized.disconnects ?? 0) + (normalized.afk ?? 0);
    return { ...normalized, winRate: decisions ? normalized.wins / decisions * 100 : null,
      lossWinRatio: normalized.wins ? normalized.losses / normalized.wins : null,
      forfeitRate: normalized.participations ? exits / normalized.participations * 100 : null,
      averagePlayers: normalized.matches ? normalized.participations / normalized.matches : null };
  }
  return { generatedAt: new Date(now).toISOString(), timeZone: CASINO_TIME_ZONE,
    period: { id: period, start: range.start, end: range.end, firstRecordedDay: firstDay, bucket: monthly ? "month" : "day" },
    population: overall, ranks, divisions, summary: { ...results(summary), cancelled }, series,
    games: ids.map((id) => ({ gameId: id, population: byGame.find((row) => row.gameId === id) ?? { profiles: 0, players: 0, averageElo: null, medianElo: null, minimumElo: null, maximumElo: null },
      results: results(gamesResults.find((row) => row.gameId === id)) })) };
}
