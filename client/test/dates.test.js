import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { validDateOnly } from "../src/utils/dates.js";

test("les dates civiles refusent les jours impossibles sans changer de fuseau", () => {
  assert.equal(validDateOnly("2000-02-29"), true);
  assert.equal(validDateOnly("2026-02-29"), false);
  assert.equal(validDateOnly("2026-04-31"), false);
});
test("les champs horaires convertissent une seule fois, y compris aux changements d’heure", () => {
  for (const [zone, summer, winter] of [["Europe/Brussels", "2026-07-01T10:00:00.000Z", "2026-01-01T11:00:00.000Z"], ["America/New_York", "2026-07-01T16:00:00.000Z", "2026-01-01T17:00:00.000Z"], ["UTC", "2026-07-01T12:00:00.000Z", "2026-01-01T12:00:00.000Z"]]) {
    const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `import {localDateTime,localDateTimeToIso,casinoDate} from ${JSON.stringify(new URL("../src/utils/dates.js", import.meta.url).href)};console.log(JSON.stringify([localDateTimeToIso('2026-07-01T12:00'),localDateTimeToIso('2026-01-01T12:00'),localDateTimeToIso(localDateTime('2026-10-25T01:30:45.000Z'),'2026-10-25T01:30:45.000Z'),casinoDate(new Date('2026-07-01T22:30:00Z')),localDateTimeToIso('2026-03-29T02:30')]));`], { env: { ...process.env, TZ: zone }, encoding: "utf8" }));
    assert.equal(result[0], summer); assert.equal(result[1], winter);
    assert.equal(result[2], "2026-10-25T01:30:45.000Z");
    assert.equal(result[3], "2026-07-02");
    if (zone === "Europe/Brussels") assert.equal(result[4], "");
  }
});
