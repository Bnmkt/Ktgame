import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import bcrypt from "bcryptjs";
import { createPasskeyStore } from "../src/services/passkey-store.js";
import { virtualPasskey } from "./fixtures/passkey-credential.js";

test("real account login accepts verified passkeys, not client bypass flags, and retains all account restrictions", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-passkeys-api-"));
  const filename = path.join(directory, "main.sqlite"), password = "FixturePassword1!", origin = "https://www.ktga.me";
  const db = new DatabaseSync(filename), keys = new Map(), store = createPasskeyStore(`${filename}.passkeys.sqlite`);
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for (const id of ["player", "admin", "banned", "revoked", "locked", "disabled"]) {
    const key = virtualPasskey(id); keys.set(id, key); store.add(id, "Fixture", key.info);
    const user = { id, pseudo: id, email: `${id}@example.test`, active: id !== "disabled", admin: id === "admin", tokens: 1000, passwordHash: bcrypt.hashSync(password, 4), passwordPolicyVersion: 1, emailVerifiedAt: new Date().toISOString(), profile: { birthDate: id === "revoked" ? "2020-01-01" : "1990-01-01" }, createdAt: new Date().toISOString(), passkeyCount: 1,
      ...(id === "revoked" ? { registrationAuthorization: { ageBand: "under13" }, parentalAccess: { status: "revoked", revokedUntil: new Date(Date.now() + 86400000).toISOString() } } : {}),
      ...(id === "banned" ? { moderation: { hardBan: { active: true, reason: "fixture", endsAt: new Date(Date.now() + 86400000).toISOString() } } } : {}),
      ...(id === "locked" ? { authSecurity: { failures: 10, lastFailedAt: new Date().toISOString(), lockedUntil: new Date(Date.now() + 86400000).toISOString() } } : {}) };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), id, user.email);
  }
  db.close(); store.close();
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`; let output = "", cookie = "";
  const server = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(port), CLIENT_DIST: "", APP_BASE_PATH: "", PUBLIC_APP_URL: origin, CLIENT_ORIGIN: origin, JWT_SECRET: "passkey-api-isolated-test-secret", TLS_TERMINATION: "proxy", TRUST_PROXY: "loopback", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", CONTACT_EMAIL: "contact@example.test", SQLITE_PATH: filename, PATCHNOTES_UPLOAD_DIR: path.join(directory, "images"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bugs"), RATE_LIMIT_MAX: "1000", AUTH_RATE_LIMIT_MAX: "500", ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "PATCHNOTES_DB_PATH", "CONTACT_NOTICE_DB_PATH"].map(key => [key, path.join(directory, `${key}.sqlite`)])) } });
  server.stdout.on("data", chunk => output += chunk); server.stderr.on("data", chunk => output += chunk);
  async function request(route, body, token) {
    const response = await fetch(base + route, { method: body ? "POST" : "GET", headers: { Origin: origin, "User-Agent": "passkeys-api-test", "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.headers.get("set-cookie")?.includes("ktga_passkey=")) cookie = response.headers.get("set-cookie").match(/ktga_passkey=[^;]+/)[0];
    return { status: response.status, data: await response.json() };
  }
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(ready, output.slice(-2000));
    const passwordFallback = await request("/api/auth/login", { login: "player@example.test", password });
    assert.equal(passwordFallback.status, 200, "Adding a passkey must not silently force MFA on an ordinary account");
    let adminToken;
    for (const id of keys.keys()) {
      const options = (await request("/api/auth/passkeys/options", {})).data;
      const result = await request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: keys.get(id).assertion(options.options) });
      assert.equal(result.status, ["banned", "revoked", "disabled"].includes(id) ? 403 : id === "locked" ? 429 : 200, `${id}: ${JSON.stringify(result.data)}`);
      if (id === "admin") adminToken = result.data.token;
      if (["player", "admin"].includes(id)) {
        assert.ok(result.data.token);
        const account = await request("/api/me", null, result.data.token);
        assert.equal(account.data.mfa.passkeyCount, 1);
      }
    }
    const challenge = await request("/api/auth/login", { login: "admin@example.test", password, verifiedPasskey: true });
    assert.equal(challenge.status, 202); assert.equal(challenge.data.token, undefined);
    assert.deepEqual(challenge.data.methods, ["passkey"]);
    const options = (await request("/api/auth/passkeys/options", { mfaChallengeId: challenge.data.challengeId })).data;
    const accepted = await request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: keys.get("admin").assertion(options.options, { counter: 2 }) });
    assert.equal(accepted.status, 200);
    assert.equal((await request("/api/me/passkeys", null, adminToken)).data.passkeys.length, 1);
    assert.equal((await request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: keys.get("admin").assertion(options.options, { counter: 3 }) })).status, 400);
  } finally {
    if (server.exitCode === null) { const ended = new Promise(resolve => server.once("exit", resolve)); server.kill(); await ended; }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-passkeys-api-"));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
