import assert from "node:assert/strict";
import test from "node:test";
import { databaseHealthProbe } from "../src/services/database-status-probe.js";

test("reusable SQLite pages are maintenance information, not a public outage", () => {
  const health = { fragmentationRatio: .92, freePages: 2671, pageCount: 2910, fileBytes: 11919360, walBytes: 733392 };
  assert.equal(databaseHealthProbe(health, .7).status, "operational");
  assert.equal(databaseHealthProbe(health, 501).status, "degraded");
  assert.match(databaseHealthProbe(health, 501).message, /ralenties/);
  assert.equal(databaseHealthProbe({ ...health, walBytes: 70 * 1048576 }, .7).status, "degraded");
  assert.equal(databaseHealthProbe({ ...health, walBytes: 2 * 1048576 }, .7).diagnostic, "");
});
