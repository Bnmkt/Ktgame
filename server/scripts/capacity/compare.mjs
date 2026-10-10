import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { argumentsFor } from "./common.mjs";
import { testProcessEnvironment, sanitizeTestReport } from "../../src/services/capacity-config.js";

const args = argumentsFor(process.argv.slice(2));
if (!args.output) throw new Error("Required: --output DIRECTORY; optional --workers 0,1 --clients 60 --seconds 30.");
const workers = (args.workers ?? "0,1").split(",").map(Number);
if (!workers.length || workers.some((value) => !Number.isInteger(value) || value < 0 || value > 4)) throw new Error("workers: comma-separated 0..4.");
const output = path.resolve(args.output), server = fileURLToPath(new URL("../../", import.meta.url));
fs.mkdirSync(output, { recursive: true });
const active = new Set(); let stopping = false;
function stop() {
  stopping = true;
  for (const child of active) child.kill("SIGTERM");
}
process.once("SIGINT", stop); process.once("SIGTERM", stop);
let guard;
if (args["guard-db"]) {
  guard = new DatabaseSync(path.resolve(args["guard-db"]), { readOnly: true });
  if (guard.prepare("SELECT count(*) AS n FROM rooms WHERE finished=0").get().n) { guard.close(); throw new Error("Real rooms exist; capacity comparison refused."); }
}
const guardTimer = guard && setInterval(() => {
  if (guard.prepare("SELECT count(*) AS n FROM rooms WHERE finished=0").get().n) { console.error("A real room opened; stopping isolated tests."); stop(); }
}, 5000);
guardTimer?.unref();
function launch(file, parameters, onLine) {
  const child = fork(new URL(file, import.meta.url), parameters, { cwd: server, execArgv: [], env: testProcessEnvironment(), windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  active.add(child); let buffer = "", stderr = "";
  child.stdout.on("data", (data) => {
    buffer += data;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      try { onLine?.(JSON.parse(line)); } catch {}
    }
  });
  child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-4096); });
  child.done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => { active.delete(child); resolve({ code, stderr }); });
  });
  return child;
}
async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  return port === 4000 ? freePort() : port;
}
const results = [];
try {
for (const count of workers) {
  if (stopping) break;
  let fixture, directory;
  try {
    let ready, failed;
    const readiness = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
    fixture = launch("./serve.mjs", ["--port", String(await freePort()), "--users", args.clients ?? "60", "--ttl", args.ttl ?? "1800", "--game-workers", String(count)], (row) => { if (row.ready) ready(row); });
    fixture.done.then(({ stderr }) => failed(new Error(`Isolated server stopped: ${stderr}`)), failed);
    const timeout = setTimeout(() => failed(new Error("Fixture startup timeout")), 60000);
    let row;
    try { row = await readiness; } finally { clearTimeout(timeout); }
    directory = path.dirname(row.manifest);
    const file = path.join(output, `workers-${count}.json`), parameters = ["--manifest", row.manifest, "--output", file];
    const defaults = { clients: "60", seconds: "30", "ramp-ms": "150", "room-ramp-ms": "200", "action-ms": "1000", "browse-ms": "5000", "setup-concurrency": "1", "routine-polls": "true", "live-state": "true", games: "all" };
    for (const [key, value] of Object.entries(defaults)) parameters.push(`--${key}`, args[key] ?? value);
    for (const key of ["ranked", "chat", "events", "reconnect", "loop-limit-ms", "free-memory-mb", "error-limit"]) if (args[key] !== undefined) parameters.push(`--${key}`, args[key]);
    const generator = launch("./run.mjs", parameters, (progress) => { if (progress.phase) console.log(JSON.stringify({ workers: count, ...progress, health: undefined })); });
    const diagnostic = await generator.done;
    if (fixture.connected) fixture.send({ type: "stop" }, () => {});
    await fixture.done;
    let integrity;
    const inspector = launch("./inspect.mjs", ["--manifest", row.manifest], (data) => { if (data.checks) integrity = data; });
    const inspected = await inspector.done;
    if (!fs.existsSync(file)) throw new Error(`Capacity runner failed (${diagnostic.code}): ${diagnostic.stderr}`);
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify(sanitizeTestReport({ ...report, integrity }), null, 2));
    const load = report.health.filter((sample) => Date.parse(sample.at) >= Date.parse(report.loadStartedAt) && Date.parse(sample.at) <= Date.parse(report.finishedAt));
    const mean = (read) => load.length ? Number((load.reduce((sum, sample) => sum + (read(sample) ?? 0), 0) / load.length).toFixed(2)) : null;
    results.push({ workers: count, passed: report.passed && inspected.code === 0 && integrity?.passed === true, clients: report.clients,
      requests: report.counters.requests, errors: report.counters.errors, actions: report.counters.actions, latency: report.latency,
      gatewayCpu: mean((sample) => sample.siteCpu), totalCpu: mean((sample) => sample.cpu), gatewayLoopP95: mean((sample) => sample.loopP95),
      integrity: integrity?.checks, report: path.basename(file) });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    if (fixture && active.has(fixture)) { if (fixture.connected) fixture.send({ type: "stop" }, () => {}); else fixture.kill("SIGTERM"); await fixture.done; }
    if (directory && path.dirname(path.resolve(directory)) === fs.realpathSync(os.tmpdir()) && /^ktga-capacity-[\w-]+$/.test(path.basename(directory))) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
} finally { clearInterval(guardTimer); guard?.close(); }
fs.writeFileSync(path.join(output, "comparison.json"), JSON.stringify({ at: new Date().toISOString(), node: process.version,
  cpus: os.availableParallelism(), note: "Sequential isolated runs; generator shares the host. No production, public TLS or OVH network measurement.", results }, null, 2));
process.exitCode = results.length === workers.length && results.every((row) => row.passed) ? 0 : 1;
