import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { LIMITED_EDITOR_IDS } from "../src/services/editor-duplication.js";
import { encryptTotpSecret, totpCode } from "../src/services/account-security.js";

test("Discord login/link preserves real session restrictions and administrator MFA", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-discord-api-"));
  const secret = "isolated-discord-test-key", totp = "JBSWY3DPEHPK3PXP", password = "FixturePassword1!";
  const db = new DatabaseSync(path.join(directory, "main.sqlite"));
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  const identities = { player: "111111111111111111", admin: "222222222222222222", banned: "333333333333333333", minor: "444444444444444444", locked: "555555555555555555", revoked: "666666666666666666" };
  const limitedId = [...LIMITED_EDITOR_IDS][0];
  for (const id of ["player", "other", "admin", "banned", "minor", "locked", "revoked", limitedId]) {
    const user = { id, pseudo: id === limitedId ? "Renamed editor" : id, email: `${id}@example.test`, active: true, admin: id === "admin", editor: id === limitedId, tokens: 1000,
      passwordHash: bcrypt.hashSync(password, 4), passwordPolicyVersion: 1, emailVerifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      profile: { birthDate: ["minor", "revoked"].includes(id) ? "2020-01-01" : "1990-01-01" },
      ...(["minor", "revoked"].includes(id) ? { registrationAuthorization: { ageBand: "under13" } } : {}),
      ...(identities[id] && id !== "player" ? { discord: { id: identities[id], username: "FixtureDiscord" } } : {}),
      ...(id === "admin" ? { mfa: { totpSecret: encryptTotpSecret(totp, secret) } } : {}),
      ...(id === "banned" ? { moderation: { hardBan: { active: true, reason: "fixture", endsAt: new Date(Date.now() + 86400000).toISOString() } } } : {}),
      ...(id === "locked" ? { authSecurity: { failures: 10, lastFailedAt: new Date().toISOString(), lockedUntil: new Date(Date.now() + 86400000).toISOString() } } : {}),
      ...(id === "revoked" ? { parentalAccess: { status: "revoked", revokedUntil: new Date(Date.now() + 86400000).toISOString(), reason: "fixture" } } : {}) };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), id, user.email);
  }
  db.prepare("INSERT INTO meta VALUES('admin-settings',?)").run(JSON.stringify({ platform: { discordLoginEnabled: true } }));
  db.close();
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const url = `http://127.0.0.1:${port}`; let output = "";
  const server = spawn(process.execPath, ["--import", "./test/fixtures/discord-provider.mjs", "src/index.js"], {
    cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", TLS_TERMINATION: "proxy", TRUST_PROXY: "loopback", APP_BASE_PATH: "", JWT_SECRET: secret,
      CLIENT_DIST: "", CLIENT_ORIGIN: "https://www.ktga.me", PUBLIC_APP_URL: "https://www.ktga.me", CONTACT_EMAIL: "contact@example.test", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "",
      SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", SQLITE_PATH: path.join(directory, "main.sqlite"),
      DISCORD_CLIENT_ID: "123456789012345678", DISCORD_CLIENT_SECRET: "isolated-fake-secret", DISCORD_REDIRECT_URI: "https://api.ktga.me/api/auth/discord/callback",
      PATCHNOTES_UPLOAD_DIR: path.join(directory, "images"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bugs"), AUTH_RATE_LIMIT_MAX: "300", RATE_LIMIT_MAX: "1000",
      ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "PATCHNOTES_DB_PATH", "CONTACT_NOTICE_DB_PATH", "EXECUTION_DB_PATH"].map((key) => [key, path.join(directory, `${key}.sqlite`)])) }
  });
  server.stdout.on("data", (chunk) => output += chunk); server.stderr.on("data", (chunk) => output += chunk);
  const request = async (route, method = "GET", body, token, cookie = "") => {
    const result = await fetch(url + route, { method, redirect: "manual", headers: { Origin: "https://www.ktga.me", "User-Agent": "DiscordTest", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: result.status, data: result.headers.get("content-type")?.includes("json") ? await result.json() : await result.text(), headers: result.headers };
  };
  const flow = async (discordId, { token, route = "/api/auth/discord/start", body = {}, roomCode = "" } = {}) => {
    const start = await request(route, "POST", { ...body, roomCode }, token);
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const state = new URL(start.data.url).searchParams.get("state");
    const cookie = `ktga_discord_flow=${state}`;
    const callback = await request(`/api/auth/discord/callback?state=${state}&code=${discordId}`, "GET", null, null, cookie);
    assert.equal(callback.status, 303);
    assert.ok(!callback.headers.get("location").includes(state));
    const complete = await request("/api/auth/discord/complete", "POST", {}, token, cookie);
    assert.equal((await request("/api/auth/discord/complete", "POST", {}, token, cookie)).status, 400);
    return { ...complete, callback };
  };
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) { try { if ((await fetch(url + "/api/health")).ok) { ready = true; break; } } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); }
    assert.ok(ready, output.slice(-2000));
    assert.equal((await request("/api/config")).data.discordLoginAvailable, true);
    const player = await request("/api/auth/login", "POST", { login: "player@example.test", password }); assert.equal(player.status, 200);
    const other = await request("/api/auth/login", "POST", { login: "other@example.test", password }); assert.equal(other.status, 200);
    assert.equal((await flow(identities.player)).status, 404, "matching email must not link accounts");
    assert.equal((await request("/api/me/discord/link", "POST", { password: "wrong" }, player.data.token)).status, 401);
    const linked = await flow(identities.player, { route: "/api/me/discord/link", token: player.data.token, body: { password } });
    assert.equal(linked.status, 200); assert.equal(linked.data.linked, true);
    assert.equal((await flow(identities.player, { route: "/api/me/discord/link", token: other.data.token, body: { password } })).status, 409);
    const login = await flow(identities.player, { roomCode: "ABC123" });
    assert.equal(login.status, 200); assert.equal(login.data.user.id, "player"); assert.ok(login.data.token);
    assert.equal(login.callback.headers.get("location"), "https://www.ktga.me/table/ABC123?discord=complete");
    const admin = await flow(identities.admin);
    assert.equal(admin.status, 202); assert.equal(admin.data.token, undefined); assert.deepEqual(admin.data.methods, ["totp"]);
    const verified = await request("/api/auth/mfa/verify", "POST", { challengeId: admin.data.challengeId, method: "totp", code: totpCode(totp), userId: "player" });
    assert.equal(verified.status, 200); assert.equal(verified.data.user.id, "admin", "challenge, not client user id, selects account");
    const editorToken = jwt.sign({ id: limitedId, sessionVersion: 0 }, secret, { expiresIn: "1h" });
    const backOffice = (await request("/api/admin", "GET", null, editorToken)).data;
    const source = backOffice.shop.find(item => item.type === "icons" && item.category === "classic");
    const copy = { ...source, name: "Fixture copy", price: backOffice.pricing["icons:classic"].recommended, packName: "" };
    assert.equal((await request("/api/admin/shop", "POST", { ...copy, packName: "!!!" }, editorToken)).status, 400);
    assert.equal((await request("/api/admin/shop", "POST", copy, editorToken)).status, 200);
    for (const route of ["/api/admin/community-events/missing/duplicate", "/api/admin/patchnotes/missing/duplicate", "/api/admin/COMMUNITY-EVENTS/missing/DUPLICATE/"]) {
      const limited = await request(route, "POST", {}, editorToken); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get("retry-after")) > 0);
    }
    assert.equal((await request("/api/admin/shop", "POST", copy, verified.data.token)).status, 200);
    const report = { accusedId: "other", category: "spam", description: "Des messages répétés ont été envoyés pendant la partie." };
    assert.equal((await request("/api/tribunal/reports", "POST", report, editorToken)).status, 201);
    assert.equal((await request("/api/tribunal/reports", "POST", { ...report, category: "other" }, editorToken)).status, 409);
    const game = (await request("/api/games")).data.find(entry => entry.id === "yahtzee");
    assert.equal((await request("/api/admin/games/yahtzee", "PATCH", { ...game, discordIconImage: "/api/game-images/custom.png" }, player.data.token)).status, 403);
    assert.equal((await request("/api/admin/games/yahtzee", "PATCH", { ...game, discordIconImage: "javascript:alert(1)" }, verified.data.token)).status, 400);
    assert.equal((await request("/api/admin/games/yahtzee", "PATCH", { ...game, discordIconImage: "/api/game-images/custom.png" }, verified.data.token)).status, 200);
    assert.equal((await request("/api/games")).data.find(entry => entry.id === "yahtzee").discordIconImage, "/api/game-images/custom.png");
    assert.equal((await flow(identities.banned)).status, 403);
    assert.equal((await flow(identities.minor)).status, 403);
    assert.equal((await flow(identities.locked)).status, 429);
    assert.equal((await flow(identities.revoked)).status, 403);
    const paired = await request("/api/me/discord/presence/pair", "POST", {}, player.data.token); assert.equal(paired.status, 403);
    assert.equal((await request("/api/me/discord/presence", "PATCH", { enabled: true }, player.data.token)).status, 200);
    const pair = await request("/api/me/discord/presence/pair", "POST", { remember: true }, player.data.token); assert.equal(pair.status, 200);
    const connection = await request("/api/auth/discord/presence/connect", "POST", { code: pair.data.code }); assert.equal(connection.status, 200);
    assert.equal(connection.data.remember, true); assert.ok(Date.parse(connection.data.expiresAt) - Date.now() > 29 * 86400000);
    assert.equal((await request("/api/me", "GET", null, connection.data.token)).status, 401);
    assert.equal((await request("/api/discord/presence/activity", "GET", null, player.data.token)).status, 401);
    assert.equal((await request("/api/discord/presence/activity", "GET", null, connection.data.token)).data.activity, null);
    await request("/api/me/discord/presence", "PATCH", { enabled: false }, player.data.token);
    assert.equal((await request("/api/discord/presence/activity", "GET", null, connection.data.token)).status, 401);
    assert.equal((await request("/api/me/discord", "DELETE", { password }, player.data.token)).status, 200);
    assert.equal((await flow(identities.player)).status, 404);
  } finally {
    if (server.exitCode === null) { const ended = new Promise((resolve) => server.once("exit", resolve)); server.kill(); await ended; }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-discord-api-"));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
