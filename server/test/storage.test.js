import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { Archive, archiveRows } from "../src/storage/archives.js";
import { playerStatistics, playerStatisticsCacheHealth } from "../src/services/player-statistics.js";
import { buildLeaderboard } from "../src/services/leaderboards.js";
import { ledgerPage } from "../src/storage/ledger.js";
import { eventActionUsage } from "../src/storage/event-usage.js";
import { createReadingWork } from "../src/services/reading-work.js";
import { createReadingTasks } from "../src/services/reading-tasks.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-storage-"));
const file = path.join(dir, "test.sqlite");
process.env.SQLITE_PATH = file;
const original = {
  users: [{ id: "a", pseudo: "Alice", tokens: 50, passwordHash: "keep-this-hash", profile: { birthDate: "1990-01-01" }, achievements: { unlocked: ["first", "unknown"], unlockedAt: { first: "2026-09-01", unknown: "2026-09-02" }, suppressed: ["hidden"] }, cosmetics: { icons: ["fox", "dice"], memberCards: ["aurora"], equipped: { icon: "fox", memberCard: "aurora" } } }],
  history: [{ id: "h1", gameId: "yahtzee", roomId: "r", players: [{ id: "a", pseudo: "Old name", isBot: false }, { id: "bot", pseudo: "Bot", isBot: true }], winners: ["a"], ranking: [{ id: "a", score: 200 }], payouts: { a: 100 }, achievementEvents: { a: ["first"] }, finishedAt: "2026-09-01T22:30:00Z" }],
  transactions: [{ id: "t1", userId: "a", amount: -10, balance: 90, reason: "room-stake", gameId: "yahtzee", createdAt: "2026-09-01T22:30:00Z" }, { id: "t2", userId: "a", amount: 100, balance: 190, reason: "daily-claim", createdAt: "2026-09-02T22:30:00Z" }]
};
const old = new DatabaseSync(file);
old.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES ('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT,pseudo TEXT,guest INTEGER); CREATE TABLE history(id TEXT PRIMARY KEY,user_ids TEXT,finished_at TEXT,data TEXT); CREATE TABLE transactions(id TEXT PRIMARY KEY,user_id TEXT,game_id TEXT,event_id TEXT,request_id TEXT,created_at TEXT,data TEXT)");
for (const user of original.users) old.prepare("INSERT INTO users VALUES (?, ?, ?, 0)").run(user.id, JSON.stringify(user), user.pseudo);
for (const row of original.history) old.prepare("INSERT INTO history VALUES (?, ?, ?, ?)").run(row.id, JSON.stringify(["a", "bot"]), row.finishedAt, JSON.stringify(row));
for (const row of original.transactions) old.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, NULL, ?, ?)").run(row.id, row.userId, row.gameId ?? null, row.createdAt, JSON.stringify(row));
old.close();
const { readDb, writeDb, updateDb, databaseHealth, databaseSettingsRevision, databaseSettingsReadRevision, databaseEntityRevision, setRoomMutationGuard, syncCatalogs, closeDatabase, rankedSettlement } = await import("../src/db.js");
const inspection = new DatabaseSync(file);

test("statistics cache telemetry counts reuse and invalidation without returning user IDs", () => {
  const db = readDb(), before = playerStatisticsCacheHealth(db);
  playerStatistics(db, "metrics-user"); playerStatistics(db, "metrics-user");
  const after = playerStatisticsCacheHealth(db);
  assert.equal(after.hits - before.hits, 1); assert.equal(after.misses - before.misses, 1);
  assert.equal(after.entries - before.entries, 1); assert.equal(after.capacity, 2048);
  assert.ok(!JSON.stringify(after).includes("metrics-user"));
});
after(() => { inspection.close(); closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }); });

