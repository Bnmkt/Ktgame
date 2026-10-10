import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { DurationTelemetry } from "./duration-telemetry.js";

export function createPasswordWork({ size = Math.max(1, Math.min(4, availableParallelism() - 1)), maxPending = 128, WorkerClass = Worker } = {}) {
  if (!Number.isInteger(size) || size < 1 || size > 4 || !Number.isInteger(maxPending) || maxPending < 1 || maxPending > 1024) throw new Error("Invalid password worker limits.");
  const workers = [], queue = [];
  const wait = new DurationTelemetry(), processing = new DurationTelemetry();
  const totals = { submitted: 0, completed: 0, failed: 0, cancelled: 0, rejected: 0, workerErrors: 0, unexpectedExits: 0 };
  let lastIssueAt = null, lastIssueTime = -Infinity;
  let sequence = 0, closed = false;
  function issue() { lastIssueAt = new Date().toISOString(); lastIssueTime = performance.now(); }
  function rejectJob(job, error) { if (!job) return; totals[closed ? "cancelled" : "failed"]++; job.reject(error); }
  function dispatch() {
    for (const slot of workers) {
      if (slot.job || !queue.length) continue;
      slot.job = queue.shift();
      slot.job.startedAt = performance.now();
      wait.record(slot.job.startedAt - slot.job.queuedAt);
      slot.worker.ref();
      const { id, operation, value, argument } = slot.job;
      slot.worker.postMessage({ id, operation, value, argument });
    }
  }
  function addWorker() {
    const slot = { worker: new WorkerClass(new URL("./password-worker.js", import.meta.url)), job: null };
    workers.push(slot);
    slot.worker.unref();
    slot.worker.on("message", (message) => {
      const job = slot.job;
      if (!job || job.id !== message.id) return;
      slot.job = null;
      slot.worker.unref();
      processing.record(performance.now() - job.startedAt);
      if (message.error) { issue(); rejectJob(job, new Error(message.error)); }
      else { totals.completed++; job.resolve(message.result); }
      dispatch();
    });
    const failed = (error) => {
      const index = workers.indexOf(slot);
      if (index < 0) return;
      workers.splice(index, 1);
      rejectJob(slot.job, error);
      slot.job = null;
      // Fail queued work explicitly; never silently retry a security operation.
      for (const job of queue.splice(0)) rejectJob(job, error);
    };
    slot.worker.on("error", (error) => { if (!closed) { totals.workerErrors++; issue(); } failed(error); });
    slot.worker.on("exit", () => { if (!closed) { totals.unexpectedExits++; issue(); } failed(new Error("Password worker stopped.")); });
  }
  function run(operation, value, argument) {
    if (closed) return Promise.reject(new Error("Password workers closed."));
    if (queue.length >= maxPending) {
      totals.rejected++; issue();
      const error = new Error("Trop de connexions simultanees. Reessaie dans quelques instants.");
      error.code = "PASSWORD_WORK_BUSY";
      return Promise.reject(error);
    }
    if (workers.length < size) addWorker();
    totals.submitted++;
    return new Promise((resolve, reject) => { queue.push({ id: ++sequence, operation, value, argument, resolve, reject, queuedAt: performance.now() }); dispatch(); });
  }
  return {
    hash: (value, rounds) => run("hash", value, rounds),
    compare: (value, hash) => run("compare", value, hash),
    health() {
      const now = performance.now(), busy = workers.filter((slot) => slot.job).length;
      const oldestWaitMs = queue.length ? Number((now - queue[0].queuedAt).toFixed(3)) : 0;
      return { status: closed ? "stopped" : oldestWaitMs > 1000 || queue.length >= maxPending * .8 || now - lastIssueTime < 60000 ? "warning" : "healthy",
        capacity: size, started: workers.length, busy, idle: workers.length - busy,
        queued: queue.length, queueCapacity: maxPending, oldestWaitMs, ...totals, lastIssueAt,
        wait: wait.snapshot(now), processing: processing.snapshot(now), timingWindowSeconds: 60, timingSampleLimit: 256 };
    },
    async close() {
      closed = true;
      for (const job of queue.splice(0)) rejectJob(job, new Error("Password workers closed."));
      await Promise.all(workers.map((slot) => slot.worker.terminate()));
    }
  };
}

export const passwordWork = createPasswordWork();
