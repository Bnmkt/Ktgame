import assert from "node:assert/strict";
import test from "node:test";
import { calculateDailyBonusStatus } from "../src/services/daily-bonus.js";
import { shiftDateKey } from "../src/services/time.js";

const now = new Date("2026-09-16T12:00:00Z");
const dates = (count, spacing = 1, lastDate = "2026-09-15") => Array.from({ length: count }, (_, i) => shiftDateKey(lastDate, (i - count + 1) * spacing));

test("les paliers reposent sur les jours consecutifs, pas le total des bonus", () => {
  for (const claims of [6, 7, 13, 14, 29, 30, 59, 60]) {
    const consecutive = calculateDailyBonusStatus(dates(claims), 1000, now);
    const spaced = calculateDailyBonusStatus(dates(claims, 3), 1000, now);
    assert.equal(consecutive.streak, claims);
    assert.equal(spaced.streak, 1);
    assert.equal(spaced.multiplier, 1.1);
    assert.equal(spaced.nextMultiplier, 1.2);
    assert.equal(spaced.nextReward, 1200);
    assert.equal(spaced.nextWeeklyBoost, false);
    assert.equal(spaced.nextMonthlyDouble, false);
    assert.equal(spaced.claims, claims);
  }
  const seventh = calculateDailyBonusStatus(dates(6), 1000, now);
  assert.equal(seventh.nextMultiplier, 2);
  assert.equal(seventh.nextReward, 2000);
  assert.equal(seventh.nextWeeklyBoost, true);
  const thirtieth = calculateDailyBonusStatus(dates(29), 1000, now);
  assert.equal(thirtieth.nextMultiplier, 10.4);
  assert.equal(thirtieth.nextReward, 10400);
  assert.equal(thirtieth.nextMonthlyDouble, true);
  assert.equal(calculateDailyBonusStatus(dates(60), 1000, now).multiplier, 29.2);
});

test("les sequences avec des jours manques reprennent au premier jour", () => {
  for (const [pattern, expectedStreak, expectedMultiplier] of [
    ["VVXVXXV", 1, 1.1],
    ["VXXVVVV", 4, 1.4],
    ["VVVVVVV", 7, 2]
  ]) {
    const history = [...pattern].flatMap((claim, index) => claim === "V" ? [shiftDateKey("2026-09-10", index)] : []);
    const result = calculateDailyBonusStatus(history, 1000, now);
    assert.equal(result.streak, expectedStreak, pattern);
    assert.equal(result.multiplier, expectedMultiplier, pattern);
    assert.equal(result.claims, history.length, pattern);
    assert.equal(result.claimedToday, true, pattern);
  }
  const abandoned = calculateDailyBonusStatus(["2026-09-10"], 1000, now);
  assert.equal(abandoned.claims, 1);
  assert.equal(abandoned.streak, 0);
  assert.equal(abandoned.nextMultiplier, 1.1);
  const resumed = calculateDailyBonusStatus(["2026-09-10", "2026-09-16"], 1000, now);
  assert.equal(resumed.streak, 1);
  assert.equal(resumed.multiplier, 1.1);
});

test("une interruption efface aussi les paliers hebdomadaires et mensuels", () => {
  const history = dates(30, 1, "2026-09-14");
  const result = calculateDailyBonusStatus(history, 1000, now);
  assert.equal(result.claims, 30);
  assert.equal(result.multiplier, 1);
  assert.equal(result.nextMultiplier, 1.1);
  assert.equal(result.nextReward, 1100);
  assert.equal(result.streak, 0);
  assert.equal(result.nextWeeklyBoost, false);
  assert.equal(result.nextMonthlyDouble, false);
  assert.equal(result.claimedToday, false);
  const resumed = calculateDailyBonusStatus([...history, "2026-09-16"], 1000, now);
  assert.equal(resumed.streak, 1);
  assert.equal(resumed.multiplier, 1.1);
  assert.equal(resumed.claims, 31);
});

