import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("administrator bootstrap requires an existing unique active email, backs up and leaves authentication unchanged", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-admin-bootstrap-")), filename = path.join(directory, "main.sqlite");
  const db = new DatabaseSync(filename);
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,guest INTEGER)");
  const original = { id: "fixture", pseudo: "not-an-admin-name", email: "owner@example.com", active: true, admin: false, passwordHash: "unchanged", sessionVersion: 3 };
  db.prepare("INSERT INTO users VALUES(?,?,0)").run(original.id, JSON.stringify(original));
  const run = (...args) => spawnSync(process.execPath, ["scripts/grant-admin.mjs", ...args], { cwd: new URL("../", import.meta.url), env: { ...process.env, SQLITE_PATH: filename }, encoding: "utf8", windowsHide: true });
  try {
    assert.notEqual(run("--email", "missing@example.com", "--apply").status, 0);
    assert.equal(run("--email", "owner@example.com").status, 0);
    assert.deepEqual(JSON.parse(db.prepare("SELECT data FROM users").get().data), original);
    const applied = run("--email", "OWNER@example.com", "--apply"); assert.equal(applied.status, 0, applied.stderr);
    assert.deepEqual(JSON.parse(db.prepare("SELECT data FROM users").get().data), { ...original, admin: true });
    assert.equal(fs.readdirSync(directory).filter((name) => name.includes("before-admin-")).length, 1);
    assert.equal(run("--email", "owner@example.com", "--apply").status, 0);
    assert.equal(fs.readdirSync(directory).filter((name) => name.includes("before-admin-")).length, 1);
  } finally {
    db.close(); assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith("ktga-admin-bootstrap-")); fs.rmSync(directory, { recursive: true, force: true });
  }
});
