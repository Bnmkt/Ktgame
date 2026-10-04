import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { Archive, archiveRows } from "../src/storage/archives.js";
import { playerStatistics } from "../src/services/player-statistics.js";
import { buildLeaderboard } from "../src/services/leaderboards.js";
import { ledgerPage } from "../src/storage/ledger.js";
import { eventActionUsage } from "../src/storage/event-usage.js";

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
const { readDb, writeDb, updateDb, databaseHealth, syncCatalogs, closeDatabase } = await import("../src/db.js");
const inspection = new DatabaseSync(file);
after(() => { inspection.close(); closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }); });

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
