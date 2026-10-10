import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createPasswordWork } from "../src/services/password-work.js";
import { ConfigurationCache } from "../src/services/configuration-cache.js";
import { PlayerProgressCache } from "../src/services/player-progress-cache.js";
import { DurationTelemetry } from "../src/services/duration-telemetry.js";

class TestWorker extends EventEmitter {
  ref() {}
  unref() {}
  postMessage(message) { this.message = message; }
  finish(result = true) { this.emit("message", { id: this.message.id, result }); }
  async terminate() { this.emit("exit", 1); }
}

test("worker health reflects admission, busy slots, waiting, completion and saturation without credentials", async () => {
  const slots = [];
  class Worker extends TestWorker { constructor() { super(); slots.push(this); } }
  const work = createPasswordWork({ size: 1, maxPending: 1, WorkerClass: Worker });
  try {
    const before = work.health();
    assert.equal(before.started, 0); assert.equal(before.status, "healthy");
    const first = work.compare("private-password", "private-hash"), second = work.hash("other-secret", 10);
    const busy = work.health();
    assert.equal(busy.started, 1); assert.equal(busy.busy, 1); assert.equal(busy.idle, 0); assert.equal(busy.queued, 1);
    assert.equal(busy.submitted, 2); assert.equal(busy.wait.count, 1);
    await assert.rejects(work.hash("rejected-secret", 10), { code: "PASSWORD_WORK_BUSY" });
    assert.equal(work.health().rejected, 1); assert.equal(work.health().status, "warning");
    slots[0].finish(false); assert.equal(await first, false);
    slots[0].finish("a-hash"); assert.equal(await second, "a-hash");
    const result = work.health();
    assert.equal(result.completed, 2); assert.equal(result.failed, 0); assert.equal(result.busy, 0); assert.equal(result.queued, 0);
    assert.equal(result.processing.count, 2); assert.equal(result.wait.count, 2); assert.ok(result.lastIssueAt);
    assert.ok(!/private-password|private-hash|other-secret|rejected-secret|a-hash/.test(JSON.stringify(result)));
    result.completed = 999; assert.equal(work.health().completed, 2);
  } finally { await work.close(); }
  assert.equal(work.health().status, "stopped"); assert.equal(work.health().unexpectedExits, 0);
});

test("unexpected worker failure rejects all affected tasks once and permits a fresh worker", async () => {
  const slots = [];
  class Worker extends TestWorker { constructor() { super(); slots.push(this); } }
  const work = createPasswordWork({ size: 1, WorkerClass: Worker });
  try {
    const first = work.hash("first", 10), second = work.hash("second", 10);
    const rejected = Promise.all([assert.rejects(first, /worker failed/), assert.rejects(second, /worker failed/)]);
    slots[0].emit("error", new Error("worker failed")); slots[0].emit("exit", 1);
    await rejected;
    const failed = work.health();
    assert.equal(failed.failed, 2); assert.equal(failed.workerErrors, 1); assert.equal(failed.unexpectedExits, 1);
    assert.equal(failed.started, 0); assert.equal(failed.queued, 0); assert.equal(failed.status, "warning");
    const next = work.hash("next", 10); slots[1].finish("result"); await next;
    assert.equal(work.health().completed, 1); assert.equal(work.health().failed, 2);
  } finally { await work.close(); }
});

test("normal shutdown records cancellations, not infrastructure failures", async () => {
  const work = createPasswordWork({ size: 1, WorkerClass: TestWorker });
  const active = work.hash("active", 10), queued = work.hash("queued", 10);
  const rejected = Promise.all([assert.rejects(active, /stopped/), assert.rejects(queued, /closed/)]);
  await work.close(); await rejected;
  const health = work.health();
  assert.equal(health.cancelled, 2); assert.equal(health.failed, 0); assert.equal(health.unexpectedExits, 0); assert.equal(health.workerErrors, 0);
});

test("duration metrics keep at most 256 observations and expire recent percentiles", () => {
  const telemetry = new DurationTelemetry();
  assert.equal(telemetry.snapshot(0).p95Ms, null);
  for (let i = 1; i <= 1000; i++) telemetry.record(i, 1000);
  assert.equal(telemetry.samples.length, 256);
  const current = telemetry.snapshot(1000);
  assert.equal(current.count, 1000); assert.equal(current.averageMs, 500.5); assert.equal(current.maxMs, 1000);
  assert.equal(current.recentSamples, 256); assert.equal(current.p95Ms, 988);
  assert.equal(telemetry.snapshot(61001).p95Ms, null); assert.equal(telemetry.snapshot(61001).count, 1000);
});

test("configuration cache counts scoped reuse and invalidations without exposing settings", () => {
  const cache = new ConfigurationCache(), settings = { value: "private-setting" };
  const get = () => cache.get("settings", settings, () => settings);
  get(); cache.read(() => { get(); get(); }); settings.value = "changed"; get();
  assert.deepEqual(cache.health(), { entries:1, capacity:null, requests:4, hits:2, misses:2, invalidations:1, evictions:0, hitRate:.5 });
  assert.ok(!JSON.stringify(cache.health()).includes("private-setting"));
});

test("progress cache counts invalidation and bounded eviction without exposing player IDs", () => {
  const cache = new PlayerProgressCache(1), references = [{}], build = () => ({ progress:1 });
  cache.get("private-user", references, 0, build); cache.get("private-user", references, 0, build);
  cache.get("private-user", references, 1, build); cache.get("another-user", references, 0, build);
  assert.deepEqual(cache.health(), { entries:1, capacity:1, requests:4, hits:1, misses:3, invalidations:1, evictions:1, hitRate:.25 });
  assert.ok(!JSON.stringify(cache.health()).includes("private-user"));
});
