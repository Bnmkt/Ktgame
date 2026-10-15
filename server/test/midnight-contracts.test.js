import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/games/engines.js";
import { applyMidnightDiceAction, MIDNIGHT_CONTRACTS, midnightContractOffers, midnightContractPotential, midnightDiceBotAction, scoreMidnightContract } from "../src/games/engines/midnight-dice.js";
import { normalizeRankedConfig, validateRankedAction } from "../src/services/ranked.js";
import { spectatorState } from "../src/games/spectator-state.js";

const roster = (count) => Array.from({ length: count }, (_, index) => ({ id: `player-${index}`, pseudo: `Player ${index}` }));
const potential = (offer, rounds = 4) => {
  const points = offer.map(midnightContractPotential).sort((left, right) => right - left);
  return points.slice(0, rounds).reduce((sum, value) => sum + value, 0);
};
function finishRound(state) {
  while (state.phase === "contract") {
    const player = state.players[state.currentPlayerIndex];
    const action = midnightDiceBotAction(state, player);
    assert.ok(action?.contract);
    applyMidnightDiceAction(state, player.id, action);
  }
  const round = state.round;
  while (!state.finished && state.round === round) applyMidnightDiceAction(state, state.players[state.currentPlayerIndex].id, { type: "draft", index: 0 });
}

test("contract potential comes from actual maximal dice scores, including the bonus", () => {
  for (const contract of MIDNIGHT_CONTRACTS) {
    let maximum = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) maximum = Math.max(maximum, scoreMidnightContract(contract, [a, b, c]));
    assert.equal(midnightContractPotential(contract), maximum);
  }
  assert.equal(midnightContractPotential("triple"), 118);
  assert.equal(midnightContractPotential("cellar"), 72);
});

test("complete personal rotations have equal potential for two to eight players", () => {
  for (let count = 2; count <= 8; count++) for (let repeat = 0; repeat < 4; repeat++) {
    const state = createGameState("midnight-dice", roster(count), { gameModifiers: { rounds: 8 } });
    const offers = Object.values(state.privateContractOffers);
    assert.equal(new Set(offers.map((offer) => potential(offer))).size, 1);
    assert.equal(new Set(offers.map((offer) => [...offer].sort().join("|"))).size, count);
  }
});

test("classic and ranked remove one offer per personal choice and never recycle it inside a rotation", () => {
  for (const ranked of [false, true]) for (const individualContracts of [false, true]) for (const uniqueContracts of [false, true]) {
    const preset = ranked ? normalizeRankedConfig().games["midnight-dice"].preset.gameModifiers : {};
    const state = createGameState("midnight-dice", roster(4), { gameModifiers: { ...preset, rounds: 8, individualContracts, uniqueContracts } });
    let previous = structuredClone(individualContracts ? state.privateContractOffers : state.contractOffers);
    let selections = Object.fromEntries(state.players.map((player) => [player.id, []]));
    for (let round = 1; round <= 8; round++) {
      assert.equal(state.round, round);
      for (let turn = 0; turn < state.players.length; turn++) {
        const player = state.players[state.currentPlayerIndex];
        const offers = midnightContractOffers(state, player.id);
        assert.equal(offers.length, 4 - (round - 1) % 4);
        assert.ok(selections[player.id].every((used) => !offers.includes(used)));
        if (selections[player.id].length) {
          const used = selections[player.id][0];
          assert.throws(() => applyMidnightDiceAction(state, player.id, { type: "choose-contract", contract: used }), /déjà été utilisé/);
        }
        const action = midnightDiceBotAction(state, player);
        if (ranked) validateRankedAction(state, player.id, action);
        applyMidnightDiceAction(state, player.id, action);
        selections[player.id].push(action.contract);
        assert.equal(midnightContractOffers(state, player.id).length, offers.length - 1);
        assert.ok(!midnightContractOffers(state, player.id).includes(action.contract));
        assert.deepEqual(individualContracts ? state.privateContractOffers : state.contractOffers, previous);
      }
      finishRound(state);
      if (round === 4) {
        const current = individualContracts ? state.privateContractOffers : state.contractOffers;
        for (const player of state.players) {
          const before = individualContracts ? previous[player.id] : previous;
          const after = individualContracts ? current[player.id] : current;
          assert.ok(after.every((contract) => !before.includes(contract)));
          assert.equal(midnightContractOffers(state, player.id).length, 4);
        }
        previous = structuredClone(current);
        selections = Object.fromEntries(state.players.map((player) => [player.id, []]));
      }
    }
    assert.equal(state.finished, true);
    const spectator = spectatorState(state);
    assert.equal(spectator.privateContractOffers, undefined);
    assert.equal(spectator.usedContracts, undefined);
  }
});

