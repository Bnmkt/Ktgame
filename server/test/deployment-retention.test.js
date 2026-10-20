import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { retentionPlan, applyRetention } from "../../deploy/debian/deployment-retention.mjs";

test("five rollbacks span manual and source-editor releases; data archives and unknown temporary data survive", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-retention-test-"));
  const backupRoot = path.join(root, "backups"), temporary = path.join(root, "tmp"), now = Date.now();
  await fs.mkdir(backupRoot); await fs.mkdir(temporary); await fs.mkdir(path.join(backupRoot, "source-editor"));
  const versions = [];
  try {
    for (let i = 0; i < 9; i++) {
      const target = i % 2 ? path.join(backupRoot, "source-editor", `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`) : path.join(backupRoot, `release-${i}`);
      await fs.mkdir(target); await fs.writeFile(path.join(target, "source.txt"), "rollback");
      await fs.utimes(target, new Date(now - i * 60000), new Date(now - i * 60000)); versions.push(target);
    }
    await fs.writeFile(path.join(backupRoot, "ktga-data.tar.gz"), "private data backup");
    await fs.writeFile(path.join(versions[8], "data.tar.gz"), "consistent game data");
    await fs.utimes(versions[8], new Date(now - 8 * 60000), new Date(now - 8 * 60000));
    const oldCode = path.join(backupRoot, "code-release-old.tar.gz");
    await fs.writeFile(oldCode, "old code"); await fs.utimes(oldCode, new Date(0), new Date(0));
    const staging = path.join(temporary, "ktga-custom-pages-test"); await fs.mkdir(path.join(staging, "client", "src"), { recursive: true });
    await fs.writeFile(path.join(temporary, "ktga-accounts-1000.sqlite"), "test history");
    await fs.mkdir(path.join(temporary, "unrelated"));
    const options = { backupRoot, temporaryRoots: [temporary], minimumAgeMs: 0, now: now + 10000 };
    const plan = await retentionPlan(options);
    assert.deepEqual(plan.keep.map(row => row.path), versions.slice(0, 5));
    assert.equal(plan.remove.length, 6);
    await applyRetention(plan, options);
    assert.equal((await retentionPlan(options)).remove.length, 0);
    assert.equal(await fs.readFile(path.join(backupRoot, "ktga-data.tar.gz"), "utf8"), "private data backup");
    assert.equal(await fs.readFile(path.join(backupRoot, "last-deployment-data.tar.gz"), "utf8"), "consistent game data");
    assert.ok(await fs.stat(path.join(temporary, "ktga-accounts-1000.sqlite")));
    assert.ok(await fs.stat(path.join(temporary, "unrelated")));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("retention skips active build paths, recent preparations and modified or forged targets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-retention-guards-"));
  const backupRoot = path.join(root, "backups"), temporary = path.join(root, "tmp");
  const stage = path.join(temporary, "ktga-communication-test");
  await fs.mkdir(backupRoot); await fs.mkdir(path.join(stage, "client", "src"), { recursive: true });
  const options = { backupRoot, temporaryRoots: [temporary] };
  try {
    assert.equal((await retentionPlan(options)).remove.length, 0);
    assert.equal((await retentionPlan({ ...options, minimumAgeMs: 0, now: Date.now() + 1000, activePaths: [path.join(stage, "client")] })).remove.length, 0);
    const plan = await retentionPlan({ ...options, minimumAgeMs: 0, now: Date.now() + 1000 });
    await fs.writeFile(path.join(stage, "changed"), "new work");
    await assert.rejects(applyRetention(plan, options), /changed/);
    const forged = structuredClone(plan); forged.remove[0].path = root;
    await assert.rejects(applyRetention(forged, options), /Refused/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
