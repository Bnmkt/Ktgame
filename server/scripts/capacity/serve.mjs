import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { games } from "../../src/games/shared.js";
import { argumentsFor, isolatedEnvironment } from "./common.mjs";

const args = argumentsFor(process.argv.slice(2));
const port = Number(args.port || 4101), count = Number(args.users || 1000), ttl = Number(args.ttl || 1800);
if (!Number.isInteger(count) || count < 2 || count > 5000 || !Number.isInteger(ttl) || ttl < 60 || ttl > 7200) throw new Error("users: 2..5000; ttl seconds: 60..7200.");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-capacity-"));
if (process.connected) process.send({ type: "fixture", directory }, () => {});
const runId = `capacity-${randomBytes(6).toString("hex")}`, secret = randomBytes(48).toString("hex");
const env = isolatedEnvironment(directory, port, runId, secret, args["rate-limits"] === "production");
if (args["game-workers"] !== undefined) {
  const workers = Number(args["game-workers"]);
  if (!Number.isInteger(workers) || workers < 0 || workers > 4) throw new Error("game-workers: 0 (inline) or 1..4.");
  env.GAME_WORKERS_ENABLED = workers ? "1" : "0"; env.GAME_WORKERS = String(workers || 1);
}
const password = `Test-${randomBytes(12).toString("hex")}!`;
const passwordRounds = Number(args["password-rounds"] ?? 10);
if (!Number.isInteger(passwordRounds) || passwordRounds < 4 || passwordRounds > 14) throw new Error("password-rounds: 4..14; the default 10 is required for comparable capacity tests.");
const passwordHash = await bcrypt.hash(password, passwordRounds);
const database = new DatabaseSync(env.SQLITE_PATH);
database.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
const insert = database.prepare("INSERT INTO users VALUES(?,?,?,?,?)");
const users = Array.from({ length: count }, (_, i) => ({ id: `${runId}-u${i}`, login: `player${i}@loadtest.invalid` }));
for (const [i, row] of [...users, { id: `${runId}-monitor`, login: "monitor@loadtest.invalid" }].entries()) {
  const user = { id: row.id, pseudo: `Capacity${i}`, email: row.login, emailVerifiedAt: new Date().toISOString(), active: true,
    admin: i === count, guest: false, tokens: 1000000, passwordHash, passwordPolicyVersion: 1, sessionVersion: 0,
    friends: i < count ? [users[i % 2 === 0 ? Math.min(i+1,count-1) : i-1].id].filter((id) => id !== row.id) : [],
    profile: { birthDate: "1990-01-01" }, createdAt: new Date().toISOString() };
  insert.run(user.id, JSON.stringify(user), user.pseudo, user.email, 0);
}
database.prepare("INSERT INTO meta VALUES('admin-settings',?)").run(JSON.stringify({ platform: { siteName: runId, contactEmail: "contact@loadtest.invalid" },
  ranked: { games: Object.fromEntries(games.filter((g) => ["yahtzee","421","midnight-dice","president","belote"].includes(g.id)).map((g) => [g.id, { players: Math.max(2,g.minPlayers), maximumPlayers: Math.max(2,g.minPlayers) }])) } }));
database.close();
const manifest = { runId, users, password, passwordRounds, port, expiresAt: new Date(Date.now()+ttl*1000).toISOString(), database: env.SQLITE_PATH, rateLimits: args["rate-limits"] === "production" ? "production" : "capacity-only-raised",
  monitorToken: jwt.sign({ id: `${runId}-monitor`, sessionVersion: 0 }, secret, { expiresIn: `${ttl+300}s` }) };
manifest.architecture = { mode: env.GAME_WORKERS_ENABLED === "1" ? "game-processes" : "inline", gameWorkers: env.GAME_WORKERS_ENABLED === "1" ? Number(env.GAME_WORKERS || 1) : 0 };
fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
const log = fs.openSync(path.join(directory, "server.log"), "w", 0o600);
const profileArgs = args.profile === "true" ? ["--import", new URL("./profile.mjs", import.meta.url).href] : [];
if (profileArgs.length) {
  env.CAPACITY_CPU_PROFILE = path.join(directory, "server.cpuprofile");
  env.CAPACITY_PROFILE_SECONDS = String(Math.max(10, Math.min(1800, Number(args["profile-seconds"]) || 90)));
  env.CAPACITY_PROFILE_DELAY_SECONDS = String(Math.max(0, Math.min(3600, Number(args["profile-delay"]) || 0)));
}
const child = spawn(process.execPath, [...profileArgs, "src/index.js"], { cwd: fileURLToPath(new URL("../../", import.meta.url)), windowsHide: true, env, stdio: ["ignore", log, log] });
fs.closeSync(log);
let stopping = false;
function stop() { if (!stopping) { stopping = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 10000).unref(); } }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
process.on("disconnect", stop);
process.on("message", (message) => { if (message?.type === "stop") stop(); });
const timer = setTimeout(stop, ttl*1000);
child.on("exit", (code) => { clearTimeout(timer); console.log(JSON.stringify({ stopped: true, runId, exitCode: code })); process.exitCode = stopping ? 0 : code || 1; if (process.connected) process.disconnect(); });
child.on("error", (error) => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
for (let i=0; i<150; i++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/config`, { signal: AbortSignal.timeout(1000) });
    const config = await response.json();
    if (config.siteName === runId && !config.emailVerificationAvailable) {
      console.log(JSON.stringify({ ready: true, runId, manifest: path.join(directory,"manifest.json"), port, users: count, ttlSeconds: ttl }));
      break;
    }
  } catch {}
  if (child.exitCode !== null) throw new Error(`Test server failed; inspect ${directory}/server.log`);
  if (i===149) { stop(); throw new Error("Test server startup timed out."); }
  await new Promise((resolve) => setTimeout(resolve,100));
}
