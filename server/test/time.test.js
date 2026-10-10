import assert from "node:assert/strict";
import test from "node:test";
import { CASINO_TIME_ZONE, casinoDateKey, casinoTimeParts, shiftDateKey, validDateOnly } from "../src/services/time.js";

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

test("cached calendar values remain exact at midnight, DST and arbitrary historical reads", () => {
  assert.equal(casinoDateKey("2026-10-09T21:59:59.999Z"), "2026-10-09");
  assert.equal(casinoDateKey("2026-10-09T22:00:00.001Z"), "2026-10-10");
  assert.equal(casinoTimeParts("2026-10-25T00:59:59.999Z").hour, 2);
  assert.equal(casinoTimeParts("2026-10-25T01:00:00.000Z").hour, 2);
  assert.equal(casinoTimeParts("2026-03-29T00:59:59.999Z").hour, 1);
  assert.equal(casinoTimeParts("2026-03-29T01:00:00.000Z").hour, 3);
  const value = casinoTimeParts("2026-10-09T22:00:00.001Z"); value.hour = 19;
  assert.equal(casinoTimeParts("2026-10-09T22:00:00.999Z").hour, 0);
  for (let i = 0; i < 300; i++) casinoDateKey(Date.UTC(2020, 0, i + 1));
  assert.equal(casinoDateKey("2026-10-09T22:00:00.001Z"), "2026-10-10");
  assert.equal(casinoDateKey("invalid"), ""); assert.equal(casinoTimeParts("invalid"), null);
});
