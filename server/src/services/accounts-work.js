import { createTaskPool } from "./task-pool.js";
import { ProcessWorker } from "./process-worker.js";
import { accountViewServices } from "./account-tasks.js";
import { readingServices } from "./reading-tasks.js";

const passwordServices = ["password-hash", "password-compare"];
export function createAccountsWork(filename, { maxPending = 512, timeoutMs = 10000, WorkerClass = ProcessWorker } = {}) {
  const services = [...passwordServices, ...readingServices, ...accountViewServices];
  const pool = createTaskPool({ workerUrl: new URL("./accounts-process.js", import.meta.url), workerData: { filename, batchMessages: true },
    workerEnv: { CASINO_TIME_ZONE: process.env.CASINO_TIME_ZONE || "Europe/Brussels" }, services,
    size: 1, tasksPerWorker: 256, serviceConcurrency: { "password-hash": 1, "password-compare": 1 }, maxPending, timeoutMs, WorkerClass });
  let context, refs, sequence = 0;
  function configure(input, references) {
    if (!refs || references.length !== refs.length || !references.every((value, index) => value === refs[index])) {
      refs = [...references]; context = { ...input, id: String(++sequence) };
    }
    return context;
  }
  const run = (service, payload, options = {}) => pool.run(service, payload, { ...options, key: options.key ?? payload?.userId });
  function healthFor(names) {
    const all = pool.health(), stats = names.map((name) => all.services[name]);
    const sum = (key) => stats.reduce((value, row) => value + (row[key] ?? 0), 0);
    const timings = (key) => { const rows = stats.map((row) => row[key]); const count = rows.reduce((n,row)=>n+row.count,0), totalMs=rows.reduce((n,row)=>n+row.totalMs,0);
      return { count, totalMs, averageMs: count ? totalMs/count : 0, maxMs: Math.max(0,...rows.map(row=>row.maxMs??0)),
        p95Ms: rows.some(row=>row.p95Ms!=null) ? Math.max(...rows.map(row=>row.p95Ms??0)) : null,
        recentSamples: rows.reduce((n,row)=>n+row.recentSamples,0) }; };
    return { ...all, mode: "accounts-process",
      submitted: sum("submitted"), completed: sum("completed"), failed: sum("failed"), rejected: sum("rejected"),
      cancelled: sum("cancelled"), timedOut: sum("timedOut"),
      wait: timings("wait"), processing: timings("processing"), timingWindowSeconds: 60, timingSampleLimit: 256,
      percentileAggregation: "maximum-per-service", sharedProcess: true,
      services: Object.fromEntries(names.map((name) => [name, { ...all.services[name], mode: "accounts-process" }])) };
  }
  return {
    run, configure, health: pool.health, close: pool.close,
    passwords: { hash: (value, argument) => run("password-hash", { value, argument }),
      compare: (value, argument) => run("password-compare", { value, argument }), health: () => healthFor(passwordServices), close: async () => {} },
    reading: { run, health: () => healthFor([...readingServices, ...accountViewServices]), close: async () => {} }
  };
}
