import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { DurationTelemetry } from "./duration-telemetry.js";

const failure = (code) => Object.assign(new Error("Traitement temporairement indisponible. Reessaie dans quelques instants."), { code });

// One shared admission limit, not a new set of threads for every feature.
export function createTaskPool({ workerUrl, workerData, services, workerEnv = {}, size = 1, maxPending = 128, maxPerKey = 8, timeoutMs = 10000, tasksPerWorker = 1, serviceConcurrency = {}, WorkerClass = Worker }) {
  if (!Number.isInteger(size) || size < 1 || size > 4 || !Number.isInteger(maxPending) || maxPending < 1 || maxPending > 1024 || !Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error("Invalid task pool limits.");
  const registry = new Map(services.map((name) => [name, {
    submitted: 0, completed: 0, failed: 0, rejected: 0, cancelled: 0, timedOut: 0,
    wait: new DurationTelemetry(), processing: new DurationTelemetry()
  }]));
  if (!Number.isInteger(maxPerKey) || maxPerKey < 1 || maxPerKey > 128) throw new Error("Invalid per-client task limit.");
  if (!Number.isInteger(tasksPerWorker) || tasksPerWorker < 1 || tasksPerWorker > 256 ||
    Object.entries(serviceConcurrency).some(([name, limit]) => !registry.has(name) || !Number.isInteger(limit) || limit < 1 || limit > size * tasksPerWorker)) throw new Error("Invalid task concurrency.");
  const slots = [], queue = [], terminating = new Set(), admitted = new Map();
  let sequence = 0, closed = false, lastIssueAt = null, lastIssueTime = -Infinity, workerErrors = 0, unexpectedExits = 0;
  const issue = () => { lastIssueAt = new Date().toISOString(); lastIssueTime = performance.now(); };
  function finish(job, kind, result) {
    if (!job || job.finished) return;
    job.finished = true;
    clearTimeout(job.timer);
    job.signal?.removeEventListener("abort", job.abort);
    if (job.key) {
      const remaining = (admitted.get(job.key) ?? 1) - 1;
      if (remaining) admitted.set(job.key, remaining); else admitted.delete(job.key);
    }
    const stats = registry.get(job.service);
    stats[kind]++;
    if (job.startedAt != null) stats.processing.record(performance.now() - job.startedAt);
    if (kind === "completed") job.resolve(result);
    else job.reject(result);
  }
  function remove(slot, code) {
    const index = slots.indexOf(slot);
    if (index < 0) return;
    slots.splice(index, 1);
    for (const job of slot.jobs.values()) { clearTimeout(job.timer); finish(job, closed ? "cancelled" : "failed", failure(code)); }
    slot.jobs.clear();
    const termination = slot.worker.terminate().catch(() => {}).finally(() => { terminating.delete(termination); dispatch(); });
    terminating.add(termination);
  }
  function dispatch() {
    if (closed) return;
    const activeCount = () => slots.reduce((sum, slot) => sum + slot.jobs.size, 0);
    while (slots.length + terminating.size < size && slots.length * tasksPerWorker < queue.length + activeCount()) {
      let slot;
      try {
        slot = { worker: new WorkerClass(workerUrl, { workerData, env: workerEnv, execArgv: [] }), jobs: new Map() };
      } catch {
        issue();
        for (const job of queue.splice(0)) finish(job, "failed", failure("TASK_WORK_UNAVAILABLE"));
        return;
      }
      slots.push(slot);
      slot.worker.unref();
      slot.worker.on("message", (message) => {
        const job = slot.jobs.get(message?.id);
        if (!job) return;
        slot.jobs.delete(job.id);
        clearTimeout(job.timer);
        if (!slot.jobs.size) slot.worker.unref();
        if (message.error) { issue(); finish(job, "failed", failure("TASK_WORK_FAILED")); }
        else finish(job, "completed", message.result);
        dispatch();
      });
      const stopped = () => { if (!slots.includes(slot)) return; issue(); remove(slot, "TASK_WORK_UNAVAILABLE"); dispatch(); };
      slot.worker.on("error", () => { if (slots.includes(slot)) workerErrors++; stopped(); });
      slot.worker.on("exit", () => { if (slots.includes(slot) && !closed) unexpectedExits++; stopped(); });
    }
    for (const slot of slots) {
      while (slots.includes(slot) && slot.jobs.size < tasksPerWorker && queue.length) {
        const index = queue.findIndex((job) => !serviceConcurrency[job.service] || slots.reduce((sum, entry) => sum +
          [...entry.jobs.values()].filter((active) => active.service === job.service).length, 0) < serviceConcurrency[job.service]);
        if (index < 0) break;
        const [job] = queue.splice(index, 1);
        slot.jobs.set(job.id, job);
        job.startedAt = performance.now();
        registry.get(job.service).wait.record(job.startedAt - job.queuedAt);
        slot.worker.ref();
        try { slot.worker.postMessage({ id: job.id, service: job.service, payload: job.payload }); }
        catch { issue(); remove(slot, "TASK_WORK_FAILED"); dispatch(); break; }
      }
    }
  }
  return {
    run(service, payload, { signal, key } = {}) {
      if (!registry.has(service)) return Promise.reject(failure("TASK_WORK_UNSUPPORTED"));
      const stats = registry.get(service);
      if (closed || signal?.aborted) return Promise.reject(failure("TASK_WORK_CANCELLED"));
      if (queue.length >= maxPending || key && (admitted.get(key) ?? 0) >= maxPerKey) { stats.rejected++; issue(); return Promise.reject(failure("TASK_WORK_BUSY")); }
      stats.submitted++;
      if (key) admitted.set(key, (admitted.get(key) ?? 0) + 1);
      return new Promise((resolve, reject) => {
        const job = { id: ++sequence, service, payload, resolve, reject, signal, key, queuedAt: performance.now(), startedAt: null };
        const interrupt = (kind, code) => {
          if (job.finished) return;
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
          finish(job, kind, failure(code));
          const slot = slots.find((entry) => entry.jobs.has(job.id));
          if (slot && kind === "cancelled" && slot.worker.independentCancellation) {
            // A readonly result can be discarded without killing unrelated reads.
            // Keep its slot until its reply, and its original deadline as watchdog.
            job.timer = setTimeout(() => { if (slot.jobs.has(job.id)) { issue(); remove(slot, "TASK_WORK_TIMEOUT"); } },
              Math.max(1, timeoutMs - (performance.now() - job.queuedAt)));
          } else if (slot) { slot.jobs.delete(job.id); remove(slot, code); }
          if (kind === "timedOut") issue();
          dispatch();
        };
        job.abort = () => interrupt("cancelled", "TASK_WORK_CANCELLED");
        job.timer = setTimeout(() => interrupt("timedOut", "TASK_WORK_TIMEOUT"), timeoutMs);
        signal?.addEventListener("abort", job.abort, { once: true });
        queue.push(job);
        dispatch();
      });
    },
    health() {
      const now = performance.now(), busy = slots.filter((slot) => slot.jobs.size).length;
      const oldestWaitMs = queue.length ? Math.round(now - queue[0].queuedAt) : 0;
      return { status: closed ? "stopped" : now - lastIssueTime < 60000 || oldestWaitMs > 1000 || queue.length >= maxPending * .8 ? "warning" : "healthy",
        capacity: size, started: slots.length, busy, idle: slots.length - busy, queued: queue.length, queueCapacity: maxPending, perClientCapacity: maxPerKey, oldestWaitMs, lastIssueAt, workerErrors, unexpectedExits,
        inFlight: slots.reduce((sum, slot) => sum + slot.jobs.size, 0), taskCapacity: size * tasksPerWorker,
        processes: slots.flatMap((slot) => typeof slot.worker.health === "function" ? [slot.worker.health()] : []),
        services: Object.fromEntries([...registry].map(([name, stats]) => [name, {
          ...stats, wait: stats.wait.snapshot(now), processing: stats.processing.snapshot(now),
          busy: slots.reduce((sum, slot) => sum + [...slot.jobs.values()].filter((job) => job.service === name).length, 0),
          queued: queue.filter((job) => job.service === name).length
        }])) };
    },
    async close() {
      closed = true;
      for (const job of queue.splice(0)) finish(job, "cancelled", failure("TASK_WORK_CANCELLED"));
      for (const slot of [...slots]) remove(slot, "TASK_WORK_CANCELLED");
      await Promise.all([...terminating]);
    }
  };
}
