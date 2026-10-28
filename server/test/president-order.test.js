import test from "node:test";
import assert from "node:assert/strict";
import { createPresidentState, applyPresidentAction } from "../src/games/engines/president.js";
import { createDeck, shuffle } from "../src/games/shared.js";

const players = [{ id: "a", pseudo: "A" }, { id: "b", pseudo: "B" }, { id: "c", pseudo: "C" }];
test("President preserves the shuffled round-robin deal order", (t) => {
  t.mock.method(Math, "random", () => 0);
  const deck = shuffle(createDeck());
  const state = createPresidentState(players);
  for (let seat = 0; seat < players.length; seat++) assert.deepEqual(state.hands[players[seat].id], deck.filter((_, i) => i % players.length === seat));
  assert.equal(new Set(Object.values(state.hands).flat().map(card => `${card.rank}:${card.suit}`)).size, 52);
});

test("manual selection order removes exactly the requested identities and keeps the remaining order", () => {
  const state = createPresidentState(players);
  const hand = [{ rank: "8", suit: "S" }, { rank: "3", suit: "H" }, { rank: "8", suit: "D" }, { rank: "A", suit: "C" }];
  state.hands.a = structuredClone(hand);
  applyPresidentAction(state, "a", { type: "play", cards: [hand[2], hand[0]] });
  assert.deepEqual(state.hands.a, [hand[1], hand[3]]);
  assert.deepEqual(state.pile[0].cards, [hand[2], hand[0]]);
});
