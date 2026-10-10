import test from "node:test";
import assert from "node:assert/strict";
import { sqliteSettings } from "../src/storage/sqlite-settings.js";

test("storage defaults to durable FULL and rejects unsafe/injected settings", () => {
  assert.deepEqual(sqliteSettings({}), { synchronous: "FULL", walAutoCheckpoint: 1000 });
  assert.equal(sqliteSettings({ SQLITE_SYNCHRONOUS: "normal" }).synchronous, "NORMAL");
  for (const mode of ["OFF", "0", "NORMAL; DROP TABLE users", "extra"]) assert.throws(() => sqliteSettings({ SQLITE_SYNCHRONOUS: mode }));
});
