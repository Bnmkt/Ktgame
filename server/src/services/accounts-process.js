import bcrypt from "bcryptjs";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { createAccountTasks } from "./account-tasks.js";

let tasks, initialized = false, closing = false, resultFlush;
const results = [];
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
let lastCpu = process.cpuUsage(), lastAt = performance.now();
function telemetry() {
  if (!process.connected || closing) return;
  const now = performance.now(), cpu = process.cpuUsage(lastCpu), memory = process.memoryUsage();
  process.send({ type: "telemetry", data: { status: "healthy", at: new Date().toISOString(),
    uptimeSeconds: process.uptime(), cpuPercent: (cpu.user + cpu.system) / (Math.max(1, now-lastAt)*1000)*100,
    memoryRss: memory.rss, memoryHeap: memory.heapUsed, eventLoopP95: loop.count ? loop.percentile(95)/1e6 : null,
    eventLoopMax: loop.count ? loop.max/1e6 : null, caches: tasks?.health() } }, () => {});
  lastAt = now; lastCpu = process.cpuUsage(); loop.reset();
}
const timer = setInterval(telemetry, 5000); timer.unref();
async function send(message) {
  if (!process.connected) return;
  if (message.type === "fatal") return new Promise((resolve) => process.send(message, () => resolve()));
  await new Promise((resolve) => {
    results.push({ message, resolve });
    if (!resultFlush) resultFlush = setImmediate(() => {
      resultFlush = null;
      const batch = results.splice(0);
      if (!process.connected) { for (const row of batch) row.resolve(); return; }
      process.send({ type: "results", messages: batch.map((row) => row.message) }, () => { for (const row of batch) row.resolve(); });
    });
  });
}
async function close() {
  if (closing) return; closing = true; clearInterval(timer); loop.disable();
  clearImmediate(resultFlush);
  for (const row of results.splice(0)) row.resolve();
  tasks?.close();
  process.exit(0);
}
process.on("disconnect", close); process.on("SIGTERM", close); process.on("SIGINT", close);
async function command(message) {
  if (closing) return;
  try {
    if (message?.type === "initialize") {
      if (initialized || typeof message.data?.filename !== "string") throw new Error("Invalid initialization.");
      tasks = createAccountTasks(message.data.filename); initialized = true; telemetry(); return;
    }
    if (!initialized || !Number.isSafeInteger(message?.id) || message.id <= 0) throw new Error("Invalid account command.");
    const { id, service, payload } = message;
    let result;
    if (service === "password-hash" || service === "password-compare") {
      if (typeof payload?.value !== "string" || payload.value.length > 512) throw new Error("Invalid password command.");
      if (service === "password-hash") {
        if (!Number.isInteger(payload.argument) || payload.argument < 4 || payload.argument > 14) throw new Error("Invalid password cost.");
        result = await bcrypt.hash(payload.value, payload.argument);
      } else {
        if (typeof payload.argument !== "string" || payload.argument.length > 200) throw new Error("Invalid password hash.");
        result = await bcrypt.compare(payload.value, payload.argument);
      }
    } else result = tasks.run(service, payload);
    await send({ id, result });
  } catch {
    if (message?.type === "initialize") await send({ type: "fatal" });
    else await send({ id: message?.id, error: true });
  }
}
process.on("message", (message) => {
  if (message?.type !== "batch") { void command(message); return; }
  if (!Array.isArray(message.messages) || !message.messages.length || message.messages.length > 256) {
    void send({ type: "fatal" }); return;
  }
  for (const task of message.messages) void command(task);
});
