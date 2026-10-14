import test from "node:test";
import assert from "node:assert/strict";
import { classicResults } from "../src/features/games/classic-completion.js";

const players = [{ id: "self", pseudo: "Moi" }, { id: "other", pseudo: "Autre" }, { id: "bot", pseudo: "IA", isBot: true }];
function room(gameId, scores, extra = {}) {
  return { gameId, stake: 10, players, state: { gameId, finished: true, players,
    winners: ["self"], ranking: scores.map((score, index) => ({ ...players[index], score })), roomPayouts: { self: 20 }, ...extra } };
}

test("classic recap separates net profit from returned funds and skips bot finances", () => {
  const rows = classicResults(room("yahtzee", [300, 250, 200]));
  assert.equal(rows[0].recovered, 20); assert.equal(rows[0].net, 10);
  assert.equal(rows[1].net, -10); assert.equal(rows[2].net, null);
});
test("equal scores share a place without overriding winner eligibility", () => {
  const rows = classicResults(room("yahtzee", [300, 300, 200], { winners: ["self", "other"] }));
  assert.deepEqual(rows.map((row) => row.rank), [1, 1, 3]);
});
test("solo and lower-is-better scores are positive and President uses places", () => {
  for (const id of ["shut-the-box", "golf-solitaire", "accordion"]) assert.equal(classicResults(room(id, [-3, -12]))[0].score, 3);
  assert.deepEqual(classicResults(room("president", [1000, 999, 998])).map((row) => row.score), [1, 2, 3]);
});
test("Blackjack includes doubled bets, push and negative bust ordering scores", () => {
  const rows = classicResults(room("blackjack", [21, -24], { bets: { self: 100, other: 200 }, payouts: { self: 100, other: 0 }, winners: [] }));
  assert.equal(rows[0].push, true); assert.equal(rows[0].net, 10);
  assert.equal(rows[1].score, 24); assert.equal(rows[1].spent, 210); assert.equal(rows[1].net, -210);
});
test("421 accounts for cumulative paid rerolls, not the current turn counter", () => {
  const game = room("421", [1500, 800], { modifiers: { paidRerollsEnabled: true }, paidRerollSpent: { self: 75 }, paidRerollsUsed: { self: 0 } });
  assert.equal(classicResults(game)[0].net, -65);
  delete game.state.paidRerollSpent;
  assert.equal(classicResults(game)[0].net, null, "Old receipts cannot invent an accurate net result");
});
test("Poker uses cash-out rather than virtual stacks as the recovered amount", () => {
  const game = room("texas-holdem", [2000, 0]); game.stake = 1000; game.state.roomPayouts.self = 1600;
  assert.equal(classicResults(game)[0].net, 600);
});
test("ranked and unfinished games are left to their own views", () => {
  const game = room("yahtzee", [300]); game.ranked = {};
  assert.deepEqual(classicResults(game), []); delete game.ranked; game.state.finished = false;
  assert.deepEqual(classicResults(game), []);
});
