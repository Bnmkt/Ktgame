import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

export const KEEP_DEPLOYMENTS = 5;
const buildName = /^ktga-(?:communication|media-pages|variable-bulk|page-templates|crop-limit|personalization|page-code|media-limit|custom-pages|mascot-docks|shop-release|entry-release|presentation-release|mascot-release|pwa-release|desktop-release|capacity-release)-[a-zA-Z0-9_-]+$/;
const uploadName = /^ktga-(?:communication|media-pages|variable-bulk|page-templates|crop-limit|personalization|page-code|media-limit|custom-pages|mascot-docks|shop|entry|presentation|mascot|pwa|desktop)(?:-[a-zA-Z0-9_-]+)?\.(?:tgz|tar\.gz|sh)$/;
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
const exists = async target => { try { return await fs.lstat(target); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };

async function safeRoot(target) {
  const stat = await exists(target);
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(target) !== path.resolve(target)) throw new Error(`Unsafe retention root: ${target}`);
  return stat;
}

async function treeBytes(target, device) {
  const stat = await fs.lstat(target);
  if (stat.dev !== device) throw new Error(`Mounted filesystem inside cleanup target: ${target}`);
  let bytes = stat.size;
  if (stat.isDirectory()) for (const name of await fs.readdir(target)) bytes += await treeBytes(path.join(target, name), device);
  return bytes;
}

