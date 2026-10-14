import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

export function ipcPaths(env = process.env, platform = process.platform) {
  const roots = platform === "win32" ? ["\\\\?\\pipe"] : [...new Set([env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, os.tmpdir()].filter(Boolean))];
  return roots.flatMap((root) => Array.from({ length: 10 }, (_, index) => platform === "win32" ? `${root}\\discord-ipc-${index}` : path.join(root, `discord-ipc-${index}`)));
}

export function rpcFrame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload)), header = Buffer.alloc(8);
  header.writeUInt32LE(opcode); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export class DiscordIPC {
  constructor(clientId, paths = ipcPaths()) { this.clientId = clientId; this.paths = paths; this.socket = null; this.ready = false; }
  async connect() {
    this.close();
    for (const address of this.paths) {
      try {
        await new Promise((resolve, reject) => {
          const socket = net.createConnection(address);
          let buffer = Buffer.alloc(0), settled = false;
          const fail = () => { if (!settled) { settled = true; clearTimeout(timer); socket.destroy(); reject(new Error("Discord indisponible")); } };
          const timer = setTimeout(fail, 1500);
          socket.once("connect", () => socket.write(rpcFrame(0, { v: 1, client_id: this.clientId })));
          socket.on("error", fail);
          socket.on("close", () => { if (this.socket === socket) this.ready = false; fail(); });
          socket.on("data", (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length > 262144) return socket.destroy();
            while (buffer.length >= 8) {
              const opcode = buffer.readUInt32LE(), size = buffer.readUInt32LE(4);
              if (size > 65536) return socket.destroy();
              if (buffer.length < size + 8) return;
              const body = buffer.subarray(8, size + 8); buffer = buffer.subarray(size + 8);
              if (opcode === 3) { socket.write(rpcFrame(4, body)); continue; }
              if (opcode === 2) return socket.destroy();
              if (opcode !== 1) continue;
              let message;
              try { message = JSON.parse(body); } catch { return socket.destroy(); }
              if (message.evt === "ERROR") { socket.destroy(); return; }
              if (message.evt === "READY" && !settled) {
                settled = true; clearTimeout(timer); this.socket = socket; this.ready = true; resolve();
              }
            }
          });
        });
        return;
      } catch {}
    }
    throw new Error("Ouvre l’application Discord sur ce PC.");
  }
  update(activity) {
    if (!this.ready || !this.socket) throw new Error("Discord déconnecté");
    this.socket.write(rpcFrame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity }, nonce: randomUUID() }));
  }
  close() { this.ready = false; this.socket?.destroy(); this.socket = null; }
}

export async function runCompanion() {
  const api = "https://api.ktga.me";
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  console.log("KTGA.ME / Discord : compagnon optionnel. Aucun mot de passe n’est demandé.");
  const code = await prompt.question("Code privé du profil > Connexion et sécurité > Discord : ");
  prompt.close();
  const response = await fetch(`${api}/api/auth/discord/presence/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok) throw new Error("Code invalide ou expiré. Génère un nouveau code depuis ton profil.");
  const session = await response.json();
  const rpc = new DiscordIPC(session.clientId);
  let stopped = false, previous = "", startedAt = Math.floor(Date.now() / 1000), details = "";
  let failures = 0, waiting = false;
  const stop = () => { stopped = true; if (rpc.ready) rpc.update(null); setTimeout(() => rpc.close(), 200).unref(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    console.log("La présence reste privée tant que tu ne joues pas sur le site. Ctrl+C pour arrêter.");
    while (!stopped) {
      try {
        const result = await fetch(`${api}/api/discord/presence/activity`, { headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(10000), redirect: "error" });
        if (result.status === 401 || result.status === 403) break;
        if (!result.ok) throw new Error("Connexion au site indisponible");
        const { activity } = await result.json();
        failures = 0;
        if (stopped) break;
        if (!rpc.ready) { await rpc.connect(); previous = ""; }
        if (stopped) break;
        if (activity?.details !== details) { startedAt = Math.floor(Date.now() / 1000); details = activity?.details ?? ""; }
        const serialized = JSON.stringify(activity);
        if (serialized !== previous) { rpc.update(activity ? { ...activity, timestamps: { start: startedAt } } : null); previous = serialized; }
        if (waiting) { console.log("Connexion rétablie."); waiting = false; }
      } catch {
        failures += 1;
        if (failures >= 2 && rpc.ready) { rpc.update(null); previous = ""; }
        if (!waiting) { console.log("En attente du site ou de l’application Discord…"); waiting = true; }
      }
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  } finally {
    if (rpc.ready) { rpc.update(null); await new Promise((resolve) => setTimeout(resolve, 200)); }
    rpc.close(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCompanion().catch(() => { console.error("Le compagnon n’a pas pu se connecter. Vérifie ton code, le site et Discord."); process.exitCode = 1; });
}
