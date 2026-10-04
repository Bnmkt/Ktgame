import assert from "node:assert/strict";
import test from "node:test";
import { achievementGoals, buildGuidedAchievement, describeAchievementRule, gameFeats } from "../src/components/admin/achievement-guide.js";
import { achievementRuleSchemas, consumeAchievementEvent, normalizeAchievementDefinition } from "../../server/src/services/achievement-rules.js";
import { games } from "../../server/src/games/shared.js";

const build = (config, entries = []) => normalizeAchievementDefinition({ id: "guided-test", title: "Défi", ...buildGuidedAchievement(config, games, entries) });
const finish = (gameId, payload) => ({ type: "game.finished", payload: { gameId, ...payload } });

test("les objectifs de niveau utilisent une métrique globale ou propre au jeu", () => {
  assert.equal(build({ objective: "level", amount: 10 }).rule.metric, "highestGameLevel");
  assert.equal(build({ objective: "level", gameId: "yahtzee", amount: 5 }).rule.metric, "gameLevel.yahtzee");
  assert.throws(() => build({ objective: "level", amount: 1001 }));
});

test("les modèles proposés pour chaque jeu produisent des règles acceptées par le serveur", () => {
  for (const gameId of ["", ...games.map((game) => game.id)]) {
    for (const goal of achievementGoals(gameId).filter((item) => item.id !== "feat")) {
      const entry = build({ gameId, objective: goal.id, amount: goal.amount ?? 1, repetitions: 1, ownedItem: "icon-test" });
      assert.ok(entry.rule);
      assert.ok(entry.description.length);
      assert.equal(entry.gameId, gameId || null);
    }
  }
});

test("un objectif de score répété compte seulement les parties réussies du jeu choisi", () => {
  const entry = build({ gameId: "yahtzee", objective: "score", amount: 300, repetitions: 2 });
  let state = {};
  for (const event of [finish("yahtzee", { score: 299 }), finish("farkle", { score: 3000 }), finish("yahtzee", { score: 300 })]) state = consumeAchievementEvent(entry.rule, event, state).progress;
  assert.equal(state.value, 1);
  assert.ok(state.value < entry.target);
  state = consumeAchievementEvent(entry.rule, finish("yahtzee", { score: 301 }), state).progress;
  assert.equal(state.value, entry.target);
});

test("une défaite coupe la série, une partie d'un autre jeu ne la coupe pas", () => {
  const { rule } = build({ gameId: "farkle", objective: "streak", amount: 3 });
  let state = consumeAchievementEvent(rule, finish("farkle", { won: true })).progress;
  state = consumeAchievementEvent(rule, finish("yahtzee", { won: false }), state).progress;
  assert.equal(state.value, 1);
  state = consumeAchievementEvent(rule, finish("farkle", { won: false }), state).progress;
  assert.equal(state.value, 0);
});

test("les exploits guidés utilisent les signaux du moteur sans hériter des anciens déblocages", () => {
  const feats = [{ id: "yahtzee-full-house", title: "Maison pleine", description: "Marquer un full.", gameId: "yahtzee", builtIn: true, rule: { source: "event", event: "game.finished", aggregate: "match", scope: "event", legacyResultId: "yahtzee-full-house", condition: { field: "signals", operator: "contains", value: "yahtzee-full-house" } } }];
  assert.equal(gameFeats(feats, "farkle").length, 0);
  const entry = build({ gameId: "yahtzee", objective: "feat", featId: feats[0].id, repetitions: 2 }, feats);
  assert.equal(entry.rule.legacyResultId, undefined);
  assert.equal(consumeAchievementEvent(entry.rule, finish("yahtzee", { signals: [feats[0].id] })).progress.value, 1);
  assert.match(describeAchievementRule(entry, achievementRuleSchemas(games), games, feats), /Maison pleine/);
});

test("le lancer Farkle et l'égalité Blackjack utilisent les résultats exacts", () => {
  const farkle = build({ gameId: "farkle", objective: "roll", amount: 3000, repetitions: 1 });
  assert.equal(consumeAchievementEvent(farkle.rule, finish("farkle", { maxRollScore: 1000, maxTurnScore: 4000 })).matched, false);
  assert.equal(consumeAchievementEvent(farkle.rule, finish("farkle", { maxRollScore: 3000 })).matched, true);
  const blackjack = build({ gameId: "blackjack", objective: "tie21", repetitions: 1 });
  assert.equal(consumeAchievementEvent(blackjack.rule, finish("blackjack", { handTotal: 21, dealerTotal: 20 })).matched, false);
  assert.equal(consumeAchievementEvent(blackjack.rule, finish("blackjack", { handTotal: 21, dealerTotal: 21 })).matched, true);
});

test("les seuils vides, décimaux et impossibles sont refusés avant sauvegarde", () => {
  for (const amount of ["", 0, -1, 2.5, NaN, 1000000001]) assert.throws(() => build({ objective: "wins", amount }));
  assert.throws(() => build({ gameId: "farkle", objective: "roll", amount: 1000, repetitions: "" }));
  assert.throws(() => build({ gameId: "president", objective: "score", amount: 300 }));
});
