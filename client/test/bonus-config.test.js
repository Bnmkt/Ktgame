import assert from "node:assert/strict";
import test from "node:test";
import { bonusProgression } from "../src/features/bonus/config.js";

test("la prévisualisation conserve les paliers historiques par défaut", () => {
  const settings = {
    dailyTokens: 1000,
    dailyBonusDefaultMultiplier: 1,
    dailyBonusMaxMultiplier: 100,
    dailyBonusRules: [
      { id: "daily", day: 1, operation: "add", value: 0.1, repeat: true },
      { id: "weekly", day: 7, operation: "add", value: 0.3, repeat: true },
      { id: "monthly", day: 30, operation: "multiply", value: 2, repeat: true }
    ]
  };
  const rows = bonusProgression(settings, 30);
  assert.equal(rows[6].multiplier, 2);
  assert.equal(rows[29].multiplier, 10.4);
  assert.equal(rows[29].amount, 10400);
});

test("la prévisualisation ne dépasse jamais le multiplicateur maximal", () => {
  const rows = bonusProgression({
    dailyTokens: 500,
    dailyBonusDefaultMultiplier: 1.5,
    dailyBonusMaxMultiplier: 3,
    dailyBonusRules: [{ id: "daily", day: 1, operation: "multiply", value: 2, repeat: true }]
  }, 20);
  assert.ok(rows.every((row) => row.multiplier <= 3));
  assert.ok(rows.every((row) => row.amount <= 1500));
  assert.equal(rows.at(-1).multiplier, 3);
});
