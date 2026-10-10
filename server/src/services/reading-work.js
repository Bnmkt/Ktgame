import { createTaskPool } from "./task-pool.js";
import { readingServices } from "./reading-tasks.js";

export function createReadingWork(filename, { size = 1, maxPending = 128, timeoutMs = 10000 } = {}) {
  const pool = createTaskPool({ workerUrl: new URL("./reading-worker.js", import.meta.url), workerData: { filename },
    workerEnv: { CASINO_TIME_ZONE: process.env.CASINO_TIME_ZONE || "Europe/Brussels" }, services: readingServices, size, maxPending, timeoutMs });
  return { ...pool, run: (service, payload, options) => pool.run(service, payload, { ...options, key: payload?.userId }) };
}
