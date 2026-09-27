import test from "node:test";
import assert from "node:assert/strict";
import { eventEffectRules, eventEffectDescription, combinationCondition } from "../src/features/events/effect-rules.js";

test("dice rules include faces, combinations and enabled critical effects", () => {
  const effects = [{ type: "tokens", value: 15 }];
  const game = { type: "dice", dice: { faces: 6, faceEffects: { 4: effects, 99: effects }, combinations: [{ id: "pair", name: "Double", condition: { type: "double" }, effects }] }, critical: { enabled: true, effects } };
  assert.deepEqual(eventEffectRules(game).map((row) => row.key), ["face-4", "combo-pair", "critical"]);
  assert.match(eventEffectDescription(effects[0]), /15 jetons.*ce joueur/);
  assert.match(combinationCondition({ type: "straight" }), /distinctes/);
});
test("card rules omit disabled effect families", () => {
  const effects = [{ type: "damageBonus", value: 5 }];
  const game = { type: "cards", cards: { useSuitEffects: false, useValueEffects: true, useSpecificEffects: true, suitEffects: { hearts: effects }, valueEffects: { A: effects }, specificEffects: { "K-spades": effects } } };
  assert.deepEqual(eventEffectRules(game).map((row) => row.label), ["Valeur : As", "Carte : Roi de Pique"]);
});

test("purchase bonuses reduce prices and next-action effects do not advertise a duration", () => {
  assert.match(eventEffectDescription({ type: "temporaryBonus", stat: "actionPrice", value: 0.25 }), /Réduit le prix des actions de 25 %/);
  assert.match(eventEffectDescription({ type: "temporaryMalus", stat: "actionPrice", value: 0.25 }), /Augmente le prix des actions de 25 %/);
  assert.doesNotMatch(eventEffectDescription({ type: "personalMultiplier", value: 2, target: "nextAction", duration: 30 }), /pendant/);
});

test("public rules distinguish exact and contained draws and include card combinations", () => {
  assert.match(combinationCondition({ type: "containsValues", values: [4, 2, 1] }), /contient.*4, 2, 1/);
  assert.match(combinationCondition({ type: "customValues", values: [4, 2, 1] }), /exact/);
  const game = { type: "cards", cards: { combinations: [{ id: "duo", name: "Duo", condition: { type: "containsCards", cards: [{ rank: "A", suit: "any" }, { rank: "K", suit: "hearts" }] }, effects: [{ type: "tokens", value: 17 }] }] } };
  const [rule] = eventEffectRules(game);
  assert.equal(rule.label, "Duo");
  assert.match(rule.condition, /As \(toute enseigne\), Roi de Cœur/);
  assert.equal(rule.effects[0].value, 17);
});
