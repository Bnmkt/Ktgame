import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTaskPool } from "../src/services/task-pool.js";
import { createServiceExecution } from "../src/services/service-execution.js";
import { createExecutionHistory } from "../src/services/execution-history.js";

class FakeWorker extends EventEmitter {
  static instances = [];
  constructor() { super(); FakeWorker.instances.push(this); }
  ref() {} unref() {}
  postMessage(message) { this.message = message; }
  async terminate() { this.emit("exit", 0); }
  complete(result = "ok") { this.emit("message", { id: this.message.id, result }); }
}
function pool(options = {}) {
  FakeWorker.instances = [];
  return createTaskPool({ workerUrl: new URL("../src/services/reading-worker.js", import.meta.url), services: ["history", "statistics"], WorkerClass: FakeWorker, ...options });
}

test("bounded shared pool separates anonymous service counters and rejects saturation", async () => {
  const work = pool({ size: 1, maxPending: 1 });
  try {
    const first = work.run("history", { secret: "must-not-be-in-metrics" });
    const second = work.run("statistics", { userId: "private-user" });
    await assert.rejects(work.run("history", {}), { code: "TASK_WORK_BUSY" });
    const health = work.health();
    assert.equal(health.busy, 1); assert.equal(health.queued, 1);
    assert.equal(health.services.history.rejected, 1);
    assert.ok(!/private-user|must-not-be-in-metrics/.test(JSON.stringify(health)));
    FakeWorker.instances[0].complete(); assert.equal(await first, "ok");
    FakeWorker.instances[0].complete(123); assert.equal(await second, 123);
    assert.equal(work.health().services.statistics.completed, 1);
    await assert.rejects(work.run("write", {}), { code: "TASK_WORK_UNSUPPORTED" });
  } finally { await work.close(); }
});

test("worker failure is explicit; next read recreates a worker without retrying failed work", async () => {
  const work = pool();
  try {
    const first = assert.rejects(work.run("history", {}), { code: "TASK_WORK_UNAVAILABLE" });
    FakeWorker.instances[0].emit("error", new Error("private failure detail"));
    await first;
    await new Promise((resolve) => setImmediate(resolve));
    const next = work.run("history", {});
    assert.equal(FakeWorker.instances.length, 2);
    FakeWorker.instances[1].complete(); await next;
    assert.equal(work.health().services.history.failed, 1);
  } finally { await work.close(); }
});

test("one account cannot monopolize admission and its quota is released after completion", async () => {
  const work = pool({ maxPerKey: 1 });
  try {
    const first = work.run("history", {}, { key: "private-account" });
    await assert.rejects(work.run("statistics", {}, { key: "private-account" }), { code: "TASK_WORK_BUSY" });
    const other = work.run("history", {}, { key: "other-account" });
    FakeWorker.instances[0].complete(); await first;
    const next = work.run("history", {}, { key: "private-account" });
    FakeWorker.instances[0].complete(); await other;
    FakeWorker.instances[0].complete(); await next;
    assert.ok(!JSON.stringify(work.health()).includes("private-account"));
  } finally { await work.close(); }
});

test("deadline covers both queued and running work and releases pool slots", async () => {
  const work = pool({ timeoutMs: 25 });
  try {
    await Promise.all([assert.rejects(work.run("history", {}), { code: "TASK_WORK_TIMEOUT" }), assert.rejects(work.run("statistics", {}), { code: "TASK_WORK_TIMEOUT" })]);
    assert.equal(work.health().queued, 0); assert.equal(work.health().busy, 0);
    assert.equal(work.health().services.history.timedOut, 1);
    await new Promise((resolve) => setImmediate(resolve));
    const next = work.run("history", {}); FakeWorker.instances.at(-1).complete(); await next;
  } finally { await work.close(); }
});

test("disconnect cancels queued and running reads; shutdown settles every pending promise", async () => {
  const work = pool(), controller = new AbortController();
  const first = assert.rejects(work.run("history", {}, { signal: controller.signal }), { code: "TASK_WORK_CANCELLED" });
  const second = assert.rejects(work.run("statistics", {}), { code: "TASK_WORK_CANCELLED" });
  controller.abort(); await first;
  await work.close(); await second;
  assert.equal(work.health().services.history.cancelled, 1);
  assert.equal(work.health().services.statistics.cancelled, 1);
  assert.equal(work.health().started, 0);
});

test("constructor and postMessage failures do not leave outstanding tasks", async () => {
  class BrokenWorker extends FakeWorker { postMessage() { throw new Error("DataCloneError"); } }
  const work = pool({ WorkerClass: BrokenWorker });
  try { await assert.rejects(work.run("history", {}), { code: "TASK_WORK_FAILED" }); assert.equal(work.health().busy, 0); }
  finally { await work.close(); }
  class BrokenConstructor { constructor() { throw new Error("Unavailable"); } }
  const unavailable = pool({ WorkerClass: BrokenConstructor });
  try { await assert.rejects(unavailable.run("history", {}), { code: "TASK_WORK_UNAVAILABLE" }); }
  finally { await unavailable.close(); }
});