test("les dates dupliquees et leur ordre ne changent ni la serie ni le total", () => {
  const history = dates(7);
  const result = calculateDailyBonusStatus([...history, history[0], ""].reverse(), 1000, now);
  assert.equal(result.claims, 7);
  assert.equal(result.streak, 7);
  assert.equal(result.multiplier, 2);
  assert.equal(result.nextMultiplier, 2.1);
  assert.equal(result.claimedToday, false);
});

test("un nouveau compte commence au premier palier et le versement est arrondi", () => {
  const result = calculateDailyBonusStatus([], 255, now);
  assert.equal(result.claims, 0);
  assert.equal(result.streak, 0);
  assert.equal(result.multiplier, 1);
  assert.equal(result.nextMultiplier, 1.1);
  assert.equal(result.nextReward, 281);
  assert.equal(result.claimedToday, false);
  assert.equal(calculateDailyBonusStatus([], 0, now).nextReward, 0);
});

test("la série et la limite quotidienne restent calculées dans le fuseau du casino", () => {
  const result = calculateDailyBonusStatus(["2026-09-15", "2026-09-16"], 1000, new Date("2026-09-15T22:30:00Z"));
  assert.equal(result.claimedToday, true);
  assert.equal(result.streak, 2);
  assert.equal(result.claims, 2);
  assert.equal(result.multiplier, 1.2);
});

test("le passage a minuit garde la serie seulement si aucun jour n'a ete manque", () => {
  const history = ["2026-09-14"];
  const beforeMidnight = calculateDailyBonusStatus(history, 1000, new Date("2026-09-15T21:59:59Z"));
  assert.equal(beforeMidnight.streak, 1);
  assert.equal(beforeMidnight.nextMultiplier, 1.2);
  const afterMidnight = calculateDailyBonusStatus(history, 1000, new Date("2026-09-15T22:00:00Z"));
  assert.equal(afterMidnight.streak, 0);
  assert.equal(afterMidnight.nextMultiplier, 1.1);
});

test("les series traversent les changements de mois, d'annee et d'heure", () => {
  for (const [history, at] of [
    [["2026-12-31", "2027-01-01"], "2027-01-02T12:00:00Z"],
    [["2028-02-28", "2028-02-29"], "2028-03-01T12:00:00Z"],
    [["2026-03-28", "2026-03-29"], "2026-03-30T12:00:00Z"],
    [["2026-10-24", "2026-10-25"], "2026-10-26T12:00:00Z"]
  ]) {
    const result = calculateDailyBonusStatus(history, 1000, new Date(at));
    assert.equal(result.streak, 2, at);
    assert.equal(result.nextMultiplier, 1.3, at);
  }
});

test("les paliers configurables respectent leur fréquence et le plafond absolu", () => {
  const config = {
    defaultMultiplier: 1.5,
    maxMultiplier: 3,
    rules: [
      { id: "daily-custom", day: 1, operation: "add", value: 0.25, repeat: true, label: "Quotidien" },
      { id: "third-day", day: 3, operation: "multiply", value: 2, repeat: false, label: "Troisième jour" }
    ]
  };
  const first = calculateDailyBonusStatus([], 1000, now, config);
  assert.equal(first.multiplier, 1.5);
  assert.equal(first.nextMultiplier, 1.75);
  assert.equal(first.nextReward, 1750);
  const third = calculateDailyBonusStatus(dates(2), 1000, now, config);
  assert.equal(third.nextMultiplier, 3);
  assert.equal(third.nextReward, 3000);
  assert.equal(third.nextCapped, true);
  assert.deepEqual(third.nextTierRules.map((rule) => rule.id), ["daily-custom", "third-day"]);
  const afterCap = calculateDailyBonusStatus(dates(20), 1000, now, config);
  assert.equal(afterCap.multiplier, 3);
  assert.equal(afterCap.nextMultiplier, 3);
  assert.equal(afterCap.nextReward, 3000);
});
