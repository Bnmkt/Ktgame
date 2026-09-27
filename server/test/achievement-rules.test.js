import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeAchievementEvent,
  evaluateAchievementCondition,
  normalizeAchievementDefinition,
  normalizeAchievementRule
} from "../src/services/achievement-rules.js";

test("les groupes ET/OU imbriqués évaluent nombres, listes et champs absents", () => {
  const condition = {
    all: [
      { field: "gameId", operator: "eq", value: "farkle" },
      { any: [
        { field: "rollScore", operator: "gte", value: 3000 },
        { field: "flags", operator: "containsAll", value: ["Suite 1-6", "score"] }
      ] },
      { field: "dice", operator: "containsAll", value: [1, 2, 3] },
      { field: "phase", operator: "exists", value: false }
    ]
  };
  assert.equal(evaluateAchievementCondition(condition, { gameId: "farkle", rollScore: 3000, flags: [], dice: [3, 2, 1] }), true);
  assert.equal(evaluateAchievementCondition(condition, { gameId: "farkle", rollScore: 1000, flags: [], dice: [3, 2, 1] }), false);
});

test("la validation refuse les champs arbitraires et borne la complexité", () => {
  assert.throws(() => normalizeAchievementRule({ source: "event", event: "game.action", condition: { field: "deck.privateCards", operator: "eq", value: 1 } }), /inconnu/);
  assert.throws(() => normalizeAchievementRule({ source: "metric", metric: "process.memory" }), /inconnue/);
  const deeplyNested = { all: [{ all: [{ all: [{ all: [{ all: [{ all: [{ field: "gameId", operator: "eq", value: "421" }] }] }] }] }] }] };
  assert.throws(() => normalizeAchievementRule({ source: "event", event: "game.action", condition: deeplyNested }), /trop de niveaux/);
});

test("les agrégats de carrière gèrent compte, somme, maximum, distinct et série", () => {
  const event = { type: "game.action", payload: { gameId: "farkle", action: "roll", rollScore: 1500, dice: [1, 2, 3, 4, 5, 6] } };
  const base = { source: "event", event: "game.action", scope: "career", condition: { field: "action", operator: "eq", value: "roll" } };
  assert.equal(consumeAchievementEvent({ ...base, aggregate: "count" }, event, { value: 4 }).progress.value, 5);
  assert.equal(consumeAchievementEvent({ ...base, aggregate: "sum", valueField: "rollScore" }, event, { value: 500 }).progress.value, 2000);
  assert.equal(consumeAchievementEvent({ ...base, aggregate: "max", valueField: "rollScore" }, event, { value: 3000 }).progress.value, 3000);
  const distinct = consumeAchievementEvent({ ...base, aggregate: "distinct", valueField: "dice" }, event, { value: 2, values: [1, 2] }).progress;
  assert.deepEqual(distinct.values, [1, 2, 3, 4, 5, 6]);
  assert.equal(distinct.value, 6);
  assert.equal(consumeAchievementEvent({ ...base, aggregate: "streak" }, { ...event, payload: { ...event.payload, action: "bank" } }, { value: 3 }).progress.value, 0);
});

test("une définition admin est nettoyée et conserve une règle déclarative", () => {
  const definition = normalizeAchievementDefinition({
    id: " Farkle / Marathon ", title: "Marathon", description: "Dix lancers", group: "Farkle", type: "games", target: 10, gameId: "farkle",
    rule: { source: "event", event: "game.action", scope: "career", aggregate: "count", gameId: "farkle", condition: { field: "action", operator: "eq", value: "roll" } }
  });
  assert.equal(definition.id, "farkle-marathon");
  assert.equal(definition.rule.aggregate, "count");
  assert.equal(definition.rule.gameId, "farkle");
});
