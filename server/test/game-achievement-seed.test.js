import test from "node:test";
import assert from "node:assert/strict";
import { games } from "../src/games/shared.js";
import { achievementXp, activeAchievementCatalog, planGameAchievements } from "../scripts/seed-game-achievements.mjs";

test("archived catalog entries stay archived and settings remain authoritative", () => {
  const rows = [{ id: "built-in", builtIn: true, title: "Old title" }, { id: "custom", builtIn: false, target: 1 }, { id: "deleted", builtIn: false }];
  const settings = { achievementOverrides: { "built-in": { title: "Current title" } }, customAchievements: [{ id: "custom", target: 10, group: "Yahtzee", gameId: "yahtzee", secret: true, categories: ["Progression"] }] };
  const active = activeAchievementCatalog(rows, settings);
  assert.deepEqual(active.map((row) => row.id), ["built-in", "custom"]);
  assert.equal(active[0].title, "Current title");
  assert.equal(active[1].target, 10);
  assert.deepEqual(active[1].categories, ["Yahtzee", "Jeux", "Secrets", "Milestones"]);
  assert.equal(rows[0].title, "Old title");
  assert.throws(() => activeAchievementCatalog([], settings), /missing from catalog/);
});

test("achievement XP adds milestone and secret bonuses independently", () => {
  assert.equal(achievementXp({}, "easy"), 30);
  assert.equal(achievementXp({}, "medium"), 50);
  assert.equal(achievementXp({}, "hard"), 100);
  assert.equal(achievementXp({}, "veryHard"), 300);
  assert.equal(achievementXp({ milestone: true }, "medium"), 250);
  assert.equal(achievementXp({ secret: true }, "easy"), 530);
  assert.equal(achievementXp({ milestone: true, secret: true }, "veryHard"), 1000);
  assert.throws(() => achievementXp({}, "unknown"));
});

test("fifteen games receive exactly three attainable metric-based milestones", () => {
  const plan = planGameAchievements([]);
  assert.equal(plan.created.length, 45);
  for (const game of games) {
    const entries = plan.changes.filter((entry) => entry.gameId === game.id);
    assert.deepEqual(entries.map((entry) => entry.target), [10, 100, 101]);
    assert.deepEqual(entries.map((entry) => entry.rewards.xp[0].amount), [250, 500, 1000]);
    assert(entries.every((entry) => entry.milestone && entry.enabled));
    assert.deepEqual(entries.map((entry) => entry.secret), [false, false, true]);
    assert.equal(entries[2].title, `Ultimate ${game.name}`);
    assert(entries.every((entry) => entry.rule.source === "metric" && entry.rule.metric === `gameLevel.${game.id}`));
  }
  assert.deepEqual(planGameAchievements(plan.changes).changes, []);
});

test("game rewards preserve object rewards, other games, rules, and source records", () => {
  const entry = { id: "yahtzee-full-house", title: "Custom title", gameId: "yahtzee", milestone: false,
    secret: false, enabled: false, target: 1, builtIn: true, rule: { source: "event", event: "game.finished", condition: { field: "score", operator: "gte", value: 25 } },
    rewards: { itemIds: ["existing-item"], xp: [{ gameId: "yahtzee", amount: 999 }, { gameId: "belote", amount: 42 }] } };
  const original = structuredClone(entry);
  const plan = planGameAchievements([entry]);
  const updated = plan.changes.find((row) => row.id === entry.id);
  assert.deepEqual(updated.rewards, { itemIds: ["existing-item"], xp: [{ gameId: "belote", amount: 42 }, { gameId: "yahtzee", amount: 30 }] });
  const { rewards: _rewards, ...definition } = updated;
  const { rewards: _oldRewards, ...oldDefinition } = original;
  assert.deepEqual(definition, oldDefinition);
  assert.deepEqual(entry, original);
});

test("general site achievements are left unchanged", () => {
  const entry = { id: "site-example", title: "Site achievement", type: "site", secret: true, milestone: true, rule: { source: "metric", metric: "gamesPlayed" } };
  const plan = planGameAchievements([entry]);
  assert(!plan.changes.some((row) => row.id === entry.id));
});

test("victory achievements use progressively harder targets", () => {
  const catalog = [1, 10, 50, 100, 500, 1000].map((target) => ({ id: `game-belote-wins-${target}`, gameId: "belote", target, rule: { source: "metric", metric: "gameWins.belote" } }));
  const plan = planGameAchievements(catalog);
  assert.deepEqual(catalog.map((entry) => plan.changes.find((row) => row.id === entry.id).rewards.xp[0].amount), [30, 50, 100, 100, 300, 300]);
});

test("existing equivalent milestones are reused rather than duplicated", () => {
  const entry = { id: "my-yahtzee-level-ten", title: "My existing title", gameId: "yahtzee", target: 10, rule: { source: "metric", metric: "gameLevel.yahtzee" } };
  const plan = planGameAchievements([entry]);
  assert.equal(plan.created.length, 44);
  assert.equal(plan.changes.find((row) => row.id === entry.id).title, entry.title);
  assert.equal(plan.changes.find((row) => row.id === entry.id).milestone, true);
  assert.throws(() => planGameAchievements([entry, { ...entry, id: "another-level-ten" }]), /Several achievements/);
});

test("unreviewed difficulties and identifier collisions abort preparation", () => {
  assert.throws(() => planGameAchievements([{ id: "unreviewed-game-challenge", title: "Review me", gameId: "yahtzee" }]), /Review the difficulty/);
  assert.throws(() => planGameAchievements([{ id: "game-belote-level-10" }]), /identifier already used/);
});
