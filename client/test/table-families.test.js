import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../../server/src/games/engines.js";
import { tableDealSequence, familyTableGames, familyTurnHint } from "../src/features/games/table-families.js";
import { tableInterfaceGames, tableRoundInfo } from "../src/features/games/table-interface.js";

const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, pseudo: `Player ${i}` }));
test("Belote presentation follows the engine's two packets, starting after the dealer", () => {
  const state = createGameState("belote", players), before = JSON.stringify(state);
  const sequence = tableDealSequence(state);
  assert.equal(sequence.length, 21);
  assert.deepEqual(sequence.slice(0, 6), ["p0:0", "p0:1", "p0:2", "p1:0", "p1:1", "p1:2"]);
  assert.deepEqual(sequence.slice(12, 16), ["p0:3", "p0:4", "p1:3", "p1:4"]);
  assert.equal(sequence.at(-1), "turned:0");
  assert.equal(new Set(sequence).size, 21);
  assert.equal(JSON.stringify(state), before, "Presentation never mutates dealt cards");
});
test("all card deal timelines contain exactly the already distributed cards", () => {
  for (const game of ["velvet-ruse", "golf-solitaire", "accordion", "bataille"]) {
    const state = createGameState(game, players.slice(0, ["accordion", "golf-solitaire"].includes(game) ? 1 : 2)), before = JSON.stringify(state);
    const sequence = tableDealSequence(state);
    const expected = game === "velvet-ruse" ? Object.values(state.hands).reduce((n, hand) => n + hand.length, 2) : game === "golf-solitaire" ? state.tableau.flat().length + 1 : 52;
    assert.equal(sequence.length, expected, game);
    if (game === "bataille") { assert.ok(sequence.slice(0, 26).every(slot => slot === "p0:stock")); assert.ok(sequence.slice(26).every(slot => slot === "p1:stock")); }
    assert.equal(JSON.stringify(state), before);
  }
});
test("each of the fifteen tables has a HUD and family-specific rounds or phase information", () => {
  assert.equal(tableInterfaceGames.size, 15);
  for (const game of familyTableGames) {
    const state = createGameState(game, players.slice(0, game === "belote" ? 4 : ["accordion", "golf-solitaire"].includes(game) ? 1 : 2));
    const info = tableRoundInfo(state);
    assert.ok(info.label && info.value !== undefined);
    assert.notEqual(info.value, "10000 pts", `${game} must not inherit Farkle's target`);
    assert.ok(familyTurnHint(state, "p0"));
  }
});
