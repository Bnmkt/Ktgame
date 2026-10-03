import test from "node:test";
import assert from "node:assert/strict";
import { playerActionExpected, turnSoundKey } from "../src/features/games/turn-notice.js";

const players = [{ id: "a" }, { id: "b" }];
const room = { players, state: { gameId: "president", players, currentPlayerIndex: 0 } };
test("turn alerts exclude observers, pauses, completed turns and finished games", () => {
  assert.equal(playerActionExpected(room, "a"), true);
  assert.equal(playerActionExpected(room, "b"), false);
  assert.equal(playerActionExpected(room, "outsider"), false);
  assert.equal(playerActionExpected({ ...room, spectator: true }, "a"), false);
  assert.equal(playerActionExpected({ ...room, finished: true }, "a"), false);
  assert.equal(playerActionExpected({ ...room, pacing: { id: "pause" } }, "a"), false);
  assert.equal(playerActionExpected({ ...room, state: { ...room.state, finished: true } }, "a"), false);
  assert.equal(playerActionExpected({ ...room, state: { ...room.state, finishedOrder: ["a"] } }, "a"), false);
});
test("solo and simultaneous games alert only when the player can act", () => {
  const withState = (state) => ({ ...room, state: { players, ...state } });
  for (const gameId of ["golf-solitaire", "accordion"]) assert.equal(playerActionExpected(withState({ gameId }), "a"), true);
  assert.equal(playerActionExpected(withState({ gameId: "blackjack", bets: { a: 10 } }), "a"), false);
  assert.equal(playerActionExpected(withState({ gameId: "blackjack", bets: { a: 10 } }), "b"), true);
  assert.equal(playerActionExpected(withState({ gameId: "blackjack", bets: { a: 10, b: 10 } }), "a"), true);
  assert.equal(playerActionExpected(withState({ gameId: "blackjack", bets: { a: 10, b: 10 }, completedPlayerIds: ["a"] }), "a"), false);
  assert.equal(playerActionExpected(withState({ gameId: "bataille", submittedPlayerIds: ["b"] }), "a"), true);
  assert.equal(playerActionExpected(withState({ gameId: "bataille", resolutionEndsAt: 10 }), "a"), false);
  assert.equal(playerActionExpected(withState({ gameId: "texas-holdem", currentPlayerIndex: 0, allInPlayerIds: ["a"] }), "a"), false);
});
test("rerolls keep their turn identity while scored turns and poker streets change it", () => {
  const dice = { gameId: "yahtzee", scores: {} };
  assert.equal(turnSoundKey(dice), turnSoundKey({ ...dice, dice: [1, 2, 3, 4, 5], rollsLeft: 1 }));
  assert.notEqual(turnSoundKey(dice), turnSoundKey({ ...dice, scores: { a: { chance: 10 } } }));
  const poker = { gameId: "texas-holdem", handNumber: 1, street: "flop", turnStartedAt: 100 };
  assert.notEqual(turnSoundKey(poker), turnSoundKey({ ...poker, street: "turn" }));
  assert.notEqual(turnSoundKey(poker), turnSoundKey({ ...poker, turnStartedAt: 200 }));
});
