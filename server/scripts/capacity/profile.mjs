import { Session } from "node:inspector";
import fs from "node:fs";
import { isMainThread } from "node:worker_threads";

// Loaded only by the isolated fixture, never exposes an inspector TCP port.
const destination = process.env.CAPACITY_CPU_PROFILE;
if (isMainThread) {
  if (!destination) throw new Error("Missing isolated CPU profile destination.");
  const session = new Session();
  session.connect();
  const post = (method) => new Promise((resolve, reject) => session.post(method, (error, result) => error ? reject(error) : resolve(result)));
  await post("Profiler.enable");
  async function start() {
    await post("Profiler.start");
    setTimeout(async () => {
      try {
        const { profile } = await post("Profiler.stop");
        fs.writeFileSync(destination, JSON.stringify(profile), { mode: 0o600 });
      } finally { session.disconnect(); }
    }, Number(process.env.CAPACITY_PROFILE_SECONDS || 90) * 1000).unref();
  }
  // Skip logins and table creation when profiling the active-load phase.
  const delay = Number(process.env.CAPACITY_PROFILE_DELAY_SECONDS) || 0;
  if (delay) setTimeout(start, delay * 1000).unref(); else await start();
}
