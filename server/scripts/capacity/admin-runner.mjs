import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fork } from "node:child_process";
import { validateTestConfig, testProcessEnvironment } from "../../src/services/capacity-config.js";
import { childDiagnostic, collectReport } from "./reporting.mjs";

let fixture, generator, directory, stopping = false, started = false;
const children = new Set();
const send = (message) => new Promise((resolve) => {
  if (!process.connected) return resolve(false);
  process.send(message, (error) => resolve(!error));
});
function stop() {
  stopping = true;
  if (generator?.exitCode === null) generator.stdin?.write("stop\n");
  else if (fixture?.connected) fixture.send({ type: "stop" }, () => {});
}
function forceStop() {
  stopping = true;
  if (generator?.exitCode === null) generator.kill("SIGKILL");
  if (fixture?.connected) fixture.send({ type: "stop" }, () => {});
}
process.on("disconnect", forceStop); process.on("SIGINT", stop); process.on("SIGTERM", stop);
function launch(file, args, onLine) {
  const child = fork(new URL(file, import.meta.url), args, { env: testProcessEnvironment(), execArgv: [], windowsHide: true, stdio: ["pipe", "pipe", "pipe", "ipc"] });
  children.add(child);
  let stderr = "";
  child.stderr.on("data", (data) => { stderr = (stderr + data.toString()).slice(-16384); });
  child.done = new Promise((resolve) => { child.once("close", (code, signal) => { children.delete(child); resolve(childDiagnostic(code, signal, stderr)); }); child.once("error", (error) => { children.delete(child); resolve(childDiagnostic(1, null, error.code)); }); });
  let buffer = "";
  child.stdout.on("data", (data) => {
    buffer += data.toString();
    if (buffer.length > 8 * 1024 * 1024) { stop(); buffer = ""; return; }
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      try { onLine?.(JSON.parse(line)); } catch {}
    }
  });
  return child;
}
async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return [4000, 80, 443].includes(port) ? freePort() : port;
}
async function run(input) {
  let timer, report;
  try {
    const config = validateTestConfig(input);
    const ttl = Math.ceil(config.seconds + config.clients * (config.rampMs + 300) / 1000 + Math.ceil(config.clients / 2) * config.roomRampMs / 1000 + 300);
    // Upper lifetime includes cleanup; a parent crash cannot leave an unbounded run.
    timer = setTimeout(() => { stop(); if (generator?.exitCode === null) generator.kill("SIGKILL"); if (fixture?.connected) fixture.send({ type: "stop" }, () => {}); }, (ttl + 60) * 1000);
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    fixture = launch("./serve.mjs", ["--port", String(await freePort()), "--users", String(config.clients), "--ttl", String(ttl)], (row) => { if (row.ready) resolveReady(row); });
    fixture.on("message", (message) => {
      if (message?.type === "fixture" && path.dirname(message.directory) === fs.realpathSync(os.tmpdir()) && /^ktga-capacity-[\w-]+$/.test(path.basename(message.directory))) directory = message.directory;
    });
    fixture.done.then(() => rejectReady(new Error("Fixture startup failed")));
    const row = await ready;
    directory = path.dirname(row.manifest);
    if (path.dirname(directory) !== fs.realpathSync(os.tmpdir()) || !/^ktga-capacity-[\w-]+$/.test(path.basename(directory)) || path.basename(row.manifest) !== "manifest.json") throw new Error("Unsafe fixture directory");
    if (!stopping) {
      const output = path.join(directory, "report.json"), args = ["--manifest", row.manifest, "--output", output];
      const names = { clients: "clients", seconds: "seconds", rampMs: "ramp-ms", roomRampMs: "room-ramp-ms", setupConcurrency: "setup-concurrency", actionMs: "action-ms", browseMs: "browse-ms", routinePolls: "routine-polls", liveState: "live-state", ranked: "ranked", chat: "chat", events: "events", reconnect: "reconnect", loopLimitMs: "loop-limit-ms", freeMemoryMb: "free-memory-mb", errorLimit: "error-limit" };
      for (const [key, name] of Object.entries(names)) args.push(`--${name}`, String(config[key]));
      args.push("--games", config.games.join(","));
      const progress = [], failures = {};
      generator = launch("./run.mjs", args, (data) => {
        if (data.phase) { progress.push(data); if (progress.length > 1500) progress.shift(); send({ type: "progress", data }); }
        if (typeof data.failure === "string") failures[data.failure] = (failures[data.failure] ?? 0) + 1;
      });
      const diagnostic = await generator.done;
      report = collectReport(output, progress, diagnostic, failures);
    }
    if (fixture.connected) fixture.send({ type: "stop" }, () => {});
    await fixture.done;
    let integrity;
    const inspector = launch("./inspect.mjs", ["--manifest", row.manifest], (data) => { if (data.checks) integrity = data; });
    const inspected = await inspector.done;
    if (report) report.diagnostics.integrity = inspected;
    if (report) { report.integrity = integrity; report.passed = report.passed && integrity?.passed === true; await send({ type: "result", data: report }); }
  } catch {
    await send({ type: "result", data: { passed: false, stopReason: stopping ? "interrupted" : "setup failed", failures: { "Scenario supervisor failure": 1 } } });
  } finally {
    clearTimeout(timer);
    for (const child of children) { if (child === fixture && child.connected) child.send({ type: "stop" }, () => {}); else child.kill("SIGTERM"); }
    await Promise.all([...children].map((child) => child.done));
    if (directory && path.dirname(directory) === fs.realpathSync(os.tmpdir()) && /^ktga-capacity-[\w-]+$/.test(path.basename(directory))) {
      try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { send({ type: "cleanup-warning" }); }
    }
    if (process.connected) process.disconnect();
  }
}
process.on("message", (message) => { if (message?.type === "stop") stop(); if (message?.type === "start" && !started) { started = true; run(message.config); } });
