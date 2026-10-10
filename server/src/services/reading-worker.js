import { parentPort, workerData } from "node:worker_threads";
import { createReadingTasks } from "./reading-tasks.js";

const tasks = createReadingTasks(workerData.filename);
parentPort.on("message", ({ id, service, payload }) => {
  try { parentPort.postMessage({ id, result: tasks.run(service, payload) }); }
  catch { parentPort.postMessage({ id, error: true }); }
});
