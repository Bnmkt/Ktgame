import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import { DurationTelemetry } from "./duration-telemetry.js";

const failure = (code) => Object.assign(new Error("Game Worker temporarily unavailable."), { code });

// Transport contract: request(operation, payload), due events, health(), close().
// Redis can implement this contract without owning game rules or settlements.
export class GameIpcTransport extends EventEmitter {
  constructor({ workerId, maxPending = 256, concurrency = 16, timeoutMs = 10000 }) {
    super();
    this.workerId = workerId; this.maxPending = maxPending; this.concurrency = concurrency; this.timeoutMs = timeoutMs;
    this.sequence = 0; this.pending = new Map(); this.queue = []; this.closed = false;
    this.latency = new DurationTelemetry(); this.wait = new DurationTelemetry();
    this.errors = 0; this.timeouts = 0; this.rejected = 0;
    const keys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "CASINO_TIME_ZONE"];
    const env = Object.fromEntries(keys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    this.child = fork(new URL("./game-worker-process.js", import.meta.url), [], {
      env, execArgv: [], serialization: "advanced", windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"]
    });
    this.snapshot = { role: "game", workerId, pid: this.child.pid, status: "starting", rooms: 0 };
    this.child.on("message", (message) => {
      if (message?.type === "telemetry") { this.snapshot = { ...this.snapshot, ...message.data, status: "healthy" }; return; }
      if (message?.type === "due") { this.emit("due", message.roomIds); return; }
      const job = this.pending.get(message?.id);
      if (!job) return;
      this.pending.delete(job.id); clearTimeout(job.timer);
      this.latency.record(performance.now() - job.started);
      if (message.error) { this.errors++; job.reject(failure(message.error.code)); }
      else job.resolve(message.result);
      this.dispatch();
    });
    this.child.on("error", () => this.stop("GAME_UNAVAILABLE"));
    this.child.once("exit", () => this.stop("GAME_UNAVAILABLE"));
  }
  request(operation, payload) {
    if (this.closed) return Promise.reject(failure("GAME_UNAVAILABLE"));
    if (this.queue.length >= this.maxPending) { this.rejected++; return Promise.reject(failure("GAME_BUSY")); }
    return new Promise((resolve, reject) => {
      const job = { id: ++this.sequence, operation, payload, resolve, reject, queuedAt: performance.now() };
      job.timer = setTimeout(() => {
        this.timeouts++; this.stop("GAME_TIMEOUT");
      }, this.timeoutMs);
      this.queue.push(job); this.dispatch();
    });
  }
  dispatch() {
    while (!this.closed && this.pending.size < this.concurrency && this.queue.length) {
      const job = this.queue.shift(); job.started = performance.now();
      this.wait.record(job.started - job.queuedAt); this.pending.set(job.id, job);
      this.child.send({ id: job.id, operation: job.operation, payload: job.payload }, (error) => { if (error) this.stop("GAME_UNAVAILABLE"); });
    }
  }
  stop(code) {
    if (this.closed) return;
    this.closed = true; this.snapshot.status = "stopped";
    for (const job of [...this.queue, ...this.pending.values()]) { clearTimeout(job.timer); job.reject(failure(code)); }
    this.queue.length = 0; this.pending.clear();
    this.termination = this.terminate();
    this.emit("stopped", code);
  }
  terminate() {
    if (!this.child.pid || this.child.exitCode !== null || this.child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const force = setTimeout(() => this.child.kill("SIGKILL"), 1000);
      this.child.once("exit", () => { clearTimeout(force); resolve(); });
      this.child.kill("SIGTERM");
    });
  }
  health() {
    const unhealthy = this.snapshot.cpuPercent > 90 || this.snapshot.eventLoopP95 > 150 || this.snapshot.at && Date.now() - Date.parse(this.snapshot.at) > 15000;
    return { ...this.snapshot, status: this.closed ? "stopped" : unhealthy ? "warning" : this.snapshot.status, queued: this.queue.length, inFlight: this.pending.size,
      queueCapacity: this.maxPending, errors: this.errors, timeouts: this.timeouts, rejected: this.rejected,
      ipc: this.latency.snapshot(), wait: this.wait.snapshot() };
  }
  async close() { this.stop("GAME_CANCELLED"); await this.termination; }
}
