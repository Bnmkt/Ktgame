import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sourceBuildKey, sourceBuildCommand, sourceBuildDependencies } from "../../deploy/debian/source-build-environment.mjs";

test("build dependencies are keyed by both manifest and lockfile", () => {
  const key = sourceBuildKey("manifest", "lock");
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(sourceBuildKey("manifest2", "lock"), key);
  assert.notEqual(sourceBuildKey("manifest", "lock2"), key);
  assert.equal(sourceBuildKey(Buffer.from("manifest"), Buffer.from("lock")), key);
});

test("client and SSR builds use separate locked tools without weakening the sandbox", () => {
  const args = sourceBuildCommand("/build/work", "/tools/locked");
  assert.ok(args.includes("/tools/locked/node_modules/vite/bin/vite.js"));
  for (const setting of ["--uid=ktga-build", "ProtectSystem=strict", "PrivateNetwork=true", "NoNewPrivileges=true", "InaccessiblePaths=/etc/ktga /var/lib/ktga", "ReadWritePaths=/build/work"]) assert.ok(args.includes(setting));
  assert.deepEqual(sourceBuildCommand("/build/work", "/tools/locked", true), [...args, "--ssr", "src/seo/render.jsx", "--outDir", "dist-ssr"]);
});

test("missing locked build tools fail explicitly rather than using runtime node_modules", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-tools-test-"));
  try {
    await fs.writeFile(path.join(directory, "package.json"), "{}");
    await fs.writeFile(path.join(directory, "package-lock.json"), "{}");
    await assert.rejects(sourceBuildDependencies(directory, path.join(directory, "absent")), /Dépendances de reconstruction absentes ou périmées/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