test("main service measurements preserve sync/async return values and failures", async () => {
  const services = createServiceExecution(), state = { tokens: 1 };
  assert.equal(services.measure("transactions", () => ++state.tokens), 2);
  assert.equal(await services.measure("information", async () => 3), 3);
  assert.throws(() => services.measure("ranked", () => { throw new Error("no"); }));
  await assert.rejects(services.measure("history", async () => { throw new Error("no"); }));
  services.record("interface", 10, false);
  const health = services.health();
  assert.equal(health.transactions.completed, 1); assert.equal(health.ranked.failed, 1);
  assert.equal(health.history.busy, 0); assert.equal(health.interface.failed, 1);
  assert.equal(health.rooms.processing.p95Ms, null);
  assert.equal(health.transactions.mode, "main");
});

test("durable anonymous metrics use deltas, survive restart and expire after 30 days", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-execution-history-"));
  const filename = path.join(directory, "metrics.sqlite");
  let now = Date.parse("2026-10-09T12:00:00Z"), store;
  const services = createServiceExecution();
  try {
    store = createExecutionHistory(filename, { now: () => now });
    services.record("rooms", 20); now += 300000; store.sample(services.health());
    services.record("rooms", 40); now += 300000; store.sample(services.health());
    assert.equal(store.health().services.rooms.completed, 2);
    assert.equal(store.health().services.rooms.averageMs, 30);
    store.close(); store = createExecutionHistory(filename, { now: () => now });
    assert.equal(store.health().services.rooms.completed, 2);
    now += 31 * 86400000; store.sample(createServiceExecution().health());
    assert.equal(store.health().services.rooms.completed, 0);
    assert.ok(!JSON.stringify(store.health()).includes(filename));
  } finally { store?.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

class MultiplexWorker extends FakeWorker {
  constructor() { super(); this.messages = []; }
  postMessage(message) { this.messages.push(message); }
  reply(index, result = "ok") { this.emit("message", { id: this.messages[index].id, result }); }
}

test("bounded multiplexing matches out-of-order responses and bypasses saturated service quotas", async () => {
  const work = pool({ WorkerClass: MultiplexWorker, tasksPerWorker: 3, serviceConcurrency: { history: 1 } });
  try {
    const first = work.run("history", { value: 1 }), second = work.run("history", { value: 2 });
    const parallel = work.run("statistics", { value: 3 });
    const child = FakeWorker.instances[0];
    assert.equal(FakeWorker.instances.length, 1); assert.equal(work.health().inFlight, 2);
    assert.equal(work.health().queued, 1); assert.equal(child.messages[1].service, "statistics");
    child.reply(1, "third"); assert.equal(await parallel, "third");
    child.reply(0, "first"); assert.equal(await first, "first");
    child.reply(2, "second"); assert.equal(await second, "second");
    assert.equal(work.health().inFlight, 0); assert.equal(work.health().services.history.completed, 2);
  } finally { await work.close(); }
});

test("cancelled readonly RPC retains its bounded slot without interrupting unrelated clients", async () => {
  class ReadWorker extends MultiplexWorker { independentCancellation = true; }
  const work = pool({ WorkerClass: ReadWorker, tasksPerWorker: 2 }), controller = new AbortController();
  try {
    const cancelled = assert.rejects(work.run("history", {}, { signal: controller.signal }), { code: "TASK_WORK_CANCELLED" });
    const other = work.run("statistics", {}), waiting = work.run("history", {});
    const child = FakeWorker.instances[0];
    controller.abort(); await cancelled;
    assert.equal(work.health().started, 1); assert.equal(work.health().inFlight, 2); assert.equal(work.health().queued, 1);
    child.reply(1); await other;
    child.reply(2); await waiting;
    child.reply(0);
    assert.equal(work.health().inFlight, 0); assert.equal(work.health().services.history.cancelled, 1);
    assert.equal(work.health().services.history.completed, 1);
  } finally { await work.close(); }
});

test("cancelled readonly RPC still has a watchdog, and a hung process fails all remaining work once", async () => {
  class ReadWorker extends MultiplexWorker { independentCancellation = true; }
  const work = pool({ WorkerClass: ReadWorker, tasksPerWorker: 2, timeoutMs: 50 }), controller = new AbortController();
  const cancelled = assert.rejects(work.run("history", {}, { signal: controller.signal }), { code: "TASK_WORK_CANCELLED" });
  const other = assert.rejects(work.run("statistics", {}), (error) => ["TASK_WORK_TIMEOUT", "TASK_WORK_UNAVAILABLE"].includes(error.code));
  controller.abort(); await cancelled;
  try { await other; assert.equal(work.health().started, 0); assert.equal(work.health().services.history.cancelled, 1); }
  finally { await work.close(); }
});
