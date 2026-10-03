import test from "node:test";
import assert from "node:assert/strict";
import { pokerAllInDecision } from "../src/features/games/poker-notice.js";

const state = { gameId: "texas-holdem", players: [{ id: "a" }, { id: "b" }], currentBet: 100, streetBets: { a: 20, b: 100 }, stacks: { a: 200, b: 0 }, allInPlayerIds: ["b"], foldedPlayerIds: [], handNumber: 1, street: "preflop", turnStartedAt: 1000 };
test("all-in notice only requires a real decision on the player's turn", () => {
  assert.equal(pokerAllInDecision(state, "a", false), null);
  assert.equal(pokerAllInDecision({ ...state, finished: true }, "a", true), null);
  assert.equal(pokerAllInDecision({ ...state, nextHandAt: 10 }, "a", true), null);
  assert.equal(pokerAllInDecision({ ...state, streetBets: { a: 100, b: 100 } }, "a", true), null);
  assert.equal(pokerAllInDecision({ ...state, streetBets: { a: 20, b: 0 } }, "a", true), null);
  assert.equal(pokerAllInDecision({ ...state, allInPlayerIds: ["a", "b"] }, "a", true), null);
  assert.equal(pokerAllInDecision({ ...state, foldedPlayerIds: ["a"] }, "a", true), null);
  const notice = pokerAllInDecision(state, "a", true);
  assert.equal(notice.amount, 80);
  assert.equal(notice.ownAllIn, false);
  assert.deepEqual(notice.opponents, [{ id: "b" }]);
  assert.equal(pokerAllInDecision({ ...state, stacks: { a: 40 } }, "a", true).amount, 40);
  assert.equal(pokerAllInDecision({ ...state, stacks: { a: 40 } }, "a", true).ownAllIn, true);
});
