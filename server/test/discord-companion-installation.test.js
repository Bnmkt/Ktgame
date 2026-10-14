import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { protectConnection, unprotectConnection, saveConnection, loadConnection, forgetConnection, startupSpecification, claimInstance } from "../../desktop/companion/companion-installation.mjs";

test("remembered credentials roundtrip securely on Windows and do not erase a newer connection", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-companion-install-"));
  const session = { token: "X".repeat(43), clientId: "123456789012345678", remember: true, expiresAt: new Date(Date.now() + 86400000).toISOString() };
  try {
    const protectedValue = protectConnection(session);
    assert.deepEqual(unprotectConnection(protectedValue), session);
    if (process.platform === "win32") assert.ok(!JSON.stringify(protectedValue).includes(session.token));
    saveConnection(session, directory); assert.deepEqual(loadConnection(directory), session);
    forgetConnection(directory, "another-token"); assert.deepEqual(loadConnection(directory), session);
    forgetConnection(directory, session.token); assert.equal(loadConnection(directory), null);
    const release = claimInstance(directory); assert.equal(typeof release, "function");
    assert.equal(claimInstance(directory), null); release();
    const next = claimInstance(directory); assert.equal(typeof next, "function"); next();
  } finally { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("startup is opt-in, per-user, hidden on Windows and generated safely without changing the test machine", () => {
  const windows = startupSpecification({ platform: "win32", directory: "C:/Users/Test O'Neil/KTGACompanion", node: "C:/Program Files/nodejs/node.exe", systemRoot: "C:/Windows" });
  assert.match(windows.registry, /HKCU:/); assert.match(windows.registry, /KTGACompanion/);
  assert.match(windows.content, /-WindowStyle Hidden/); assert.match(windows.content, /--background/);
  assert.ok(!windows.registry.includes("HKLM"));
  const linux = startupSpecification({ platform: "linux", directory: "/home/test/my folder", node: "/usr/bin/node", configHome: "/home/test/.config" });
  assert.equal(linux.filename, "/home/test/.config/autostart/me.ktga.companion.desktop");
  assert.match(linux.content, /Terminal=false/); assert.match(linux.content, /--background/);
  assert.throws(() => startupSpecification({ directory: 'bad"path', platform: "win32" }));
});
