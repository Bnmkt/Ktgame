import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

// Installed root-owned outside the editable source tree; no HTTP arguments or shell commands.
const root = "/opt/ktga", state = "/var/lib/ktga/source-editor", queue = `${state}/queue`, results = `${state}/results`;
const hash = text => createHash("sha256").update(text).digest("hex");
const allowed = name => typeof name === "string" && name.length < 240 && path.posix.normalize(name) === name && /^client\/src\/[a-zA-Z0-9_./-]+\.(js|jsx|css|json)$/.test(name) && !name.split("/").some(part => part.startsWith(".") || ["node_modules", "data", "test", "tests"].includes(part));
let log = "";
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { PATH: "/usr/bin:/bin" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 180000);
    for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { log = (log + data.toString()).slice(-40000); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Échec de ${path.basename(command)} (${code}).`)); });
  });
}
async function safeTarget(name) {
  if (!allowed(name)) throw new Error("Fichier interdit.");
  let target = root;
  for (const part of name.split("/")) { target = path.join(target, part); if ((await fs.lstat(target)).isSymbolicLink()) throw new Error("Lien symbolique interdit."); }
  if (!(await fs.stat(target)).isFile()) throw new Error("Source invalide.");
  return target;
}
function noTables() {
  const require = createRequire(`${root}/server/package.json`), env = require("dotenv").parse(require("node:fs").readFileSync("/etc/ktga/server.env"));
  if (!env.SQLITE_PATH?.startsWith("/var/lib/ktga/") || require("node:fs").existsSync(`${env.SQLITE_PATH}.reset-pending.json`)) throw new Error("Base ou état de maintenance incompatible.");
  const db = new DatabaseSync(env.SQLITE_PATH, { readOnly: true });
  try { if (db.prepare("SELECT count(*) AS n FROM rooms WHERE coalesce(json_extract(data,'$.finished'),0)=0").get().n) throw new Error("Des tables sont ouvertes. Aucune bascule effectuée."); } finally { db.close(); }
}
async function ownTree(directory, uid, gid) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) { const target = path.join(directory, entry.name); if (entry.isSymbolicLink()) continue; await fs.chown(target, uid, gid); if (entry.isDirectory()) await ownTree(target, uid, gid); }
  await fs.chown(directory, uid, gid);
}
await fs.mkdir(results, { recursive: true, mode: 0o750 });
const owner = await fs.stat(state);
for (const directory of [state, results]) { const stat = await fs.lstat(directory); if (stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022)) throw new Error("Répertoire de publication non sécurisé."); }
for (const name of await fs.readdir(queue)) {
  if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
  const pending = path.join(queue, name), id = name.slice(0, -5), target = path.join(results, name);
  let job = { id, status: "failed" }, stopped = false, backupReady = false;
  const workspace = `/var/lib/ktga-build/${id}`, backup = `/var/backups/ktga/source-editor/${id}`;
  const status = async (value, message) => { job.status = value; job.message = message; const temporary = `${target}.${randomUUID()}.tmp`; await fs.writeFile(temporary, JSON.stringify({ id, status: value, message, actor: job.actor, revision: job.revision, createdAt: job.createdAt, updatedAt: new Date().toISOString(), log }), { mode: 0o640, flag: "wx" }); await fs.chown(temporary, owner.uid, owner.gid); await fs.rename(temporary, target); };
  try {
    if ((await fs.lstat(pending)).isSymbolicLink() || (await fs.stat(pending)).size > 12 * 1024 * 1024) throw new Error("Opération invalide.");
    job = JSON.parse(await fs.readFile(pending, "utf8"));
    if (job.id !== id || !Array.isArray(job.files) || !job.files.length || job.files.length > 20 || new Set(job.files.map(row => row.path)).size !== job.files.length) throw new Error("Correctif invalide.");
    for (const row of job.files) {
      if (typeof row.content !== "string" || Buffer.byteLength(row.content) > 512 * 1024 || row.content.includes("\0") || !/^[a-f0-9]{64}$/.test(row.baseHash ?? "")) throw new Error("Source invalide.");
      if (hash(await fs.readFile(await safeTarget(row.path), "utf8")) !== row.baseHash) throw new Error("Les sources ont changé depuis la préparation.");
    }
    noTables(); await status("building", "Reconstruction isolée en cours.");
    await fs.mkdir(workspace, { mode: 0o750 });
    // Configuration and tools are trusted deployment files, not editable through the admin UI.
    for (const entry of ["src", "public", "index.html", "discord-activity", "vite.config.js", "package.json"]) await fs.cp(`${root}/client/${entry}`, `${workspace}/${entry}`, { recursive: true, dereference: false });
    await fs.symlink(`${root}/client/node_modules`, `${workspace}/node_modules`);
    for (const row of job.files) await fs.writeFile(path.join(workspace, row.path.slice("client/".length)), row.content);
    const passwd = (await fs.readFile("/etc/passwd", "utf8")).split("\n").find(line => line.startsWith("ktga-build:"))?.split(":");
    if (!passwd) throw new Error("Utilisateur de reconstruction absent.");
    await ownTree(workspace, Number(passwd[2]), Number(passwd[3]));
    const sandbox = ["--collect", "--wait", "--pipe", "--quiet", "--uid=ktga-build", "-p", `WorkingDirectory=${workspace}`, "-p", "ProtectSystem=strict", "-p", "ProtectHome=true", "-p", "PrivateNetwork=true", "-p", "NoNewPrivileges=true", "-p", "MemoryMax=1500M", "-p", "CPUQuota=100%", "-p", `ReadWritePaths=${workspace}`, "-p", "InaccessiblePaths=/etc/ktga /var/lib/ktga", "/usr/bin/env", "-i", "PATH=/usr/bin:/bin", `HOME=${workspace}`, "VITE_API_URL=https://api.ktga.me", "VITE_AUDIENCE_READY=true", "/usr/bin/node", `${root}/client/node_modules/vite/bin/vite.js`, "build", "--mode", "production", "--configLoader", "runner"];
    await run("/usr/bin/systemd-run", sandbox);
    await run("/usr/bin/systemd-run", [...sandbox, "--ssr", "src/seo/render.jsx", "--outDir", "dist-ssr"]);
    async function validateOutput(directory) { for (const entry of await fs.readdir(directory, { withFileTypes: true })) { if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error("Sortie de reconstruction invalide."); if (entry.isDirectory()) await validateOutput(path.join(directory, entry.name)); } }
    await validateOutput(`${workspace}/dist`); await validateOutput(`${workspace}/dist-ssr`);
    for (const entry of await fs.readdir(`${workspace}/dist-ssr/assets`)) await fs.copyFile(`${workspace}/dist-ssr/assets/${entry}`, `${workspace}/dist/assets/${entry}`);
    noTables();
    for (const row of job.files) if (hash(await fs.readFile(await safeTarget(row.path), "utf8")) !== row.baseHash) throw new Error("Les sources ont changé pendant la reconstruction.");
    await fs.mkdir(backup, { recursive: true, mode: 0o700 });
    for (const entry of ["src", "dist-ssr"]) await fs.cp(`${root}/client/${entry}`, `${backup}/${entry}`, { recursive: true });
    await fs.cp("/var/www/ktga", `${backup}/frontend`, { recursive: true }); backupReady = true;
    await status("deploying", "Sauvegarde terminée. Bascule du site.");
    await run("/usr/bin/systemctl", ["stop", "ktga.service"]); stopped = true; noTables();
    for (const row of job.files) await fs.writeFile(await safeTarget(row.path), row.content);
    await run("/usr/bin/rsync", ["-a", "--chown=root:root", "--chmod=D755,F644", `${workspace}/dist/`, "/var/www/ktga/"]);
    await run("/usr/bin/rsync", ["-a", "--delete", "--chown=deploy:deploy", `${workspace}/dist-ssr/`, `${root}/client/dist-ssr/`]);
    await run("/usr/bin/systemctl", ["start", "ktga.service"]);
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt++) { try { if ((await fetch("http://127.0.0.1:4000/api/health", { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 1000)); }
    if (!ready) throw new Error("La nouvelle version ne répond pas.");
    stopped = false; await status("completed", "Version reconstruite et appliquée. Sauvegarde privée conservée.");
  } catch (error) {
    if (stopped && backupReady) {
      await run("/usr/bin/systemctl", ["stop", "ktga.service"]).catch(() => {});
      await run("/usr/bin/rsync", ["-a", "--delete", `${backup}/src/`, `${root}/client/src/`]);
      await run("/usr/bin/rsync", ["-a", "--delete", `${backup}/dist-ssr/`, `${root}/client/dist-ssr/`]);
      await run("/usr/bin/rsync", ["-a", "--delete", `${backup}/frontend/`, "/var/www/ktga/"]);
      await run("/usr/bin/systemctl", ["start", "ktga.service"]);
    }
    await status("failed", `${error.message}${stopped ? " Restauration de la version précédente effectuée." : " La version en ligne n’a pas été remplacée."}`);
  } finally {
    await fs.unlink(pending).catch(() => {});
    if (path.dirname(workspace) === "/var/lib/ktga-build" && !(await fs.lstat(workspace).catch(() => null))?.isSymbolicLink()) await fs.rm(workspace, { recursive: true, force: true });
  }
}
