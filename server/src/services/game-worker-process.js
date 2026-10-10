import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { createGameRoomKernel } from "./game-room-kernel.js";
import { DurationTelemetry } from "./duration-telemetry.js";

const kernel = createGameRoomKernel();
const actions = new DurationTelemetry();
const transitions = new DurationTelemetry();
const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
let previousCpu = process.cpuUsage(), previousAt = performance.now(), errors = 0;
const send = (message) => { if (process.connected) process.send(message, () => {}); };
process.on("message", async (message) => {
  if (!Number.isSafeInteger(message?.id) || !["configure", "register", "prepare", "commit", "abort"].includes(message.operation)) return;
  const started = performance.now();
  try {
    const result = await kernel[message.operation](message.payload);
    if (message.operation === "prepare") {
      transitions.record(performance.now() - started);
      if (message.payload.command === "POST /api/rooms/:code/action") actions.record(performance.now() - started);
    }
    send({ id: message.id, result });
  } catch (error) { errors++; send({ id: message.id, error: { code: String(error.code || "GAME_FAILED") } }); }
});
const due = setInterval(() => {
  const roomIds = kernel.due();
  if (roomIds.length) send({ type: "due", roomIds });
}, 1000);
const telemetry = setInterval(() => {
  const now = performance.now(), current = process.cpuUsage();
  send({ type: "telemetry", data: { role: "game", pid: process.pid, at: new Date().toISOString(),
    cpuPercent: ((current.user - previousCpu.user) + (current.system - previousCpu.system)) / ((now - previousAt) * 10),
    rss: process.memoryUsage().rss,
    eventLoopP95: loop.count ? loop.percentile(95) / 1e6 : null,
    eventLoopMax: loop.count ? loop.max / 1e6 : null,
    actions: actions.snapshot(), transitions: transitions.snapshot(), errors, ...kernel.health() } });
  previousCpu = current; previousAt = now; loop.reset();
}, 5000);
function close() { clearInterval(due); clearInterval(telemetry); loop.disable(); process.exit(0); }
process.once("disconnect", close); process.once("SIGTERM", close); process.once("SIGINT", close);
