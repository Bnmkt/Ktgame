import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { games } from "../src/games/shared.js";
import { normalizeProgressionConfig } from "../src/services/game-progression.js";
import { backfillHistoricalGameXp } from "../src/services/game-xp-backfill.js";

const serverDir = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2), apply = args.includes("--apply");
const target = args[args.indexOf("--user") + 1];
if (!args.includes("--user") || !target || target.startsWith("--")) throw new Error("Usage: node scripts/backfill-game-xp.mjs --user <pseudo-ou-id> [--apply]. Sans --apply : simulation uniquement.");
if (args.some((arg, index) => arg !== "--user" && arg !== "--apply" && index !== args.indexOf("--user") + 1)) throw new Error("Argument inconnu.");

async function assertServerStopped() {
  const pidFile = path.join(serverDir, ".server.pid");
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    if (Number.isSafeInteger(pid) && pid > 0) {
      let running = true;
      try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") running = false; else throw error; }
      if (running) throw new Error("Arrete le serveur avant d'appliquer le rattrapage : son cache doit etre recharge.");
    }
  }
  const listening = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: Number(process.env.PORT || 4000) });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", (error) => { socket.destroy(); if (error.code === "ECONNREFUSED") resolve(false); else reject(error); });
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error("Impossible de verifier l'arret du serveur.")); });
  });
  if (listening) throw new Error("Le port serveur est encore utilise. Arrete le serveur avant --apply.");
}

if (apply) await assertServerStopped();
const filename = path.resolve(process.env.SQLITE_PATH || path.join(serverDir, "data", "ktga.sqlite"));
if (!fs.existsSync(filename)) throw new Error("Base de donnees introuvable.");
const sqlite = new DatabaseSync(filename, { readOnly: !apply });
try {
  sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  const candidates = sqlite.prepare("SELECT id FROM users WHERE id=? OR lower(pseudo)=lower(?)").all(target, target);
  if (candidates.length !== 1) throw new Error("Le pseudo ou l'identifiant doit correspondre a un seul compte.");
  const config = normalizeProgressionConfig(JSON.parse(sqlite.prepare("SELECT value FROM meta WHERE key='admin-settings'").get()?.value ?? "{}").platform?.gameProgression, games.map((game) => game.id));
  let backup;
  if (apply) {
    const folder = path.join(path.dirname(filename), "backups");
    fs.mkdirSync(folder, { recursive: true });
    backup = path.join(folder, `before-game-xp-${Date.now()}-${randomUUID()}.sqlite`);
    sqlite.prepare("VACUUM INTO ?").run(backup);
  }
  const result = backfillHistoricalGameXp(sqlite, candidates[0].id, config, games.map((game) => game.id), { apply });
  if (apply) {
    const report = backup.replace(/\.sqlite$/, ".json");
    fs.writeFileSync(report, JSON.stringify({ ...result, appliedAt: new Date().toISOString(), config }, null, 2));
  }
  console.log(JSON.stringify({ ...result, ...(backup ? { backup } : {}) }, null, 2));
} finally { sqlite.close(); }
