import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createCapacityTests } from "../src/services/capacity-tests.js";
import { testDefaults, validateTestConfig, testProcessEnvironment, sanitizeTestReport } from "../src/services/capacity-config.js";

test("test settings reject arbitrary URLs, commands, paths, games and unbounded loads", () => {
  assert.equal(validateTestConfig({}).clients, 10);
  assert.equal(validateTestConfig({ clients: 2000 }).clients, 2000);
  for (const config of [{ target: "https://api.ktga.me" }, { command: "sh" }, { clients: 2001 }, { seconds: 1801 }, { actionMs: 0 }, { games: [] }, { games: ["unknown"] }, { games: ["belote"], clients: 2 }, { ranked: "true" }, { clients: "100" }, { freeMemoryMb: 0 }, { clients: 1000, seconds: 1800, rampMs: 5000, roomRampMs: 5000 }]) assert.throws(() => validateTestConfig(config));
  assert.deepEqual(validateTestConfig({ games: ["yahtzee", "yahtzee"] }).games, ["yahtzee"]);
});
test("only a runtime allowlist reaches test processes, without SMTP, JWT, preload or production stores", () => {
  const env = testProcessEnvironment({ Path: "runtime", SystemRoot: "windows", SMTP_PASS: "secret", JWT_SECRET: "secret", SQLITE_PATH: "production", NODE_OPTIONS: "--import spy.mjs", PASSWORD_WORKERS: "2" });
  assert.deepEqual(env, { Path: "runtime", SystemRoot: "windows", PASSWORD_WORKERS: "2", KTGA_TEST_CHILD: "1" });
});
test("exports keep useful timings and integrity but remove fixture credentials and raw error text", () => {
  const clean = sanitizeTestReport({ runId: "capacity-123456abcdef", manifest: "private", password: "secret", target: "http://localhost:1234", failures: { "POST /api/auth/login: 401 password=secret jane@example.com": 3 }, health: [{ workers: { token: "secret", queued: 2 } }], integrity: { checks: { integrity: true }, counts: { users: 2 }, passed: true, xpDifferences: ["user123"] } });
  const text = JSON.stringify(clean);
  for (const secret of ["private", "secret", "localhost", "jane@example.com", "user123"]) assert.ok(!text.includes(secret));
  assert.deepEqual(clean.failures, [{ route: "POST /api/auth/login", category: "401", count: 3 }]);
  assert.equal(clean.integrity.xpDifferenceCount, 1);
});
function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-tests-unit-"));
  const filename = path.join(directory, "tests.sqlite");
  let child;
  const spawn = (_file, _args, settings) => {
    child = new EventEmitter(); child.settings = settings; child.connected = true;
    child.send = (message, callback) => { child.lastMessage = message; callback?.(); };
    child.disconnect = () => { child.connected = false; child.emit("exit", 0); };
    return child;
  };
  const store = createCapacityTests(filename, { spawn, ...options });
  return { store, filename, directory, child: () => child, async close() { if (child?.connected) child.emit("exit", 0); await store.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}
test("a single isolated run is admitted, progress survives reconnect, partial stop is retained", async () => {
  const f = fixture();
  try {
    const run = f.store.start({ games: ["yahtzee"] });
    assert.equal(f.child().lastMessage.type, "start"); assert.equal(f.child().settings.windowsHide, true);
    assert.throws(() => f.store.start({}), (error) => error.status === 409);
    f.child().emit("message", { type: "progress", data: { phase: "load", clients: 10, actions: 20, token: "secret" } });
    assert.equal(f.store.get(run.id).samples.length, 1); assert.ok(!JSON.stringify(f.store.get(run.id)).includes("secret"));
    assert.equal(f.store.stop(run.id).state, "stopping"); assert.equal(f.child().lastMessage.type, "stop");
    f.child().emit("message", { type: "result", data: { passed: false, stopReason: "interrupted", counters: { actions: 20 } } });
    f.child().emit("exit", 0);
    assert.equal(f.store.get(run.id).state, "stopped"); assert.equal(f.store.get(run.id).stopReason, "admin-stop");
    assert.equal(f.store.get("unknown"), null); assert.equal(f.store.list().activeId, null);
  } finally { await f.close(); }
});
test("a real table blocks launch before spawning; child instances cannot launch nested tests", async () => {
  const f = fixture({ guard: () => ({ rooms: 1 }) });
  try { assert.throws(() => f.store.start({}), (error) => error.status === 409); assert.equal(f.child(), undefined); } finally { await f.close(); }
  const disabled = createCapacityTests("not-a-database", { enabled: false }); assert.equal(disabled.available, false); await disabled.close();
});
test("active runs recover as interrupted after restart and retention excludes old reports", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-tests-retention-")), filename = path.join(directory, "tests.sqlite");
  let store = createCapacityTests(filename); await store.close();
  const db = new DatabaseSync(filename);
  const now = Date.now();
  for (let i = 0; i < 60; i++) { const createdAt = new Date(now - i * 1000).toISOString(), data = { id: String(i), createdAt, state: i === 0 ? "running" : "passed", config: testDefaults }; db.prepare("INSERT INTO test_runs VALUES(?,?,?,?)").run(String(i), createdAt, data.state, JSON.stringify(data)); }
  db.close(); store = createCapacityTests(filename);
  try { assert.equal(store.list().runs.length, 50); assert.equal(store.get("0").state, "interrupted"); assert.equal(store.get("59"), null); } finally { await store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test("the real supervisor plays games, verifies integrity, and tears down its own fixture", { timeout: 90000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-tests-real-"));
  const store = createCapacityTests(path.join(directory, "tests.sqlite"));
  try {
    const run = store.start({ clients: 4, seconds: 10, games: ["yahtzee"], events: false, chat: false, actionMs: 250 });
    let result;
    const deadline = Date.now() + 80000;
    do { await new Promise((resolve) => setTimeout(resolve, 500)); result = store.get(run.id); } while (["starting", "running", "stopping"].includes(result.state) && Date.now() < deadline);
    assert.equal(result.state, "passed", JSON.stringify(result.report)); assert.ok(result.report.counters.actions > 0); assert.equal(result.report.counters.errors, 0); assert.equal(result.report.integrity.passed, true);
    assert.ok(result.report.health.some((sample) => sample.services?.history));
    const partial = store.start({ clients: 4, seconds: 60, games: ["yahtzee"], events: false, chat: false, actionMs: 250 });
    let stopped;
    do { await new Promise((resolve) => setTimeout(resolve, 500)); stopped = store.get(partial.id); } while (!stopped.progress?.actions && Date.now() < deadline);
    assert.ok(stopped.progress.actions > 0); store.stop(partial.id);
    do { await new Promise((resolve) => setTimeout(resolve, 500)); stopped = store.get(partial.id); } while (["starting", "running", "stopping"].includes(stopped.state) && Date.now() < deadline);
    assert.equal(stopped.state, "stopped"); assert.equal(stopped.report.integrity.passed, true); assert.equal(stopped.stopReason, "admin-stop");
  } finally { await store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