test("account configuration revision changes only after committed settings or rollback", () => {
  const before = databaseSettingsRevision();
  assert.equal(databaseSettingsReadRevision(), before);
  writeDb(readDb()); assert.equal(databaseSettingsRevision(), before);
  updateDb((db) => { assert.equal(databaseSettingsReadRevision(), undefined); db.settings.accountProjectionTest = "committed"; });
  assert.equal(databaseSettingsRevision(), before + 1);
  updateDb((db) => { db.users[0].tokens++; });
  assert.equal(databaseSettingsRevision(), before + 1);
  assert.throws(() => updateDb((db) => { db.settings.accountProjectionTest = "uncommitted"; throw new Error("rollback"); }));
  assert.equal(databaseSettingsRevision(), before + 2);
  assert.equal(databaseSettingsReadRevision(), before + 2);
  assert.equal(readDb().settings.accountProjectionTest, "committed");
  updateDb((db) => { db.users[0].tokens--; delete db.settings.accountProjectionTest; });
});

test("owner fencing rejects direct room writes and rolls back account effects", () => {
  const room = { id: "fenced", code: "FENCED", gameId: "yahtzee", players: [], createdAt: new Date().toISOString() };
  const before = readDb().users[0].tokens;
  const revision = databaseEntityRevision("users", "a");
  setRoomMutationGuard(() => { throw Object.assign(new Error("Room owner required"), { code: "GAME_FENCED" }); });
  try {
    assert.throws(() => updateDb((db) => { db.rooms.push(room); db.users[0].tokens--; }, { rooms: [room.id], users: ["a"] }), { code: "GAME_FENCED" });
    assert.equal(readDb().users[0].tokens, before); assert.ok(!readDb().rooms.some(({ id }) => id === room.id));
    assert.notEqual(databaseEntityRevision("users", "a"), revision);
    assert.equal(inspection.prepare("SELECT count(*) AS n FROM rooms WHERE id='fenced'").get().n, 0);
  } finally { setRoomMutationGuard(undefined); }
});

test("entity-only transactions retain configuration caches without skipping ledger persistence", () => {
  const revision = databaseSettingsRevision(), balance = readDb().users[0].tokens;
  updateDb((db) => { assert.equal(databaseSettingsReadRevision(), revision); db.users[0].tokens++; }, { users: ["a"], rooms: [], settings: false });
  assert.equal(databaseSettingsRevision(), revision); assert.equal(readDb().users[0].tokens, balance + 1);
  updateDb((db) => { db.users[0].tokens--; }, { users: ["a"], rooms: [], settings: false });
});

