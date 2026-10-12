import { buildLeaderboard, leaderboardPeriod, seasonFor } from "../services/leaderboards.js";
import { casinoDateKey } from "../services/time.js";

export function createLeaderboardSeasons(sqlite, gameIds, loadCommitted) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_seasons (
      season TEXT PRIMARY KEY, frozen_at TEXT NOT NULL, source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leaderboard_boards (
      season TEXT NOT NULL, game_id TEXT NOT NULL, metric TEXT NOT NULL,
      total INTEGER NOT NULL, metadata TEXT NOT NULL,
      PRIMARY KEY(season, game_id, metric)
    );
    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      season TEXT NOT NULL, game_id TEXT NOT NULL, metric TEXT NOT NULL, user_id TEXT NOT NULL,
      rank INTEGER NOT NULL, value REAL NOT NULL, games INTEGER NOT NULL,
      wins INTEGER NOT NULL, gains REAL NOT NULL, record REAL NOT NULL,
      score REAL, balance REAL, achieved_at TEXT,
      PRIMARY KEY(season, game_id, metric, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_rank ON leaderboard_entries(season, game_id, metric, rank, user_id);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_user ON leaderboard_entries(user_id, season);
  `);
  let active = sqlite.prepare("SELECT value FROM meta WHERE key='leaderboard-active-season'").get()?.value;
  let archivedSeasons = sqlite.prepare("SELECT season FROM leaderboard_seasons ORDER BY season DESC").all().map((row) => row.season);
  const insertBoard = sqlite.prepare("INSERT INTO leaderboard_boards VALUES (?,?,?,?,?)");
  const insertRow = sqlite.prepare("INSERT INTO leaderboard_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const exists = sqlite.prepare("SELECT 1 FROM leaderboard_seasons WHERE season=?");
  const decode = ({ user_id: id, achieved_at: achievedAt, ...row }) => ({ id, achievedAt, ...row });
  const columns = "user_id,rank,value,games,wins,gains,record,score,balance,achieved_at";

  function freeze(db, season, now, closingBalances) {
    if (exists.get(season)) return;
    const options = { allRows: true, historicalAccounts: !closingBalances, closingBalances };
    for (const game of ["all", ...gameIds]) {
      for (const metric of game === "all" ? ["balance", "wins", "gains", "record"] : ["wins", "gains", "record", "score"]) {
        const result = buildLeaderboard(db, { period: "season", season, game, metric }, "", now, gameIds, options);
        const { rows, self, seasons, ...metadata } = result;
        insertBoard.run(season, game, metric, result.total, JSON.stringify(metadata));
        for (const row of rows) insertRow.run(season, game, metric, row.id, row.rank, row.value, row.games, row.wins, row.gains, row.record, row.score, row.balance ?? null, row.achievedAt);
      }
    }
    sqlite.prepare("INSERT INTO leaderboard_seasons VALUES (?,?,?)").run(season, now.toISOString(), closingBalances ? "closing" : "reconstructed");
  }

  function synchronize(now = new Date()) {
    const current = seasonFor(casinoDateKey(now));
    if (active && current <= active) return;
    // Read only committed data: a caller may already have edited the memory model.
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const previous = sqlite.prepare("SELECT value FROM meta WHERE key='leaderboard-active-season'").get()?.value;
      if (!previous || current > previous) {
        const db = loadCommitted();
        const known = buildLeaderboard(db, { period: "all", metric: "wins" }, "", now, gameIds).seasons;
        if (previous) {
          let season = previous;
          while (season < current) {
            known.push(season);
            season = seasonFor(leaderboardPeriod({ season }, now).end);
          }
        }
        for (const season of [...new Set(known)].filter((value) => value < current).sort()) freeze(db, season, now, Boolean(previous && season >= previous));
        sqlite.prepare("INSERT INTO meta(key,value) VALUES ('leaderboard-active-season',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(current);
      }
      sqlite.exec("COMMIT");
      active = current;
      archivedSeasons = sqlite.prepare("SELECT season FROM leaderboard_seasons ORDER BY season DESC").all().map((row) => row.season);
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }

  function read(query, viewerId, now = new Date()) {
    synchronize(now);
    const period = leaderboardPeriod(query, now);
    if (period.period !== "season" || period.season === period.currentSeason) return null;
    const gameId = query.game || "all", metric = query.metric || "balance";
    const board = sqlite.prepare("SELECT metadata FROM leaderboard_boards WHERE season=? AND game_id=? AND metric=?").get(period.season, gameId, metric);
    if (!board) return null;
    const keys = [period.season, gameId, metric];
    const rows = sqlite.prepare(`SELECT ${columns} FROM leaderboard_entries WHERE season=? AND game_id=? AND metric=? ORDER BY rank,user_id LIMIT 100`).all(...keys).map(decode);
    const own = sqlite.prepare(`SELECT ${columns} FROM leaderboard_entries WHERE season=? AND game_id=? AND metric=? AND user_id=?`).get(...keys, viewerId);
    const frozen = sqlite.prepare("SELECT frozen_at,source FROM leaderboard_seasons WHERE season=?").get(period.season);
    return { ...JSON.parse(board.metadata), period, rows, self: own ? decode(own) : null,
      seasons: [period.currentSeason, ...archivedSeasons.filter((season) => season < period.currentSeason)],
      frozenAt: frozen.frozen_at, snapshotSource: frozen.source };
  }
  return { synchronize, read, seasons: () => [...archivedSeasons] };
}
