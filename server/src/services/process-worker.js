import { fork } from "node:child_process";
import { EventEmitter } from "node:events";

// Worker-compatible transport: existing admission, deadlines and cancellation
// stay in TaskPool. This child has no public listener and no inherited secrets.
export class ProcessWorker extends EventEmitter {
  constructor(url, { workerData, env = {} }) {
    super();
    this.independentCancellation = true;
    this.batchMessages = workerData?.batchMessages === true;
    this.outbox = [];
    const runtimeKeys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG"];
    const runtime = Object.fromEntries(runtimeKeys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    this.child = fork(url, [], { env: { ...runtime, ...env }, execArgv: [], windowsHide: true,
      serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"] });
    this.snapshot = { role: "accounts", pid: this.child.pid, status: "starting" };
    this.child.on("message", (message) => {
      if (message?.type === "telemetry") { this.snapshot = { role: "accounts", pid: this.child.pid, ...message.data }; return; }
      if (message?.type === "fatal") { this.emit("error", new Error("Accounts process unavailable.")); return; }
      if (message?.type === "results" && Array.isArray(message.messages)) {
        for (const result of message.messages) this.emit("message", result);
        return;
      }
      this.emit("message", message);
    });
    this.child.on("error", () => this.emit("error", new Error("Accounts process unavailable.")));
    this.child.once("exit", (code, signal) => { this.snapshot.status = "stopped"; this.emit("exit", code, signal); });
    this.child.send({ type: "initialize", data: workerData }, (error) => { if (error) this.emit("error", new Error("Accounts process unavailable.")); });
  }
  postMessage(message) {
    if (!this.child.connected) throw new Error("Accounts process disconnected.");
    const configuration = message.payload?.configuration;
    if (configuration) {
      message = { ...message, payload: { ...message.payload, configId: configuration.id,
        configuration: configuration.id === this.configId ? undefined : configuration } };
      this.configId = configuration.id;
    }
    if (!this.batchMessages) return this.send(message);
    this.outbox.push(message);
    if (!this.flush) this.flush = setImmediate(() => {
      this.flush = null;
      this.send({ type: "batch", messages: this.outbox.splice(0) });
    });
  }
  send(message) { this.child.send(message, (error) => { if (error) this.emit("error", new Error("Accounts process unavailable.")); }); }
  ref() { this.child.ref(); this.child.channel?.ref(); }
  unref() { this.child.unref(); this.child.channel?.unref(); }
  health() { return { ...this.snapshot }; }
  terminate() {
    clearImmediate(this.flush); this.flush = null; this.outbox.length = 0;
    if (this.child.exitCode !== null || this.child.signalCode !== null) return Promise.resolve();
    this.ref();
    return new Promise((resolve) => {
      const force = setTimeout(() => this.child.kill("SIGKILL"), 1000);
      force.unref();
      this.child.once("exit", () => { clearTimeout(force); resolve(); });
      this.child.kill("SIGTERM");
    });
  }
}