test("legacy migration is backed up, lossless, relational and idempotent", () => {
  assert.deepEqual(readDb().users, original.users);
  assert.deepEqual([...readDb().history], original.history);
  assert.deepEqual([...readDb().transactions], original.transactions);
  const compact = JSON.parse(inspection.prepare("SELECT data FROM users").get().data);
  assert.deepEqual(compact.achievements, {});
  assert.deepEqual(compact.cosmetics.icons, []);
  assert.equal(inspection.prepare("SELECT count(*) AS n FROM user_inventory").get().n, 3);
  assert.equal(inspection.prepare("SELECT count(*) AS n FROM user_achievements").get().n, 3);
  assert.equal(inspection.prepare("PRAGMA foreign_key_check").get(), undefined);
  const backup = fs.readdirSync(dir).find((entry) => entry.includes("before-v2"));
  assert.ok(backup);
  const before = new DatabaseSync(path.join(dir, backup), { readOnly: true });
  assert.deepEqual(JSON.parse(before.prepare("SELECT data FROM users").get().data), original.users[0]);
  before.close();
  const moduleUrl = new URL("../src/db.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `const db = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify(db.readDb().users)); db.closeDatabase();`], { env: { ...process.env, SQLITE_PATH: file }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()), original.users);
  assert.equal(fs.readdirSync(dir).filter((entry) => entry.includes("before-v2")).length, 1);
});

test("indexed statistics equal the legacy calculation including casino midnight", () => {
  assert.deepEqual(playerStatistics(readDb(), "a"), playerStatistics(original, "a"));
  assert.equal(playerStatistics(readDb(), "a").activity["2026-09-02"], 1);
  assert.deepEqual(archiveRows(readDb().history, { memberId: "a" }), original.history);
  assert.deepEqual(archiveRows(readDb().transactions, { userId: "a", reason: "daily-claim" }), [original.transactions[1]]);
});

test("real read worker preserves pagination, hydration and statistics without writes", async () => {
  const work = createReadingWork(file);
  try {
    const history = await work.run("history", { userId: "a", query: { game: "yahtzee", limit: "1" } });
    assert.deepEqual(history, ledgerPage(readDb().history, "a", { game: "yahtzee", limit: "1" }));
    const transactions = await work.run("transactions", { userId: "a", query: { direction: "debit" } });
    assert.deepEqual(transactions, ledgerPage(readDb().transactions, "a", { direction: "debit" }));
    assert.deepEqual(await work.run("statistics", { userId: "a" }), playerStatistics(readDb(), "a"));
    assert.equal((await work.run("history", { userId: "unrelated" })).total, 0);
    assert.equal(work.health().services.history.completed, 2);
    const tasks = createReadingTasks(file);
    try { assert.throws(() => tasks.run("write", { userId: "a" })); }
    finally { tasks.close(); }
  } finally { await work.close(); }
});

test("read worker cache observes committed changes from another connection", async () => {
  const work = createReadingWork(file);
  try {
    const before = await work.run("statistics", { userId: "a" });
    const row = { id: "worker-cache-check", userId: "a", amount: 1, reason: "test-credit", createdAt: new Date().toISOString() };
    readDb().transactions.push(row); writeDb(readDb());
    const after = await work.run("statistics", { userId: "a" });
    assert.equal(after.transactions, before.transactions + 1);
    assert.equal(after.credits, before.credits + 1);
    assert.deepEqual(after, playerStatistics(readDb(), "a"));
  } finally {
    await work.close();
    inspection.prepare("DELETE FROM transactions WHERE id='worker-cache-check'").run();
    readDb().transactions.persistedCount--;
    readDb().transactions.touchUsers([{ userId: "a" }]);
  }
});

test("catalogue definitions are shared and unknown owned IDs survive", () => {
  syncCatalogs([{ id: "first", title: "First" }], [{ id: "fox-product", value: "fox", type: "icons", name: "Fox" }]);
  assert.equal(inspection.prepare("SELECT count(*) AS n FROM item_catalog WHERE type = 'icons' AND id = 'fox'").get().n, 1);
  assert.equal(JSON.parse(inspection.prepare("SELECT data FROM achievement_catalog WHERE id = 'first'").get().data).title, "First");
  assert.ok(readDb().users[0].achievements.unlocked.includes("unknown"));
});

test("achievement event progress is normalized outside the user document", () => {
  const db = readDb();
  db.users[0].achievementProgress = { marathon: { value: 7, values: [1, 2, 3], updatedAt: "2026-09-03T12:00:00Z" } };
  writeDb(db);
  const row = inspection.prepare("SELECT value, data, updated_at FROM achievement_progress WHERE user_id = ? AND achievement_id = ?").get("a", "marathon");
  assert.equal(row.value, 7);
  assert.deepEqual(JSON.parse(row.data).values, [1, 2, 3]);
  assert.equal(JSON.parse(inspection.prepare("SELECT data FROM users WHERE id = ?").get("a").data).achievementProgress, undefined);
});

test("game XP and one-time reward receipts are normalized, durable and cascade with accounts", () => {
  updateDb((db) => { db.users[0].gameXp = { yahtzee: 300, blackjack: 50 }; db.users[0].achievementRewards = ["reward-one"]; });
  const compact = JSON.parse(inspection.prepare("SELECT data FROM users WHERE id='a'").get().data);
  assert.equal(compact.gameXp, undefined); assert.equal(compact.achievementRewards, undefined);
  assert.equal(inspection.prepare("SELECT xp FROM user_game_xp WHERE user_id='a' AND game_id='yahtzee'").get().xp, 300);
  assert.deepEqual(readDb().users[0].gameXp, { blackjack: 50, yahtzee: 300 });
  updateDb((db) => { db.users[0].achievementRewards = []; });
  assert.deepEqual(readDb().users[0].achievementRewards, ["reward-one"]);
  updateDb((db) => { db.users[0].tokens++; });
  assert.equal(inspection.prepare("SELECT COUNT(*) AS n FROM achievement_reward_receipts WHERE user_id='a'").get().n, 1);
  const moduleUrl = new URL("../src/db.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `const db = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify(db.readDb().users[0].achievementRewards)); db.closeDatabase();`], { env: { ...process.env, SQLITE_PATH: file }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()), ["reward-one"]);
  updateDb((db) => db.users.push({ id: "xp-temp", pseudo: "XpTest", gameXp: { yahtzee: 25 }, achievementRewards: ["test"] }));
  assert.equal(inspection.prepare("SELECT COUNT(*) AS n FROM user_game_xp WHERE user_id='xp-temp'").get().n, 1);
  updateDb((db) => { db.users = db.users.filter((user) => user.id !== "xp-temp"); });
  assert.equal(inspection.prepare("SELECT COUNT(*) AS n FROM user_game_xp WHERE user_id='xp-temp'").get().n, 0);
  assert.equal(inspection.prepare("SELECT COUNT(*) AS n FROM achievement_reward_receipts WHERE user_id='xp-temp'").get().n, 0);
  assert.equal(inspection.prepare("PRAGMA foreign_key_check").get(), undefined);
});

test("ranked Elo is normalized, survives restart and duplicate awards roll back atomically", () => {
  const result = { userId: "a", before: 1000, delta: 16, after: 1016, position: 1, penalty: 0 };
  const row = { ...original.history[0], id: "ranked-history", ranked: { matchId: "ranked-once", results: [result], participants: [{ id: "a" }] } };
  updateDb((db) => {
    db.users.push({ id: "elo-test", pseudo: "EloTest", tokens: 50, gameElo: { yahtzee: { elo: 1016, games: 1, wins: 1 } } });
    db.history.push({ ...row, players: [{ id: "elo-test", pseudo: "EloTest" }], winners: ["elo-test"], ranked: { ...row.ranked, results: [{ ...result, userId: "elo-test" }], participants: [{ id: "elo-test" }] } });
  });
  assert.equal(JSON.parse(inspection.prepare("SELECT data FROM users WHERE id='a'").get().data).gameElo, undefined);
  assert.equal(inspection.prepare("SELECT elo FROM user_game_elo WHERE user_id='elo-test'").get().elo, 1016);
  assert.equal(inspection.prepare("SELECT count(*) n FROM ranked_results WHERE match_id='ranked-once'").get().n, 1);
  const moduleUrl = new URL("../src/db.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `const db = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify(db.readDb().users.find(u=>u.id==='elo-test').gameElo)); db.closeDatabase();`], { env: { ...process.env, SQLITE_PATH: file }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()), { yahtzee: { elo: 1016, games: 1, wins: 1 } });
  assert.throws(() => updateDb((db) => {
    const user = db.users.find((u)=>u.id === "elo-test");
    user.gameElo.yahtzee.elo = 1032;
    user.gameElo.yahtzee.games++;
    user.tokens += 100;
    db.history.push({ ...row, id: "ranked-duplicate", ranked: { ...row.ranked, results: [{ ...result, userId: "elo-test" }] } });
  }), /déjà attribué son Elo/);
  assert.equal(readDb().users.find((u)=>u.id==="elo-test").gameElo.yahtzee.elo, 1016);
  assert.equal(readDb().users.find((u)=>u.id==="elo-test").gameElo.yahtzee.games, 1);
  assert.equal(inspection.prepare("SELECT id FROM history WHERE id='ranked-duplicate'").get(), undefined);
  assert.equal(inspection.prepare("PRAGMA foreign_key_check").get(), undefined);
  assert.equal(rankedSettlement("ranked-once").results[0].after,1016);
  inspection.prepare("DELETE FROM history WHERE id='ranked-history'").run();
  assert.deepEqual(rankedSettlement("ranked-once"),{results:[]});
  updateDb((db)=> {db.users=db.users.filter((u)=>u.id!=="elo-test");});
});

test("placement evidence is normalized, durable and removed with its account", () => {
  const placement={games:4,score:2.5,opponentElo:5200,wins:2,losses:1,draws:1,completed:false};
  updateDb((db)=>db.users.push({id:'placement-test',pseudo:'PlacementTest',tokens:0,gameElo:{yahtzee:{elo:1000,games:4,wins:2,placement}}}));
  assert.deepEqual(JSON.parse(inspection.prepare('SELECT data FROM user_ranked_placements WHERE user_id=?').get('placement-test').data),placement);
  assert.equal(JSON.parse(inspection.prepare('SELECT data FROM users WHERE id=?').get('placement-test').data).gameElo,undefined);
  const moduleUrl=new URL('../src/db.js',import.meta.url).href;
  const child=spawnSync(process.execPath,['--input-type=module','-e',`const db=await import(${JSON.stringify(moduleUrl)});console.log(JSON.stringify(db.readDb().users.find(u=>u.id==='placement-test').gameElo.yahtzee.placement));db.closeDatabase();`],{env:{...process.env,SQLITE_PATH:file},encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout.trim()),placement);
  updateDb((db)=>{db.users=db.users.filter((user)=>user.id!=='placement-test');});
  assert.equal(inspection.prepare('SELECT COUNT(*) n FROM user_ranked_placements WHERE user_id=?').get('placement-test').n,0);
});

test("pending payouts and games affect statistics before atomic commit", () => {
  const db = readDb();
  db.transactions.push({ id: "t3", userId: "a", amount: -20, balance: 30, reason: "shop-purchase", createdAt: "2026-09-03T12:00:00Z" });
  db.history.push({ ...original.history[0], id: "h2", winners: ["bot"] });
  db.users[0].tokens = 30;
  db.users[0].cosmetics.icons.push("star");
  assert.equal(playerStatistics(db, "a").shopSpent, 20);
  assert.equal(playerStatistics(db, "a").gamesPlayed, 2);
  assert.equal(playerStatistics(db, "a").wins, 1);
  const pending = playerStatistics(db, "a");
  writeDb(db);
  assert.deepEqual(playerStatistics(readDb(), "a"), pending);
  assert.equal(readDb().transactions.pending.length, 0);
  assert.equal(inspection.prepare("SELECT count(*) AS n FROM user_inventory").get().n, 4);
});

test("constraint failures roll back ledger, inventory and cached balances", () => {
  const before = structuredClone(readDb().users);
  assert.throws(() => updateDb((db) => {
    db.users[0].tokens = 999999;
    db.users[0].cosmetics.icons.push("not-owned");
    db.transactions.push({ ...original.transactions[0] });
  }), /UNIQUE/);
  assert.deepEqual(readDb().users, before);
  assert.equal(readDb().transactions.length, 3);
  assert.equal(readDb().transactions.pending.length, 0);
  assert.throws(() => updateDb((db) => { db.users[0].tokens = 0; throw new Error("abort"); }), /abort/);
  assert.deepEqual(readDb().users, before);
});

test("statistics caches survive unrelated activity and invalidate pending and committed changes", () => {
  const db = readDb(), before = playerStatistics(db, "a");
  db.transactions.push({ id: "stats-other", userId: "bot", amount: 1, reason: "adjustment", createdAt: "2026-09-03T12:00:00Z" });
  assert.equal(playerStatistics(db, "a"), before);
  assert.equal(playerStatistics(db, "bot").transactions, 1);
  writeDb(db, { users: [], rooms: [] });
  assert.equal(playerStatistics(readDb(), "a"), before);
  assert.equal(playerStatistics(readDb(), "bot").transactions, 1);
  // Restore the shared fixture, including its cache revision.
  inspection.prepare("DELETE FROM transactions WHERE id='stats-other'").run();
  readDb().transactions.persistedCount--;
  readDb().transactions.touchUsers([{ userId: "bot" }]);
  assert.equal(playerStatistics(readDb(), "bot").transactions, 0);
});

test("scoped commits do not serialize unrelated accounts and still commit the ledger atomically", () => {
  updateDb((db) => db.users.push({ id: "scope-other", pseudo: "ScopeOther", tokens: 10 }));
  const db = readDb(), other = db.users.find((user) => user.id === "scope-other");
  other.toJSON = () => { throw new Error("Unrelated serialization"); };
  const before = db.users[0].tokens;
  db.users[0].tokens += 3;
  db.transactions.push({ id: "scoped-ledger", userId: "a", amount: 3, balance: before + 3, reason: "adjustment", createdAt: "2026-09-03T12:00:00Z" });
  writeDb(db, { users: ["a"], rooms: [] });
  delete other.toJSON;
  assert.equal(JSON.parse(inspection.prepare("SELECT data FROM users WHERE id='a'").get().data).tokens, before + 3);
  assert.equal(inspection.prepare("SELECT count(*) n FROM transactions WHERE id='scoped-ledger'").get().n, 1);
  assert.throws(() => updateDb((state) => {
    state.users[0].tokens = 999;
    state.transactions.push({ id: "scoped-ledger", userId: "a", amount: 3 });
  }, { users: ["a"], rooms: [] }), /UNIQUE/);
  assert.equal(readDb().users[0].tokens, before + 3);
  // Keep later fixture assertions unchanged.
  inspection.prepare("DELETE FROM transactions WHERE id='scoped-ledger'").run();
  readDb().transactions.persistedCount--;
  updateDb((state) => { state.users = state.users.filter((user) => user.id !== "scope-other"); state.users[0].tokens = before; });
});

test("balance-only updates do not rewrite inventory, achievements, progression or Elo", () => {
  for (const table of ["user_inventory", "user_achievements", "achievement_progress", "user_game_xp", "user_game_elo"]) {
    for (const operation of ["DELETE", "INSERT", "UPDATE"]) inspection.exec(`CREATE TRIGGER no_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'unrelated child write'); END`);
  }
  try { updateDb((db) => { db.users[0].tokens++; }, { users: ["a"], rooms: [] }); }
  finally {
    for (const table of ["user_inventory", "user_achievements", "achievement_progress", "user_game_xp", "user_game_elo"]) for (const operation of ["DELETE", "INSERT", "UPDATE"]) inspection.exec(`DROP TRIGGER no_${table}_${operation}`);
  }
});

test("existing accounts are updated once and room upserts do not delete the room", () => {
  inspection.exec("CREATE TABLE user_write_count(n INTEGER); INSERT INTO user_write_count VALUES(0); CREATE TRIGGER count_user_updates AFTER UPDATE ON users BEGIN UPDATE user_write_count SET n=n+1; END");
  const before = readDb().users[0].tokens;
  try {
    updateDb((db) => { db.users[0].tokens++; }, { users: ["a"], rooms: [] });
    assert.equal(inspection.prepare("SELECT n FROM user_write_count").get().n, 1);
    updateDb((db) => { db.rooms.push({ id: "upsert-test", code: "UPSERT", gameId: "yahtzee", players: [] }); }, { users: [], rooms: ["upsert-test"] });
    inspection.exec("CREATE TRIGGER no_room_delete BEFORE DELETE ON rooms WHEN old.id='upsert-test' BEGIN SELECT RAISE(ABORT,'room rewrite'); END");
    updateDb((db) => { db.rooms.find((room) => room.id === "upsert-test").name = "Updated"; }, { users: [], rooms: ["upsert-test"] });
    assert.equal(JSON.parse(inspection.prepare("SELECT data FROM rooms WHERE id='upsert-test'").get().data).name, "Updated");
  } finally {
    inspection.exec("DROP TRIGGER count_user_updates; DROP TABLE user_write_count; DROP TRIGGER IF EXISTS no_room_delete");
    updateDb((db) => { db.users[0].tokens = before; db.rooms = db.rooms.filter((room) => room.id !== "upsert-test"); }, { users: ["a"], rooms: ["upsert-test"] });
  }
});

test("large archives are not retained or rewritten on unrelated writes", () => {
  const db = readDb();
  for (let i = 0; i < 5000; i++) db.transactions.push({ id: `large-${i}`, userId: "b", amount: 1, balance: i, reason: "adjustment", createdAt: "2026-09-03T12:00:00Z" });
  writeDb(db);
  assert.ok(readDb().transactions instanceof Archive);
  assert.equal(readDb().transactions.pending.length, 0);
  inspection.exec("CREATE TRIGGER detect_rewrite BEFORE DELETE ON transactions BEGIN SELECT RAISE(FAIL, 'archive rewrite'); END");
  updateDb((state) => { state.users[0].tokens++; });
  inspection.exec("DROP TRIGGER detect_rewrite");
  assert.deepEqual(databaseHealth().archiveCacheRows, { history: 0, transactions: 0, communityEventActions: 0, communityEventPotEntries: 0 });
  assert.equal(archiveRows(readDb().transactions, { userId: "b" }, { descending: true, limit: 20, offset: 20 }).length, 20);
  assert.equal(playerStatistics(readDb(), "a").transactions, 3);
});

test("indexed leaderboards preserve ranking, seasons, scores and pending results", () => {
  const db = readDb();
  const gameIds = ["yahtzee", "belote", "president", "shut-the-box", "blackjack"];
  for (let i = 0; i < 35; i++) {
    const gameId = gameIds[i % gameIds.length];
    db.history.push({ ...original.history[0], id: `ranking-${i}`, gameId, finishedAt: i < 10 ? "2025-02-10T12:00:00Z" : "2026-09-04T22:30:00Z", winners: i % 2 ? ["a"] : ["bot"], ranking: [{ id: "a", score: gameId === "president" ? 1000 : gameId === "shut-the-box" ? -i : 25 - i }], ...(gameId === "belote" && i > 10 ? { leaderboardScores: { a: 100 + i } } : {}), payouts: { a: i * 3 } });
  }
  writeDb(db);
  const now = new Date("2026-09-05T12:00:00Z");
  const compare = () => {
    const state = readDb();
    const plain = { users: state.users, history: [...state.history], transactions: [...state.transactions] };
    const iterator = state.history[Symbol.iterator];
    state.history[Symbol.iterator] = function* () { throw new Error("Full archive scan forbidden"); };
    try {
      for (const period of [{ period: "all" }, { period: "day", date: "2026-09-05" }, { period: "season", season: "2025-Q1" }]) {
        for (const game of ["all", ...gameIds]) for (const metric of ["wins", "gains", "record", game === "all" ? "balance" : "score"]) {
          const query = { ...period, game, metric };
          assert.deepEqual(buildLeaderboard(state, query, "a", now, gameIds), buildLeaderboard(plain, query, "a", now, gameIds), JSON.stringify(query));
        }
      }
    } finally { state.history[Symbol.iterator] = iterator; }
  };
  compare();
  readDb().history.push({ ...original.history[0], id: "pending-ranking", payouts: { a: 1000 } });
  compare();
  writeDb(readDb());
});

test("ledger pagination searches all records, scopes users and caps payloads", () => {
  updateDb((db) => {
    for (let i = 0; i < 130; i++) db.history.push({ ...original.history[0], id: `page-${i}`, name: i === 0 ? "Find oldest" : "Table", finishedAt: `2026-09-06T12:00:${String(i % 60).padStart(2, "0")}Z` });
  });
  const db = readDb();
  const first = ledgerPage(db.history, "a", { limit: 40 });
  const second = ledgerPage(db.history, "a", { limit: 40, offset: 40 });
  assert.equal(first.rows.length, 40);
  assert.equal(second.rows.length, 40);
  assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 80);
  assert.equal(first.total, playerStatistics(db, "a").gamesPlayed);
  assert.equal(ledgerPage(db.history, "a", { search: "Find oldest" }).rows[0].id, "page-0");
  assert.equal(ledgerPage(db.history, "missing", {}).total, 0);
  assert.equal(ledgerPage(db.transactions, "b", { limit: 999999 }).rows.length, 100);
  assert.equal(ledgerPage(db.transactions, "a", { event: "shop-purchase", direction: "debit" }).total, 1);
  assert.equal(ledgerPage(db.transactions, "a", { search: "bonus", searchReasons: "daily-claim" }).total, 1);
  const plan = inspection.prepare("EXPLAIN QUERY PLAN SELECT * FROM history_members WHERE user_id = ? AND day = ?").all("a", "2026-09-02");
  assert.match(JSON.stringify(plan), /idx_history_members_user_day/);
});

test("event quotas and duplicate requests use indexed rows, including pending actions", () => {
  const actions = [
    { id: "ea1", eventId: "e", userId: "a", createdAt: "2026-09-04T21:30:00Z", paid: false, requestId: "request-1" },
    { id: "ea2", eventId: "e", userId: "a", createdAt: "2026-09-04T22:30:00Z", paid: false },
    { id: "ea3", eventId: "e", userId: "a", createdAt: "2026-09-05T11:30:00Z", paid: true },
    { id: "ea4", eventId: "other", userId: "a", createdAt: "2026-09-05T11:30:00Z", paid: false },
    { id: "ea5", eventId: "e", userId: "b", createdAt: "2026-09-05T11:30:00Z", paid: false }
  ];
  updateDb((db) => { db.communityEventActions.push(...actions); });
  const now = new Date("2026-09-05T11:45:00Z");
  assert.deepEqual(eventActionUsage(readDb().communityEventActions, "e", "a", now, 60), eventActionUsage(actions, "e", "a", now, 60));
  assert.equal(archiveRows(readDb().communityEventActions, { eventId: "e", userId: "a", requestId: "request-1" })[0].id, "ea1");
  const pending = { id: "ea6", eventId: "e", userId: "a", createdAt: now.toISOString(), paid: false };
  readDb().communityEventActions.push(pending);
  assert.deepEqual(eventActionUsage(readDb().communityEventActions, "e", "a", now, 60), eventActionUsage([...actions, pending], "e", "a", now, 60));
  writeDb(readDb());
  assert.equal(eventActionUsage(readDb().communityEventActions, "e", "a", now, 60).periodFree, 1);
});

test("invalid legacy data aborts migration without partial normalization", () => {
  const brokenFile = path.join(dir, "broken.sqlite");
  const broken = new DatabaseSync(brokenFile);
  broken.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO meta VALUES ('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT,pseudo TEXT,guest INTEGER); INSERT INTO users VALUES ('bad','invalid JSON','Bad',0)");
  broken.close();
  const moduleUrl = new URL("../src/db.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(moduleUrl)})`], { env: { ...process.env, SQLITE_PATH: brokenFile }, encoding: "utf8" });
  assert.notEqual(child.status, 0);
  const check = new DatabaseSync(brokenFile, { readOnly: true });
  assert.equal(check.prepare("SELECT data FROM users WHERE id = 'bad'").get().data, "invalid JSON");
  assert.equal(check.prepare("SELECT value FROM meta WHERE key = 'storage-version'").get(), undefined);
  assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name = 'user_inventory'").get(), undefined);
  check.close();
  assert.ok(fs.readdirSync(dir).some((name) => name.startsWith("broken.sqlite.before-v2")));
});
