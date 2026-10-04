import test from "node:test";
import assert from "node:assert/strict";
import { awardGameXp, compileXpFormula, DEFAULT_XP_FORMULA, equippedGameTitle, gameProgress, gameXpRules, grantAchievementRewards, normalizeAchievementRewards, normalizeProgressionConfig, progressionCurve, roomLevelError, roomLevelLimits, unlockedGameTitles } from "../src/services/game-progression.js";
import { DEFAULT_GAME_TITLES } from "../src/services/game-titles.js";
import { games } from "../src/games/shared.js";
import { achievementRuleSchemas, consumeAchievementEvent, normalizeAchievementDefinition } from "../src/services/achievement-rules.js";

test("French XP formula supports decimal commas, powers, round and floor without executing code", () => {
  const fn = compileXpFormula(DEFAULT_XP_FORMULA.replaceAll("*", "×").replaceAll("/", "÷"));
  for (const n of [1, 5, 10, 20, 99, 100]) assert.equal(fn(n), Math.round((12 + 30 * n + 8 * n ** 1.5) * (1 + .4 * Math.floor(n / 10) ** 1.25)));
  assert.equal(compileXpFormula("ROUND(2^3^2)")(1), 512);
  for (const bad of ["globalThis.process.exit()", "N.constructor", "eval(N)", "N; 1", "1/0", "0", "-1", "10^9999", "(".repeat(50) + "1" + ")".repeat(50)]) assert.throws(() => normalizeProgressionConfig({ formula: bad }));
});
test("XP boundaries, titles, caps and curve changes preserve cumulative XP", () => {
  const config = normalizeProgressionConfig({ formula: "100 * N", maxLevel: 4, titles: [{ level: 1, label: "Novice" }, { level: 3, label: "Expert" }], games: { dice: { completionXp: 30, victoryXp: 50, titles: [{ level: 2, label: "Lanceur" }] } } }, ["dice"]);
  assert.deepEqual(progressionCurve(config).map((row) => row.totalXp), [0, 100, 300, 600]);
  const user = { gameXp: { dice: 99, cards: 0 } };
  assert.equal(gameProgress(user, "dice", config).level, 1);
  assert.equal(awardGameXp(user, "dice", 1, config).level, 2);
  assert.equal(gameProgress(user, "dice", config).title, "Lanceur");
  assert.equal(gameProgress(user, "cards", config).title, "Novice");
  assert.equal(awardGameXp(user, "dice", 500, config).capped, true);
  assert.equal(user.gameXp.dice, 600);
  const changed = normalizeProgressionConfig({ ...config, formula: "200*N" }, ["dice"]);
  assert.equal(gameProgress(user, "dice", changed).level, 3);
  assert.equal(user.gameXp.dice, 600);
  assert.equal(awardGameXp({ guest: true }, "dice", 99, config), null);
  assert.throws(() => normalizeProgressionConfig({ titles: [{ level: 1, label: "A" }, { level: 1, label: "B" }] }));
});
test("achievement rewards are one-time, independent of unlock suppression, and do not duplicate inventory", () => {
  const config = normalizeProgressionConfig(), user = { cosmetics: { diceSkins: ["ivory"] } };
  const entry = { id: "reward", rewards: { itemIds: ["die", "removed"], xp: [{ gameId: "dice", amount: 100 }] } }, shop = [{ id: "die", type: "diceSkins", value: "ivory" }];
  assert.equal(grantAchievementRewards(user, entry, shop, config)[0].amount, 100);
  user.achievements = { unlocked: [], suppressed: [entry.id] };
  assert.deepEqual(grantAchievementRewards(user, entry, shop, config), []);
  assert.equal(user.gameXp.dice, 100);
  assert.deepEqual(user.cosmetics.diceSkins, ["ivory"]);
  assert.throws(() => normalizeAchievementRewards({ xp: [{ gameId: "dice", amount: -1 }] }));
  assert.throws(() => normalizeAchievementRewards({ xp: [{ gameId: "dice", amount: 10 }, { gameId: "dice", amount: 20 }] }));
});
test("level requirements validate both boundaries and exempt bots", () => {
  const config = normalizeProgressionConfig({ formula: "100*N" });
  assert.deepEqual(roomLevelLimits({}), { minLevel: 1, maxLevel: null });
  for (const bad of [{ minLevel: -1 }, { minLevel: 5, maxLevel: 2 }, { minLevel: 2.1 }, { maxLevel: 1001 }]) assert.throws(() => roomLevelLimits(bad));
  const room = { gameId: "dice", minLevel: 2, maxLevel: 3 };
  assert.match(roomLevelError({}, room, config), /Ton niveau : 1/);
  assert.equal(roomLevelError({ gameXp: { dice: 100 } }, room, config), "");
  assert.match(roomLevelError({ gameXp: { dice: 600 } }, room, config), /Ton niveau : 4/);
  assert.equal(roomLevelError({ isBot: true }, room, config), "");
});
test("achievement editor schemas offer game level and XP metrics, events and reward definitions", () => {
  const schemas = achievementRuleSchemas([{ id: "yahtzee", name: "Yahtzee" }]);
  assert.ok(schemas.metrics.some((row) => row.id === "gameLevel.yahtzee"));
  assert.ok(schemas.events.some((row) => row.id === "game.level" && row.fields.some((field) => field.field === "level")));
  const definition = normalizeAchievementDefinition({ id: "level", rule: { source: "metric", metric: "gameLevel.yahtzee" }, rewards: { itemIds: ["item"], xp: [{ gameId: "yahtzee", amount: 30 }] } });
  assert.equal(definition.rewards.xp[0].amount, 30);
  const rule = { source: "event", event: "game.level", scope: "career", aggregate: "max", valueField: "level", condition: { field: "gameId", operator: "eq", value: "yahtzee" } };
  assert.equal(consumeAchievementEvent(rule, { type: "game.level", payload: { gameId: "yahtzee", level: 8 } }).progress.value, 8);
});