test("legacy off mode balances consumable offers and also removes previously chosen contracts", () => {
  const state = createGameState("midnight-dice", roster(8), { gameModifiers: { rounds: 3, uniqueContracts: false } });
  assert.equal(state.modifiers.uniqueContracts, false);
  assert.equal(new Set(Object.values(state.privateContractOffers).map((offer) => potential(offer, 3))).size, 1);
  for (let round = 0; round < 3; round++) {
    for (let turn = 0; turn < state.players.length; turn++) {
      const player = state.players[state.currentPlayerIndex];
      const contract = midnightContractOffers(state, player.id)[0];
      applyMidnightDiceAction(state, player.id, { type: "choose-contract", contract });
      assert.equal(midnightContractOffers(state, player.id).length, 3 - round);
      assert.ok(!midnightContractOffers(state, player.id).includes(contract));
    }
    finishRound(state);
  }
  assert.equal(state.finished, true);
});

test("a failed mandate remains consumed and exhausting the offers cannot reset the personal cycle", () => {
  const state = createGameState("midnight-dice", roster(2), { gameModifiers: { rounds: 5, individualContracts: false, uniqueContracts: false } });
  state.contractOffers = ["spectrum", "duo", "balance", "triple"];
  applyMidnightDiceAction(state, "player-0", { type: "choose-contract", contract: "spectrum" });
  applyMidnightDiceAction(state, "player-1", { type: "choose-contract", contract: "duo" });
  state.market.fill(1); finishRound(state);
  assert.equal(state.lastRound.results.find((row) => row.playerId === "player-0").achieved, false);
  assert.ok(!midnightContractOffers(state, "player-0").includes("spectrum"));
  state.currentPlayerIndex = 0;
  state.usedContracts["player-0"] = [...state.contractOffers];
  assert.deepEqual(midnightContractOffers(state, "player-0"), []);
  assert.equal(midnightDiceBotAction(state, state.players[0]), null);
  assert.throws(() => applyMidnightDiceAction(state, "player-0", { type: "choose-contract", contract: "spectrum" }), /déjà été utilisé/);
});

test("a short final rotation achieves the smallest possible potential gap for two players", () => {
  const all = [];
  for (let a = 0; a < 9; a++) for (let b = a + 1; b < 10; b++) for (let c = b + 1; c < 11; c++) for (let d = c + 1; d < 12; d++) all.push([a, b, c, d].map((index) => MIDNIGHT_CONTRACTS[index]));
  for (const rounds of [3, 5, 6, 7]) {
    const state = createGameState("midnight-dice", roster(2), { gameModifiers: { rounds } });
    let previous = {};
    if (rounds > 4) {
      previous = structuredClone(state.privateContractOffers);
      while (state.round < 5) finishRound(state);
    }
    const remaining = rounds > 4 ? rounds - 4 : rounds;
    const candidates = state.players.map((player) => all.filter((offer) => offer.every((contract) => !(previous[player.id] ?? []).includes(contract))).map((offer) => ({ signature: offer.join("|"), value: potential(offer, remaining) })));
    let minimum = Infinity;
    for (const left of candidates[0]) for (const right of candidates[1]) if (left.signature !== right.signature) minimum = Math.min(minimum, Math.abs(left.value - right.value));
    const actual = Object.values(state.privateContractOffers).map((offer) => potential(offer, remaining));
    assert.equal(Math.abs(actual[0] - actual[1]), minimum);
  }
});
