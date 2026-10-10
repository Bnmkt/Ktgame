import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const apply = process.argv.includes("--apply");
if (apply) assert.equal(process.getuid?.(), 0, "Stop the VPS service and run as root to update migrated event references.");
const root = fileURLToPath(new URL("../../", import.meta.url));
const destination = path.join(root, "client/public");
const filename = path.resolve(process.env.SQLITE_PATH || path.join(root, "server/data/ktga.sqlite"));
const db = new DatabaseSync(filename, { readOnly: !apply });
const assets = new Map(), changes = [];
try {
  for (const row of db.prepare("SELECT id,data FROM community_events").all()) {
    const event = JSON.parse(row.data);
    let changed = false;
    for (const key of ["heroImage", "backgroundImage"]) {
      const value = event.theme?.[key];
      if (!value) continue;
      const source = new URL(value, "https://netdis.org/ktga/");
      if (source.origin !== "https://netdis.org") continue;
      if (source.pathname.startsWith("/event/")) source.pathname = `/ktga${source.pathname}`;
      if (!/^\/ktga\/event\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif)$/i.test(source.pathname) || source.search || source.hash) continue;
      const target = source.pathname.slice("/ktga".length).replace(/\/banner\.(png|jpe?g|webp|gif)$/i, "/cover.$1");
      assets.set(target, source.href);
      if (value !== target) { event.theme[key] = target; changed = true; }
    }
    if (changed) changes.push({ row, data: JSON.stringify(event) });
  }
  for (const [target, source] of assets) {
    const local = path.resolve(destination, `.${target}`), relative = path.relative(destination, local);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    if (!fs.existsSync(local)) {
      const response = await fetch(source, { signal: AbortSignal.timeout(120000) });
      assert.ok(response.ok && response.headers.get("content-type")?.startsWith("image/"), `Image download failed: ${target}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.length && bytes.length <= 15 * 1024 * 1024, `Invalid image size: ${target}`);
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, bytes, { flag: "wx" });
    }
  }
  if (apply && changes.length) {
    const backup = `${filename}.before-assets-${Date.now()}.bak`;
    db.prepare("VACUUM INTO ?").run(backup);
    fs.chmodSync(backup, 0o600);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const { row, data } of changes) assert.equal(db.prepare("UPDATE community_events SET data=? WHERE id=? AND data=?").run(data, row.id, row.data).changes, 1);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  console.log(JSON.stringify({ assets: [...assets.keys()], changedEvents: changes.length, applied: apply }));
} finally { db.close(); }
