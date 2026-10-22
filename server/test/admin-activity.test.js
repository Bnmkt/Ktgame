import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { adminActivity, registrationDate } from "../src/services/admin-activity.js";
import { Archive, archiveDays } from "../src/storage/archives.js";

const now = new Date("2026-10-22T12:00:00Z");
const account = (id, createdAt, more = {}) => ({ id, createdAt, tokens: 100, ...more });
const fixture = () => ({
  users: [account("old", "2025-01-01T12:00:00Z"), account("missing"), account("recent", "2026-10-15T22:00:00Z"), account("guest", now.toISOString(), { guest: true })],
  history: [], transactions: [], rooms: []
});

test("seven calendar days exclude old and unknown registrations and use Brussels midnight", () => {
  const db = fixture();
  db.users.push(account("outside", "2026-10-15T21:59:59Z"), account("today", "2026-10-22T10:00:00Z"), account("future", "2026-10-22T18:00:00Z"), account("invalid", "not-a-date"));
  const result = adminActivity(db, 7, { now });
  assert.deepEqual(result.period, { days: 7, from: "2026-10-16", to: "2026-10-22", timeZone: "Europe/Brussels" });
  assert.equal(result.users.total, 7);
  assert.equal(result.users.newToday, 1);
  assert.equal(result.users.new7d, 2);
  assert.equal(result.users.newInPeriod, 2);
  assert.equal(result.users.unknownRegistrationDates, 3);
  assert.equal(result.activity.daily.reduce((sum, row) => sum + row.signups, 0), 2);
  assert.deepEqual(result.recentUsers.map((row) => row.id), ["today", "recent", "outside", "old"]);
});

test("legacy dates use genuine signup grants, never gameplay-reset grants", () => {
  const db = fixture();
  db.transactions.push({ userId: "missing", reason: "signup-bonus", note: "Réinitialisation globale du casino", createdAt: now.toISOString() });
  assert.equal(registrationDate(db.users[1], db.transactions, now), null);
  db.transactions.push({ userId: "missing", reason: "signup-bonus", createdAt: "2025-02-01T12:00:00Z" });
  assert.equal(registrationDate(db.users[1], db.transactions, now), "2025-02-01T12:00:00.000Z");
  assert.equal(adminActivity(db, 7, { now }).users.newInPeriod, 1);
});

test("live presence, enabled accounts and unique game participants are distinct", () => {
  const db = fixture(); db.users[0].active = false;
  const players = [{ id: "recent" }, { id: "old" }, { id: "guest", guest: true }, { id: "bot", isBot: true }, { id: "deleted" }];
  db.history = [
    { gameId: "yahtzee", finishedAt: "2026-10-20T12:00:00Z", players },
    { gameId: "yahtzee", finishedAt: "2026-10-22T11:00:00Z", ranked: { matchId: "ranked" }, players },
    { gameId: "yahtzee", finishedAt: now.toISOString(), ranked: { cancelled: { reason: "cancelled" } }, players },
    { gameId: "yahtzee", players },
    { gameId: "yahtzee", finishedAt: "2026-10-22T19:00:00Z", players }
  ];
  db.rooms = [{ id: "one", players }, { id: "two", players: [players[0]], state: {} }, { finished: true, players }];
  const result = adminActivity(db, 7, { now, isOnline: (id) => id === "recent" });
  assert.equal(result.users.online, 1); assert.equal(result.users.active, 2);
  assert.equal(result.rooms.active, 2); assert.equal(result.rooms.seatedPlayers, 2);
  assert.equal(result.rooms.seatedGuests, 2); assert.equal(result.rooms.seatedBots, 1);
  assert.equal(result.activity.games, 2); assert.equal(result.activity.cancelled, 1);
  assert.equal(result.activity.uniquePlayers, 2); assert.equal(result.activity.gamesToday, 1);
  assert.equal(result.activity.rankedGames, 1);
  assert.deepEqual(result.activity.topGames, [{ id: "yahtzee", games: 2, players: 2 }]);
});

test("economy excludes guest, deleted, undated and future movements; totals match the daily series", () => {
  const db = fixture();
  db.transactions = [
    { userId: "old", amount: 60, createdAt: now.toISOString() },
    { userId: "recent", amount: -20, createdAt: "2026-10-20T12:00:00Z" },
    ...["guest", "bot", "deleted"].map((userId) => ({ userId, amount: 10000, createdAt: now.toISOString() })),
    { userId: "old", amount: 100 },
    { userId: "old", amount: 100, createdAt: "2026-10-22T18:00:00Z" }
  ];
  const result = adminActivity(db, 7, { now });
  assert.equal(result.economy.circulatingTokens, 300);
  assert.equal(result.economy.transactions, 2); assert.equal(result.economy.credits, 60); assert.equal(result.economy.debits, 20);
  assert.equal(result.economy.transactionsToday, 1);
  assert.equal(result.activity.daily.reduce((sum, row) => sum + row.transactions, 0), 2);
});

test("period selection defaults safely and keeps the requested number of calendar days across DST", () => {
  const db = fixture();
  assert.equal(adminActivity(db, 1, { now }).period.from, "2026-10-22");
  assert.equal(adminActivity(db, "30", { now }).activity.daily.length, 30);
  assert.equal(adminActivity(db, 90000, { now }).period.days, 7);
  const result = adminActivity(db, 7, { now: new Date("2026-10-26T10:00:00Z") });
  assert.deepEqual(result.activity.daily.map((row) => row.date), ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
});

test("archive date filters reject undated pending entries and stale persisted day indexes", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE history(id TEXT, finished_at TEXT, day TEXT, data TEXT)");
    const insert = db.prepare("INSERT INTO history VALUES(?,?,?,?)");
    for (const [id, finishedAt] of [["missing", null], ["old", "2025-01-01T12:00:00Z"], ["valid", "2026-10-22T10:00:00Z"]]) insert.run(id, finishedAt, "2026-10-22", JSON.stringify({ id, finishedAt }));
    const archive = new Archive(db, "history", (row) => JSON.parse(row.data), { day: "day" });
    archive.push({ id: "pending-missing" }, { id: "pending-valid", finishedAt: now.toISOString() });
    assert.deepEqual(archiveDays(archive, "2026-10-22", "2026-10-22").map((row) => row.id), ["valid", "pending-valid"]);
    assert.deepEqual(archiveDays([{ id: "missing" }], "2000-01-01", "2100-01-01"), []);
  } finally { db.close(); }
});
