import assert from "node:assert/strict";
import test from "node:test";
import { defaultMidnightContracts, normalizeMidnightContracts, evaluateMidnightDefinition, midnightContractTiers } from "../../client/src/features/games/midnightDice/contracts.js";
import { midnightContractEvaluation } from "../../client/src/features/games/midnightDice/model.js";
import { createGameState, applyAction } from "../src/games/engines.js";
import { evaluateMidnightContract, midnightContractOffers, midnightDiceBotAction } from "../src/games/engines/midnight-dice.js";
import { completedMidnightContractCount, gameResultAchievementIds, midnightContractResultId } from "../src/services/result-achievements.js";
import { spectatorState } from "../src/games/spectator-state.js";

const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, pseudo: `Player ${i}` }));
const custom = [
  { id: "ordered-test", label: "Dans l’ordre", tier: "gold", rule: { type: "ordered", values: [4, 2, 1] } },
  { id: "unordered-test", label: "Ordre libre", tier: "silver", rule: { type: "unordered", values: [4, 2, 1] } },
  { id: "sum-test", label: "Somme bornée", tier: "platinum", rule: { type: "sum", comparison: "between", value: 9, maximum: 12 } },
  { id: "addition-test", label: "Addition", tier: "diamond", rule: { type: "special", condition: "sum-two" } }
];
const catalog = () => normalizeMidnightContracts([...structuredClone(defaultMidnightContracts), ...structuredClone(custom)]);
const index = entries => Object.fromEntries(entries.map(entry => [entry.id, entry]));

test("custom predicates preserve pickup order, multiset multiplicity, sums and all special permutations", () => {
  const defs = index(catalog());
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
    const dice = [a, b, c], total = a + b + c;
    const expected = { "ordered-test": a === 4 && b === 2 && c === 1, "unordered-test": [...dice].sort().join() === "1,2,4", "sum-test": total >= 9 && total <= 12, "addition-test": dice.some(value => value === total - value) };
    for (const [id, achieved] of Object.entries(expected)) {
      const server = evaluateMidnightContract(id, dice, defs), client = midnightContractEvaluation(id, dice, defs);
      assert.equal(server.achieved, achieved, `${id}: ${dice}`); assert.deepEqual(server, client);
      assert.equal(server.bonus, achieved ? midnightContractTiers[defs[id].tier].bonus : 0);
    }
  }
  for (const dice of [[2, 4, 2], [5, 2, 3], [1, 2, 3]]) assert.ok(evaluateMidnightContract("addition-test", dice, defs).achieved);
  for (const dice of [[], [4], [4, 2], [4, 2, 1, 1], [4, 2, "1"], [4, 2, 7]]) assert.equal(evaluateMidnightContract("ordered-test", dice, defs).achieved, false);
  assert.equal(evaluateMidnightDefinition({ tier: "bronze", rule: { type: "unordered", values: [2, 2, 4] } }, [2, 4, 4]).achieved, false);
});
test("the catalogue validates bounds, identifiers and declarative rules without accepting executable input", () => {
  const base = structuredClone(defaultMidnightContracts), invalid = rule => [...base, { ...custom[0], rule }];
  for (const input of [null, {}, [], base.slice(0, 5), [...base, ...base], [...base, { ...custom[0], id: "constructor" }], [...base, { ...custom[0], tier: "unknown" }], invalid({ type: "ordered", values: [4, 2] }), invalid({ type: "ordered", values: [4, 2, 7] }), invalid({ type: "sum", comparison: "between", value: 12, maximum: 9 }), invalid({ type: "special", condition: "eval", code: "process.exit()" })]) assert.throws(() => normalizeMidnightContracts(input));
  for (const entry of catalog()) assert.ok(evaluateMidnightDefinition(entry, entry.example).achieved);
});
test("new custom catalogues support eight private distinct offers at their lower and upper limits", () => {
  for (const count of [6, 24]) {
    const entries = Array.from({ length: count }, (_, i) => ({ ...structuredClone(defaultMidnightContracts[i % 12]), id: `mandate-${i}` }));
    const state = createGameState("midnight-dice", players, { midnightContracts: entries });
    const offers = Object.values(state.privateContractOffers);
    assert.equal(new Set(offers.map(offer => [...offer].sort().join("|"))).size, 8);
    assert.ok(offers.every(offer => offer.length === 4 && offer.every(id => Object.hasOwn(state.contractCatalog, id))));
    const visible = spectatorState(state);
    assert.equal(visible.privateContractOffers, undefined); assert.equal(visible.secretContracts, undefined); assert.deepEqual(visible.contractOffers, []);
    assert.equal(Object.keys(visible.contractCatalog).length, count);
  }
});
test("real drafted rounds, bot decisions, reloads and achievements use the immutable match catalogue", () => {
  const entries = catalog();
  let state = createGameState("midnight-dice", players.slice(0, 2), { midnightContracts: entries, gameModifiers: { individualContracts: false } });
  state.contractOffers = ["ordered-test", "unordered-test", "addition-test", "sum-test"];
  applyAction(state, "p0", { type: "choose-contract", contract: "ordered-test" });
  applyAction(state, "p1", { type: "choose-contract", contract: "unordered-test" });
  entries.find(entry => entry.id === "ordered-test").tier = "diamond";
  state.market = [6, 4, 2, 1];
  assert.equal(midnightDiceBotAction(state, players[0]).index, 1, "The bot plans the fixed first die instead of taking the six");
  state.market = [4, 2, 2, 4, 1, 1];
  state = JSON.parse(JSON.stringify(state));
  while (state.phase === "draft") applyAction(state, state.players[state.currentPlayerIndex].id, { type: "draft", index: 0 });
  const own = state.lastRound.results.find(result => result.playerId === "p0");
  assert.deepEqual(own.dice, [4, 2, 1]); assert.equal(own.bonus, 45); assert.equal(own.points, 52);
  assert.equal(state.contractCatalog["ordered-test"].tier, "gold");
  const ids = gameResultAchievementIds(state, "p0"); assert.ok(ids.includes(midnightContractResultId("ordered-test")));
  assert.equal(completedMidnightContractCount([...ids, ...ids]), 1);
  assert.throws(() => applyAction(state, state.players[state.currentPlayerIndex].id, { type: "choose-contract", contract: "not-in-this-match" }), /proposé/);
});
