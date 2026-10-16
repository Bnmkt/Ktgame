import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createGameState } from "../src/games/engines.js";
import { spectatorState } from "../src/games/spectator-state.js";

const players = [{ id: "a", pseudo: "A", tokens: 10000 }, { id: "b", pseudo: "B", tokens: 10000 }];
test("successful dice actions carry a public audio cue, including identical rerolls", () => {
  const state = createGameState("yahtzee", players);
  applyAction(state, "a", { type: "roll" });
  const first = state.logs.at(-1).id;
  assert.equal(state.logs.at(-1).cue, "dice");
  applyAction(state, "a", { type: "roll", keepIndexes: [0, 1, 2, 3, 4] });
  assert.notEqual(state.logs.at(-1).id, first);
  assert.equal(spectatorState(state).logs.at(-1).cue, "dice");
  applyAction(state, "a", { type: "score", category: "chance" });
  assert.equal(state.logs.at(-1).cue, undefined);
});
test("card draws carry a cue without revealing the card to spectators", () => {
  const state = createGameState("blackjack", players);
  applyAction(state, "a", { type: "bet", amount: 50 });
  assert.equal(state.logs.at(-1).cue, "card");
  const safe = spectatorState(state);
  assert.equal(safe.logs.at(-1).cue, "card");
  assert.equal(safe.logs.at(-1).text, "engage une mise.");
  assert.ok(safe.hands.a.every(card => card === null));
});
