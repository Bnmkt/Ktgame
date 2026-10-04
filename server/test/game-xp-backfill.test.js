import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { MAX_XP, normalizeProgressionConfig } from "../src/services/game-progression.js";
import { backfillHistoricalGameXp } from "../src/services/game-xp-backfill.js";

const config = normalizeProgressionConfig({ formula: "50*N", completionXp: 20, victoryXp: 25, games: { blackjack: { completionXp: 10, victoryXp: 5 } } }, ["yahtzee", "blackjack"]);
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE users(id TEXT PRIMARY KEY,pseudo TEXT,guest INTEGER); CREATE TABLE history(id TEXT PRIMARY KEY,data TEXT,finished_at TEXT); CREATE TABLE history_members(history_id TEXT,user_id TEXT,game_id TEXT,won INTEGER,is_bot INTEGER,player_order INTEGER); CREATE TABLE user_game_xp(user_id TEXT,game_id TEXT,xp INTEGER,PRIMARY KEY(user_id,game_id)); INSERT INTO users VALUES ('alice','alice',0),('bob','bob',0),('guest','guest',1); INSERT INTO user_game_xp VALUES ('alice','yahtzee',90),('bob','yahtzee',123);");
  const history = sqlite.prepare("INSERT INTO history VALUES (?,?,?)"), member = sqlite.prepare("INSERT INTO history_members VALUES (?,?,?,?,?,?)");
  const add = (id, gameId, won, data = {}, options = {}) => {
    history.run(id, JSON.stringify({ id, gameId, players: [], ...data }), options.finishedAt === undefined ? "2026-10-01T12:00:00Z" : options.finishedAt);
    member.run(id, options.userId ?? "alice", gameId, Number(won), options.bot ?? 0, options.order ?? 0);
  };
  add("old-win", "yahtzee", true, { xpAwards: { bob: 70 }, ranking: [{ id: "alice", score: 300 }] });
  add("old-loss", "yahtzee", false);
  add("credited", "yahtzee", true, { xpAwards: { alice: 90 } });
  add("zero-receipt", "yahtzee", false, { xpAwards: { alice: 0 } });
  add("cards", "blackjack", true);
  add("legacy-win", "yahtzee", true, { players: undefined, winners: ["alice"] }, { order: -1 });
  add("bot", "yahtzee", true, {}, { bot: 1 });
  add("departed", "yahtzee", true, {}, { order: -1 });
  add("unfinished", "yahtzee", true, {}, { finishedAt: null });
  add("unknown", "unknown", true);
  add("other-user", "yahtzee", true, {}, { userId: "bob" });
  return { sqlite, add };
}

test("historical XP respects current per-game rules, existing receipts and dry-run isolation", () => {
  const { sqlite } = fixture();
  try {
    const result = backfillHistoricalGameXp(sqlite, "alice", config, ["yahtzee", "blackjack"]);
    assert.equal(result.applied, false); assert.equal(result.gamesCredited, 4); assert.equal(result.alreadyCredited, 2); assert.equal(result.skipped, 4);
    assert.equal(result.addedXp, 125); assert.equal(result.totalXp, 215);
    assert.equal(result.games.find((row) => row.gameId === "yahtzee").xp, 200);
    assert.equal(result.games.find((row) => row.gameId === "yahtzee").level, 3);
    assert.equal(sqlite.prepare("SELECT xp FROM user_game_xp WHERE user_id='alice'").get().xp, 90);
    assert.equal(Object.hasOwn(JSON.parse(sqlite.prepare("SELECT data FROM history WHERE id='old-win'").get().data).xpAwards, "alice"), false);
  } finally { sqlite.close(); }
});

test("applying twice credits only missing XP and preserves other players and history metadata", () => {
  const { sqlite } = fixture();
  try {
    const result = backfillHistoricalGameXp(sqlite, "alice", config, ["yahtzee", "blackjack"], { apply: true });
    assert.equal(result.addedXp, 125);
    const data = JSON.parse(sqlite.prepare("SELECT data FROM history WHERE id='old-win'").get().data);
    assert.deepEqual(data.xpAwards, { bob: 70, alice: 45 }); assert.deepEqual(data.ranking, [{ id: "alice", score: 300 }]);
    assert.equal(sqlite.prepare("SELECT xp FROM user_game_xp WHERE user_id='bob'").get().xp, 123);
    const second = backfillHistoricalGameXp(sqlite, "alice", config, ["yahtzee", "blackjack"], { apply: true });
    assert.equal(second.addedXp, 0); assert.equal(second.gamesCredited, 0); assert.equal(second.totalXp, 215);
    assert.throws(() => backfillHistoricalGameXp(sqlite, "guest", config, ["yahtzee"]), /permanent/);
    assert.throws(() => backfillHistoricalGameXp(sqlite, "missing", config, ["yahtzee"]), /introuvable/);
  } finally { sqlite.close(); }
});

test("a write failure rolls back both XP balances and per-game receipts", () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec("CREATE TRIGGER fail_history BEFORE UPDATE ON history BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(() => backfillHistoricalGameXp(sqlite, "alice", config, ["yahtzee", "blackjack"], { apply: true }), /fixture failure/);
    assert.equal(sqlite.prepare("SELECT xp FROM user_game_xp WHERE user_id='alice'").get().xp, 90);
    assert.equal(Object.hasOwn(JSON.parse(sqlite.prepare("SELECT data FROM history WHERE id='old-win'").get().data).xpAwards, "alice"), false);
  } finally { sqlite.close(); }
});

test("XP ceilings and zero rewards record the actual amount without allowing a later duplicate", () => {
  const { sqlite } = fixture();
  try {
    sqlite.prepare("UPDATE user_game_xp SET xp=? WHERE user_id='alice'").run(MAX_XP - 5);
    const result = backfillHistoricalGameXp(sqlite, "alice", config, ["yahtzee"], { apply: true });
    assert.equal(result.addedXp, 5);
    assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM history WHERE id='legacy-win'").get().data).xpAwards.alice, 5);
    assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM history WHERE id='old-win'").get().data).xpAwards.alice, 0);
    const zero = normalizeProgressionConfig({ completionXp: 0, victoryXp: 0 }, ["blackjack"]);
    assert.equal(backfillHistoricalGameXp(sqlite, "alice", zero, ["blackjack"], { apply: true }).addedXp, 0);
    assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM history WHERE id='cards'").get().data).xpAwards.alice, 0);
    assert.equal(backfillHistoricalGameXp(sqlite, "alice", config, ["yahtzee", "blackjack"], { apply: true }).addedXp, 0);
  } finally { sqlite.close(); }
});
