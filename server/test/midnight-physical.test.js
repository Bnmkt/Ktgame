import assert from "node:assert/strict";
import test from "node:test";
import { createMidnightDiceState, applyMidnightDiceAction, midnightContractOffers, midnightDiceBotAction } from "../src/games/engines/midnight-dice.js";
import { defaultMidnightContracts, midnightExamples, evaluateMidnightDefinition, publicMidnightOptions, midnightRankingScore } from "../../client/src/features/games/midnightDice/contracts.js";
import { normalizeMidnightCardDesign, normalizeMidnightArtwork } from "../../client/src/features/games/midnightDice/appearance.js";
import { spectatorState } from "../src/games/spectator-state.js";
import { normalizeGameModifiers } from "../src/games/modifiers.js";

const roster = count => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, pseudo: `Player ${index}` }));
function chooseAll(state) {
  while (state.phase === "contract") {
    const player = state.players[state.currentPlayerIndex];
    applyMidnightDiceAction(state, player.id, midnightDiceBotAction(state, player));
  }
}
function finishRound(state) {
  const round = state.round;
  chooseAll(state);
  let guard = 0;
  while (!state.finished && state.round === round && guard++ < 50) applyMidnightDiceAction(state, state.players[state.currentPlayerIndex].id, { type: "draft", index: 0 });
  assert.ok(guard < 50);
}

test("new games keep three personal offers and draw exactly one each round, including recycled small catalogues", () => {
  for (const count of [2, 6, 8]) for (const size of [6, 12]) {
    const state = createMidnightDiceState(roster(count), { midnightContracts: defaultMidnightContracts.slice(0, size), gameModifiers: { rounds: 8, firstPlayer: "first-seat" } });
    for (let round = 1; round <= 8; round++) {
      const previous = structuredClone(state.privateContractOffers);
      assert.ok(Object.values(previous).every(offers => offers.length === 4 && new Set(offers).size === 4));
      assert.ok(Object.values(state.discardRemaining).every(remaining => remaining === 2));
      chooseAll(state);
      const choices = { ...state.secretContracts };
      assert.ok(Object.values(state.privateContractOffers).every(offers => offers.length === 3));
      finishRound(state);
      if (state.finished) break;
      for (const player of state.players) {
        const held = previous[player.id].filter(id => id !== choices[player.id]), next = midnightContractOffers(state, player.id);
        assert.equal(next.length, 4); assert.equal(next.filter(id => !held.includes(id)).length, 1);
        assert.ok(held.every(id => next.includes(id))); assert.ok(!next.includes(choices[player.id]));
      }
      assert.equal(state.startingPlayerIndex, round % count);
    }
    assert.equal(state.finished, true); assert.equal(state.revealedContracts.length, count * 8);
  }
});

test("shared mode replaces the cards played by the table and handles an exhausted six-card catalogue", () => {
  const state = createMidnightDiceState(roster(6), { midnightContracts: defaultMidnightContracts.slice(0, 6), gameModifiers: { rounds: 8, individualContracts: false, firstPlayer: "first-seat" } });
  for (let round = 1; round <= 8; round++) { finishRound(state); if (!state.finished) assert.equal(new Set(state.contractOffers).size, 4); }
  assert.equal(state.finished, true);
});

test("rerolls share a two-use budget for the whole round and preserve market identities, including equal-value rolls", () => {
  const state = createMidnightDiceState(roster(2), { gameModifiers: { firstPlayer: "first-seat" } });
  chooseAll(state);
  const ids = [...state.marketIds], length = state.market.length;
  for (let i = 0; i < 2; i++) applyMidnightDiceAction(state, "p0", { type: "discard-market", index: 1 });
  assert.equal(state.market.length, length); assert.deepEqual(state.marketIds, ids);
  assert.equal(state.marketRollKeys[ids[1]], 2);
  assert.throws(() => applyMidnightDiceAction(state, "p0", { type: "discard-market", index: 1 }), /plus de défausse/);
  applyMidnightDiceAction(state, "p0", { type: "draft", index: 1 });
  assert.deepEqual(state.marketIds, ids.filter((_, index) => index !== 1));
  assert.equal(state.market.length, length - 1);
  applyMidnightDiceAction(state, "p1", { type: "draft", index: 0 });
  assert.equal(state.currentPlayerIndex, 0); assert.equal(state.discardRemaining.p0, 0);
  assert.throws(() => applyMidnightDiceAction(state, "p0", { type: "discard-market", index: 0 }), /plus de défausse/);
});

