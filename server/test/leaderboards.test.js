import test from "node:test";
import assert from "node:assert/strict";
import { buildLeaderboard, leaderboardPeriod } from "../src/services/leaderboards.js";

const now = new Date("2026-09-23T12:00:00Z");
const gameIds = ["yahtzee", "blackjack", "belote", "president", "shut-the-box", "accordion", "golf-solitaire"];
const users = ["a", "b", "c"].map((id, index) => ({ id, tokens: 1000 - index * 100, createdAt: "2026-01-01T12:00:00Z" }));
const match = (id, date, props = {}) => ({ id, roomId: "replayed-room", gameId: "yahtzee", finishedAt: date, players: users.map(({ id }) => ({ id })), winners: ["a"], ranking: [{ id: "a", score: 150 }, { id: "b", score: 210 }, { id: "c", score: 100 }], payouts: { a: 60, b: 30, c: 10 }, ...props });
const fixture = () => ({ users: structuredClone(users), history: [match("old", "2026-06-30T21:59:59Z"), match("quarter", "2026-06-30T22:00:00Z"), match("yesterday", "2026-09-22T21:59:59Z"), match("today", "2026-09-22T22:00:00Z", { winners: ["b"], payouts: { b: 300 } })], transactions: [] });
const run = (db, query) => buildLeaderboard(db, query, "c", now, gameIds);

test("quarter and day boundaries follow Brussels, including DST", () => {
  assert.equal(leaderboardPeriod({ period: "season" }, now).season, "2026-Q3");
  assert.equal(leaderboardPeriod({ period: "day" }, new Date("2026-03-29T22:30:00Z")).date, "2026-03-30");
  assert.equal(run(fixture(), { metric: "wins", period: "season" }).rows[0].value, 2);
  assert.deepEqual(run(fixture(), { metric: "wins", period: "day" }).rows.map((row) => row.id), ["b"]);
  assert.equal(run(fixture(), { metric: "wins", period: "season", season: "2026-Q2" }).rows[0].value, 1);
});

test("invalid or future periods and incompatible categories are rejected", () => {
  for (const query of [{ period: "bad" }, { period: "day", date: "2026-02-30" }, { period: "day", date: "2027-01-01" }, { season: "2026-Q5" }, { season: "2026-Q4" }, { season: "0000-Q1" }, { metric: "score" }, { game: "yahtzee", metric: "balance" }, { game: "missing" }, { metric: "secret" }]) assert.throws(() => run(fixture(), query));
});

test("replays count independently, duplicated history IDs do not", () => {
  const db = fixture(); db.history.push(db.history[0]);
  const result = run(db, { period: "all", metric: "wins" });
  assert.equal(result.rows[0].value, 3); assert.equal(result.rows[0].games, 4);
});

test("paid gains combine room and blackjack payouts exactly once and exclude unrelated rewards", () => {
  const db = fixture(); db.history = [match("bj", now.toISOString(), { gameId: "blackjack", payouts: { a: 50 }, blackjackPayouts: { a: 150 } }), match("y", now.toISOString(), { payouts: { a: 40 } })];
  db.transactions = [{ userId: "a", amount: 999999, reason: "signup-bonus", createdAt: now.toISOString(), balance: 999999 }];
  assert.equal(run(db, { metric: "gains", period: "all" }).rows[0].value, 240);
  assert.equal(run(db, { metric: "record", period: "all" }).rows[0].value, 200);
  assert.equal(run(db, { metric: "gains", game: "blackjack" }).rows[0].value, 200);
});

test("score ordering respects lower-is-better games and skips absent legacy scores", () => {
  for (const gameId of ["shut-the-box", "golf-solitaire", "accordion"]) {
    const db = fixture(); db.history = [match("score", now.toISOString(), { gameId, ranking: [{ id: "a", score: -8 }, { id: "b", score: 0 }, { id: "c", score: -999 }] })];
    const result = run(db, { metric: "score", game: gameId });
    assert.equal(result.rows[0].id, "b"); assert.equal(result.rows[0].value, 0); assert.equal(result.rows.length, 2);
  }
  const db = fixture(); db.history = [match("pres", now.toISOString(), { gameId: "president", ranking: [{ id: "a", score: 999 }, { id: "b", score: 1000 }] })];
  assert.equal(run(db, { metric: "score", game: "president" }).rows[0].value, 1);
  db.history = [match("belote-old", now.toISOString(), { gameId: "belote" }), match("belote-new", now.toISOString(), { gameId: "belote", leaderboardScores: { a: 102, b: 110 } })];
  const belote = run(db, { metric: "score", game: "belote" });
  assert.equal(belote.rows[0].value, 110); assert.equal(belote.rows.length, 2);
});

test("the best score is a record, not a sum; busted blackjack hands are excluded", () => {
  const result = run(fixture(), { metric: "score", game: "yahtzee" });
  assert.equal(result.rows[0].id, "b"); assert.equal(result.rows[0].value, 210);
  const db = fixture(); db.history = [match("bj", now.toISOString(), { gameId: "blackjack", ranking: [{ id: "a", score: -24 }, { id: "b", score: 21 }] })];
  assert.deepEqual(run(db, { metric: "score", game: "blackjack" }).rows.map((row) => row.id), ["b"]);
});

test("wealth uses current funds for live periods and the closing balance for archives", () => {
  const db = fixture();
  db.users.push({ id: "new", tokens: 9999, createdAt: "2026-07-02T12:00:00Z" });
  db.transactions = [
    { userId: "a", balance: 200, createdAt: "2026-06-29T12:00:00Z" },
    { userId: "a", balance: 300, createdAt: "2026-06-30T21:59:59Z" },
    { userId: "a", balance: 8000, createdAt: "2026-06-30T22:00:00Z" },
    { userId: "b", balance: 400, createdAt: "2026-02-01T12:00:00Z" }
  ];
  const archived = run(db, { metric: "balance", season: "2026-Q2" });
  assert.deepEqual(archived.rows.map((row) => [row.id, row.value]), [["b", 400], ["a", 300]]);
  assert.equal(archived.balanceAt, "2026-06-30");
  assert.equal(run(db, { metric: "balance", period: "all" }).rows[0].value, 9999);
  assert.equal(run(db, { metric: "balance", period: "day" }).rows[0].value, 9999);
});

test("only active registered humans rank, at most 100 rows, with self beyond top 100", () => {
  const db = fixture(); db.users = Array.from({ length: 105 }, (_, index) => ({ id: `p${index}`, tokens: 1000 - index }));
  db.users.push(...[{ id: "guest", guest: true }, { id: "bot", isBot: true }, { id: "banned", active: false }].map((user) => ({ ...user, tokens: 99999 })));
  const result = buildLeaderboard(db, { period: "all" }, "p104", now, gameIds);
  assert.equal(result.rows.length, 100); assert.equal(result.total, 105); assert.equal(result.self.rank, 105);
  assert.equal(result.rows[0].id, "p0");
});

test("ties share a competition rank and sorting does not mutate the database", () => {
  const db = fixture(); db.users[1].tokens = 1000;
  const original = structuredClone(db), result = run(db, { period: "all" });
  assert.deepEqual(result.rows.map((row) => row.rank), [1, 1, 3]);
  assert.deepEqual(db, original);
});