test("all fifteen games have eight default titles at the requested thresholds", () => {
  const config = normalizeProgressionConfig({}, games.map((game) => game.id));
  assert.equal(Object.keys(DEFAULT_GAME_TITLES).length, 15);
  for (const game of games) {
    const titles = unlockedGameTitles(config, game.id, 100);
    assert.deepEqual(titles.map((row) => row.level), [1, 5, 10, 20, 40, 60, 80, 100]);
    assert.equal(unlockedGameTitles(config, game.id, 4).length, 1);
    assert.equal(unlockedGameTitles(config, game.id, 5).length, 2);
    assert.equal(titles.at(-1).label, DEFAULT_GAME_TITLES[game.id].at(-1).label);
  }
  assert.equal(config.games.yahtzee.titles[2].label, "Brelan");
  assert.equal(config.games.blackjack.titles[4].label, "Vingt et Un");
});

test("a chosen lower-tier title stays equipped after leveling and invalid or removed titles fall back safely", () => {
  const config = normalizeProgressionConfig({ formula: "10*N" }, ["yahtzee", "blackjack"]);
  const user = { gameXp: { yahtzee: 1900, blackjack: 0 }, profile: { titleGameId: "yahtzee", titleLevel: 5 } };
  assert.equal(gameProgress(user, "yahtzee", config).level, 20);
  assert.equal(equippedGameTitle(user, config, ["yahtzee", "blackjack"]).title, "Paire");
  awardGameXp(user, "yahtzee", 1000, config);
  assert.equal(equippedGameTitle(user, config, ["yahtzee", "blackjack"]).title, "Paire");
  user.profile.titleLevel = 100;
  assert.equal(equippedGameTitle(user, config, ["yahtzee", "blackjack"]).title, "Carré");
  user.profile.titleLevel = 5;
  config.games.yahtzee.titles = config.games.yahtzee.titles.filter((row) => row.level !== 5);
  assert.equal(equippedGameTitle(user, config, ["yahtzee", "blackjack"]).title, "Carré");
  user.profile.titleHidden = true;
  assert.equal(equippedGameTitle(user, config, ["yahtzee", "blackjack"]), null);
});

test("per-game titles do not freeze inherited XP amounts", () => {
  const config = normalizeProgressionConfig({ completionXp: 20, victoryXp: 25 }, ["yahtzee", "blackjack"]);
  assert.deepEqual(gameXpRules(config, "yahtzee"), { completionXp: 20, victoryXp: 25 });
  const changed = normalizeProgressionConfig({ ...config, completionXp: 80 }, ["yahtzee", "blackjack"]);
  assert.deepEqual(gameXpRules(changed, "yahtzee"), { completionXp: 80, victoryXp: 25 });
  const overridden = normalizeProgressionConfig({ ...changed, games: { ...changed.games, yahtzee: { ...changed.games.yahtzee, victoryXp: 100 } } }, ["yahtzee"]);
  assert.deepEqual(gameXpRules(overridden, "yahtzee"), { completionXp: 80, victoryXp: 100 });
});
