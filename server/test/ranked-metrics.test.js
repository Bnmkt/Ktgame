import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { queryRankedMetrics, rankedMetricsPeriod } from "../src/services/ranked-metrics.js";
import { normalizeRankedConfig, rankFor } from "../src/services/ranked.js";
import { casinoDateKey } from "../src/services/time.js";

const config = normalizeRankedConfig({placementGames:0}), now = new Date("2026-10-05T12:00:00Z");
function fixture(t) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,guest INTEGER,data TEXT);
    CREATE TABLE user_game_elo(user_id TEXT,game_id TEXT,elo REAL,games INTEGER,wins INTEGER);
    CREATE TABLE user_ranked_placements(user_id TEXT,game_id TEXT,data TEXT);
    CREATE TABLE history(id TEXT PRIMARY KEY,day TEXT);
    CREATE TABLE ranked_results(history_id TEXT,match_id TEXT,user_id TEXT,game_id TEXT,finished_at TEXT,data TEXT)`);
  function user(id, elo, gameId = "yahtzee", options = {}) {
    db.prepare("INSERT OR IGNORE INTO users VALUES(?,?,?)").run(id, Number(options.guest ?? false), JSON.stringify(options));
    db.prepare("INSERT INTO user_game_elo VALUES(?,?,?,?,0)").run(id, gameId, elo, options.games ?? 1);
  }
  function match(id, positions, gameId = "yahtzee", at = "2026-10-05T10:00:00.000Z", extra = {}) {
    db.prepare("INSERT INTO history VALUES(?,?)").run(id, casinoDateKey(at));
    positions.forEach((position, index) => db.prepare("INSERT INTO ranked_results VALUES(?,?,?,?,?,?)").run(id, id, `private-${index}`, gameId, at, JSON.stringify({ position, before: 1000, delta: index ? -16 : 16, reason: "result", ...extra[index] })));
  }
  return { db, user, match, metrics: (filters) => queryRankedMetrics(db, config, filters, now) };
}

test("empty ranked metrics have zero counters, null rates and bounded zero-filled activity", (t) => {
  const { metrics } = fixture(t), data = metrics();
  assert.equal(data.population.profiles, 0); assert.equal(data.population.medianElo, null);
  assert.equal(data.summary.matches, 0); assert.equal(data.summary.winRate, null); assert.equal(data.summary.lossWinRatio, null);
  assert.equal(data.summary.averageVariation, null); assert.equal(data.series.length, 30);
  assert.equal(data.series[0].date, "2026-09-06"); assert.equal(data.series.at(-1).date, "2026-10-05");
  assert.ok(data.games.every((game) => game.results.wins === 0 && game.results.averageVariation === null));
});

test("population uses actual played active accounts, correct mean/median and distinct players", (t) => {
  const { user, metrics } = fixture(t);
  user("first", 800); user("second", 1000); user("third", 1400); user("first", 2000, "belote");
  user("inactive", 9000, "yahtzee", { active: false }); user("bot", 8000, "yahtzee", { isBot: true });
  user("guest", 7000, "yahtzee", { guest: true }); user("unplayed", 1000, "yahtzee", { games: 0 });
  const all = metrics(); assert.equal(all.population.players, 3); assert.equal(all.population.profiles, 4);
  assert.equal(all.population.averageElo, 1300); assert.equal(all.population.medianElo, 1200);
  const game = metrics({ gameId: "yahtzee" }); assert.equal(game.population.profiles, 3);
  assert.equal(game.population.medianElo, 1000); assert.equal(game.population.averageElo, 3200/3);
  assert.ok(Math.abs(game.ranks.reduce((sum, row) => sum+row.percent, 0)-100) < 1e-8);
});

test("rank and division distributions reuse configured thresholds at exact boundaries", (t) => {
  const { db, user } = fixture(t);
  const settings = normalizeRankedConfig({ placementGames:0,ranks: [{ id: "starter", name: "Débutant", minimum: 0, divisions: 3 }, { id: "expert", name: "Expert", minimum: 900, divisions: 2 }, { id: "top", name: "Sommet", minimum: 1500, divisions: 1 }] });
  const elos = [0, 299, 300, 599, 600, 899, 900, 1199, 1200, 1499, 1500, 2600];
  elos.forEach((elo, index) => user(`player-${index}`, elo));
  const data = queryRankedMetrics(db, settings, {}, now);
  assert.deepEqual(data.divisions.map((row)=>row.division),["I","II","III","I","II",""]);
  for (const row of data.divisions) assert.equal(row.count, elos.filter((elo) => { const rank = rankFor(elo, settings.ranks); return rank.id === row.rankId && rank.division === row.division; }).length);
  assert.deepEqual(data.ranks.map((row) => row.count), [6, 4, 2]);
});

test("population excludes unfinished placements and honors game-specific placement settings", (t) => {
  const { db, user } = fixture(t);
  const settings = normalizeRankedConfig({ games: { belote: { placementGames: 0 } } });
  user("pending", 3000, "yahtzee", { games: 4 });
  user("restarted", 4000, "yahtzee", { games: 8 });
  user("legacy", 1000, "yahtzee", { games: 5 });
  user("finished", 1200, "yahtzee", { games: 5 });
  user("disabled", 800, "belote", { games: 1 });
  db.prepare("INSERT INTO user_ranked_placements VALUES(?,?,?)").run("restarted", "yahtzee", JSON.stringify({ games: 3, completed: false }));
  db.prepare("INSERT INTO user_ranked_placements VALUES(?,?,?)").run("finished", "yahtzee", JSON.stringify({ games: 5, completed: true }));
  const data = queryRankedMetrics(db, settings, {}, now);
  assert.equal(data.population.players, 3);
  assert.equal(data.population.averageElo, 1000);
  assert.equal(data.population.medianElo, 1000);
  assert.equal(data.ranks.reduce((sum, row) => sum + row.count, 0), 3);
  assert.equal(data.games.find((row) => row.gameId === "yahtzee").population.profiles, 2);
  assert.equal(data.games.find((row) => row.gameId === "belote").population.profiles, 1);
});

test("results distinguish multiplayer losses, team winners, draws and cancelled Elo", (t) => {
  const { match, metrics } = fixture(t);
  match("duel", [1, 2]); match("multi", [1, 2, 3, 4], "president", undefined, { 3: { reason: "disconnect" } });
  match("teams", [1, 3, 1, 3], "belote"); match("draw", [1, 1]);
  match("cancelled", [1, 2], "yahtzee", undefined, { 0: { cancelled: true }, 1: { cancelled: true } });
  const data = metrics(); assert.equal(data.summary.matches, 4); assert.equal(data.summary.participations, 12);
  assert.equal(data.summary.wins, 4); assert.equal(data.summary.losses, 6); assert.equal(data.summary.draws, 2);
  assert.equal(data.summary.winRate, 40); assert.equal(data.summary.lossWinRatio, 1.5); assert.equal(data.summary.cancelled, 1);
  assert.equal(data.summary.disconnects, 1); assert.ok(Math.abs(data.summary.forfeitRate-100/12) < 1e-8);
  assert.equal(data.summary.averagePlayers, 3); assert.equal(data.summary.averageVariation, 16);
  assert.equal(data.summary.activePlayers, 4); assert.equal(data.series.at(-1).matches, 4);
  assert.equal(data.games.find((row) => row.gameId === "belote").results.wins, 2);
  assert.equal(data.games.find((row) => row.gameId === "yahtzee").results.draws, 2);
  const encoded = JSON.stringify(data); assert.ok(!encoded.includes("private-")); assert.ok(!encoded.includes("user_id"));
});

test("shared first place is a victory unless the entire match is tied; forfeits cannot win", (t) => {
  const { match, metrics } = fixture(t);
  match("shared", [1, 1, 3]); match("exit", [1, 1], "yahtzee", undefined, { 0: { reason: "abandon" } });
  const { summary } = metrics(); assert.equal(summary.wins, 2); assert.equal(summary.losses, 2); assert.equal(summary.draws, 1); assert.equal(summary.abandons, 1);
});

test("period and daily buckets use casino midnight, include empty days and filter by game", (t) => {
  const { match, metrics } = fixture(t);
  match("before", [1, 2], "yahtzee", "2026-09-28T21:59:59.000Z");
  match("boundary", [1, 2], "yahtzee", "2026-09-28T22:00:00.000Z");
  match("other", [1, 2], "belote", "2026-10-04T22:30:00.000Z");
  const data = metrics({ period: "7" }); assert.equal(data.series.length, 7); assert.equal(data.series[0].date, "2026-09-29");
  assert.equal(data.summary.matches, 2); assert.equal(data.series[0].matches, 1); assert.equal(data.series.at(-1).matches, 1);
  assert.equal(metrics({ gameId: "yahtzee", period: "7" }).summary.matches, 1);
  assert.equal(metrics({ period: "season" }).period.start, "2026-10-01");
  assert.equal(metrics({ period: "season" }).summary.matches, 1);
  const dst = rankedMetricsPeriod("7", new Date("2026-10-25T12:00:00Z"));
  assert.equal((Date.parse(dst.until)-Date.parse(dst.from))/3600000, 169);
});

test("long all-time activity is aggregated monthly rather than returning unlimited daily points", (t) => {
  const { match, metrics } = fixture(t); match("old", [1, 2], "yahtzee", "2024-01-01T12:00:00.000Z");
  match("recent", [1, 2]); const data = metrics({ period: "all" });
  assert.equal(data.period.bucket, "month"); assert.equal(data.series.length, 34);
  assert.equal(data.series[0].date, "2024-01"); assert.equal(data.series[0].matches, 1);
  assert.equal(data.series.at(-1).date, "2026-10"); assert.equal(data.summary.matches, 2);
});

test("metrics reject unknown games, query arrays and injected periods", (t) => {
  const { metrics } = fixture(t);
  for (const gameId of ["blackjack", "yahtzee'", ["yahtzee"]]) assert.throws(() => metrics({ gameId }));
  for (const period of ["50000", "all'; DELETE FROM users", ["30"]]) assert.throws(() => metrics({ period }));
});
