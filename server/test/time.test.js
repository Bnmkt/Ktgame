import assert from "node:assert/strict";
import test from "node:test";
import { CASINO_TIME_ZONE, casinoDateKey, shiftDateKey, validDateOnly } from "../src/services/time.js";

test("la journée du casino suit Europe/Brussels plutôt que la date UTC", () => {
  assert.equal(CASINO_TIME_ZONE, process.env.CASINO_TIME_ZONE || "Europe/Brussels");
  assert.equal(casinoDateKey("2026-09-12T22:30:00.000Z"), "2026-09-13");
  assert.equal(shiftDateKey("2026-09-13", -1), "2026-09-12");
});

test("les dates civiles valident aussi les jours et années bissextiles", () => {
  assert.equal(validDateOnly("2024-02-29"), true);
  assert.equal(validDateOnly("2026-02-29"), false);
  assert.equal(validDateOnly("2026-04-31"), false);
});
