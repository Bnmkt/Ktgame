import { parentPort } from "node:worker_threads";
import bcrypt from "bcryptjs";

parentPort.on("message", ({ id, operation, value, argument }) => {
  try {
    const result = operation === "hash" ? bcrypt.hashSync(value, argument) : bcrypt.compareSync(value, argument);
    parentPort.postMessage({ id, result });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