test("first player and random options are resolved once by the server and survive serialization", t => {
  assert.equal(normalizeGameModifiers("midnight-dice").firstPlayer, "random");
  assert.equal(normalizeGameModifiers("midnight-dice").victory, "highest");
  t.mock.method(Math, "random", () => .9);
  const state = createMidnightDiceState(roster(6), { gameModifiers: { firstPlayer: "midnight", victory: "midnight" } });
  assert.equal(state.resolvedOptions.firstPlayer, "first-seat"); assert.equal(state.resolvedOptions.victory, "contracts");
  const randomSeat = createMidnightDiceState(roster(6)); assert.equal(randomSeat.currentPlayerIndex, 5);
  const restored = JSON.parse(JSON.stringify(state)); finishRound(restored);
  assert.deepEqual(restored.resolvedOptions, state.resolvedOptions);
});

test("all victory criteria use authoritative scores, share exact ties and are revealed at the requested time", () => {
  for (const victory of ["highest", "lowest", "contracts"]) {
    const state = createMidnightDiceState(roster(3), { gameModifiers: { rounds: 3, victory, firstPlayer: "first-seat" } });
    while (state.round < 3) finishRound(state);
    chooseAll(state);
    state.market.fill(1);
    state.scores = { p0: 10, p1: 100, p2: 100 };
    for (const player of state.players) { state.secretContracts[player.id] = "balance"; state.stats[player.id].contractsCompleted = player.id === "p0" ? 0 : 4; }
    finishRound(state);
    assert.deepEqual(state.winners, victory === "lowest" ? ["p0"] : ["p1", "p2"]);
    assert.equal(midnightRankingScore(state, "p1"), victory === "contracts" ? 4 : victory === "lowest" ? -103 : 103);
  }
  const state = createMidnightDiceState(roster(2), { gameModifiers: { victory: "midnight", victoryReveal: "end" } });
  const actual = state.resolvedOptions.victory;
  assert.equal(publicMidnightOptions(state).victory, null);
  const spectator = spectatorState(state);
  assert.equal(spectator.resolvedOptions.victory, null); assert.equal(spectator.contractDrawPiles, undefined); assert.equal(spectator.secretContracts, undefined);
  state.finished = true;
  assert.equal(publicMidnightOptions(state).victory, actual); assert.equal(spectatorState(state).resolvedOptions.victory, actual);
});

test("pre-refill serialized games retain their rotation and remaining rerolls", () => {
  const state = createMidnightDiceState(roster(2), { midnightRulesVersion: 1, gameModifiers: { discardsPerRound: 1 } });
  delete state.rulesVersion; delete state.resolvedOptions;
  const previous = structuredClone(state.privateContractOffers);
  finishRound(state);
  assert.deepEqual(state.privateContractOffers, previous);
  assert.ok(Object.values(state.discardRemaining).every(value => value === 1));
  assert.ok(Object.values(state.usedContracts).every(ids => ids.length === 1));
});

test("artwork and card layout are validated separately from predicates and all three examples satisfy the mandate", () => {
  for (const definition of defaultMidnightContracts) for (const example of midnightExamples(definition)) assert.ok(evaluateMidnightDefinition(definition, example).achieved);
  assert.equal(midnightExamples({ id: "test", tier: "gold", rule: { type: "ordered", values: [4, 2, 1] } }).length, 3);
  assert.equal(normalizeMidnightArtwork({ image: "/api/media/test", x: -10, scale: 1.2 }).x, -10);
  assert.throws(() => normalizeMidnightArtwork({ image: "javascript:alert(1)" }));
  for (const design of [{ bodyFont: "url(evil)" }, { frontImage: "http://unsafe/image.png" }, { zones: { title: { x: 90 } } }, { zones: { condition: { color: "red;display:none" } } }]) assert.throws(() => normalizeMidnightCardDesign(design));
});