export async function activeProcessPaths() {
  const result = [];
  for (const pid of await fs.readdir("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    for (const part of ["cwd", "root"]) {
      try { result.push(await fs.readlink(`/proc/${pid}/${part}`)); } catch { /* Processes may exit during inspection. */ }
    }
    try { result.push(...(await fs.readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0").filter(value => value.startsWith("/"))); } catch { /* Kernel and short-lived processes have no readable command line. */ }
  }
  // A deferred deployment may be waiting in a timer rather than running yet.
  for (const name of await fs.readdir("/run/systemd/transient").catch(() => [])) {
    if (!name.endsWith(".service")) continue;
    try {
      const unit = await fs.readFile(path.join("/run/systemd/transient", name), "utf8");
      result.push(...[...unit.matchAll(/\/(?:var\/)?tmp\/ktga-[a-zA-Z0-9_-]+/g)].map(match => match[0]));
    } catch { /* Transient units may disappear during inspection. */ }
  }
  return result;
}

export async function retentionPlan({ backupRoot = "/var/backups/ktga", temporaryRoots = ["/tmp", "/var/tmp"], activePaths = [], minimumAgeMs = 3600000, now = Date.now() } = {}) {
  const keep = [], remove = [], skipped = [], versions = [];
  const backupStat = await safeRoot(backupRoot);
  const inUse = target => activePaths.some(value => inside(target, value) || value === target);
  async function candidate(target, category, stat) {
    if (stat.isSymbolicLink()) return;
    const item = { path: target, category, modified: stat.mtimeMs, inode: stat.ino, device: stat.dev };
    if (inUse(target)) { skipped.push({ ...item, reason: "active-process" }); return; }
    if (category === "backup") versions.push(item);
    else if (now - Math.max(stat.mtimeMs, stat.ctimeMs) >= minimumAgeMs) remove.push(item);
    else skipped.push({ ...item, reason: "recent-preparation" });
  }
  if (backupStat) for (const entry of await fs.readdir(backupRoot, { withFileTypes: true })) {
    if (entry.isFile() && /^(?:code-release|notice-md-direct)-[a-zA-Z0-9_-]+\.tar\.gz$/.test(entry.name)) {
      const target = path.join(backupRoot, entry.name);
      await candidate(target, "backup", await fs.lstat(target));
    }
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const target = path.join(backupRoot, entry.name);
    if (entry.name === "source-editor") {
      await safeRoot(target);
      for (const name of await fs.readdir(target)) {
        const child = path.join(target, name), stat = await fs.lstat(child);
        if (/^[a-f0-9-]{36}$/.test(name) && stat.isDirectory()) await candidate(child, "backup", stat);
      }
    } else await candidate(target, "backup", await fs.lstat(target));
  }
  versions.sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
  keep.push(...versions.slice(0, KEEP_DEPLOYMENTS)); remove.push(...versions.slice(KEEP_DEPLOYMENTS));
  for (const root of temporaryRoots) {
    if (!await safeRoot(root)) continue;
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      const target = path.join(root, entry.name);
      if (entry.isDirectory() && buildName.test(entry.name)) {
        // Only recognize extracted build trees, never application data or arbitrary /tmp directories.
        const markers = ["client/src", "client/dist", "server/src"];
        let recognized = false;
        for (const marker of markers) if ((await exists(path.join(target, marker)))?.isDirectory()) recognized = true;
        if (recognized) await candidate(target, "preparation", await fs.lstat(target));
      } else if (entry.isFile() && uploadName.test(entry.name)) await candidate(target, "upload", await fs.lstat(target));
    }
  }
  for (const item of remove) item.bytes = await treeBytes(item.path, item.device);
  return { keep, remove, skipped, estimatedBytes: remove.reduce((sum, item) => sum + item.bytes, 0) };
}

export async function applyRetention(plan, { backupRoot = "/var/backups/ktga", temporaryRoots = ["/tmp", "/var/tmp"], activePaths = [] } = {}) {
  for (const root of [backupRoot, ...temporaryRoots]) await safeRoot(root);
  await safeRoot(path.join(backupRoot, "source-editor"));
  const checked = async item => {
    const parent = path.dirname(item.path);
    const allowed = item.category === "backup" ? parent === backupRoot || parent === path.join(backupRoot, "source-editor") : temporaryRoots.includes(parent) && (buildName.test(path.basename(item.path)) || uploadName.test(path.basename(item.path)));
    if (!allowed || plan.keep.some(row => row.path === item.path) || activePaths.some(value => inside(item.path, value))) throw new Error(`Refused cleanup target: ${item.path}`);
    const stat = await exists(item.path);
    if (!stat) return null;
    if (stat.isSymbolicLink() || stat.ino !== item.inode || stat.dev !== item.device || stat.mtimeMs !== item.modified) throw new Error(`Cleanup target changed: ${item.path}`);
    return stat;
  };
  for (const item of plan.remove) await checked(item);
  // Keep the latest consistent data snapshot separate from code rollback retention.
  const dataBackup = path.join(backupRoot, "last-deployment-data.tar.gz");
  let newest = await exists(dataBackup), source;
  if (newest && (!newest.isFile() || newest.isSymbolicLink())) throw new Error("Unsafe independent data backup.");
  for (const item of plan.remove.filter(row => row.category === "backup")) {
    if (!(await exists(item.path))?.isDirectory()) continue;
    const stat = await exists(path.join(item.path, "data.tar.gz"));
    if (stat?.isFile() && !stat.isSymbolicLink() && (!newest || stat.mtimeMs > newest.mtimeMs)) { newest = stat; source = path.join(item.path, "data.tar.gz"); }
  }
  if (source) {
    const temporary = `${dataBackup}.${randomUUID()}.part`;
    try { await fs.copyFile(source, temporary); await fs.chmod(temporary, 0o600); await fs.utimes(temporary, newest.atime, newest.mtime); await fs.rename(temporary, dataBackup); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  for (const item of plan.remove) if (await checked(item)) await fs.rm(item.path, { recursive: true, force: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.getuid?.() !== 0) throw new Error("Run as root through ktga-prune-deployments.");
  const args = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--all-idle-preparations"].includes(arg))) throw new Error("Unknown retention argument.");
  const plan = await retentionPlan({ activePaths: await activeProcessPaths(), ...(args.includes("--all-idle-preparations") ? { minimumAgeMs: 0 } : {}) });
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "apply" : "preview", ...plan }, null, 2));
  if (args.includes("--apply")) await applyRetention(plan, { activePaths: await activeProcessPaths() });
}
