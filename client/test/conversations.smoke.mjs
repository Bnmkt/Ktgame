import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "ktga-conversations-"));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const port = async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const value = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return value;
};
const apiPort = await port();
const webPort = await port();
const origin = `http://127.0.0.1:${webPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const secret = randomBytes(32).toString("hex");
const token = (id) => jwt.sign({ id, guest: false, sessionVersion: 0 }, secret, { expiresIn: "1h" });
const users = ["alpha", "beta", "gamma", "delta", "admin"].map((id) => ({
  id, pseudo: id, email: `${id}@example.com`, guest: false, active: true, admin: id === "admin",
  tokens: 10000, passwordPolicyVersion: 1, emailVerifiedAt: new Date().toISOString(),
  profile: { displayName: id, birthDate: "2000-01-01" },
  friends: id === "alpha" ? ["beta", "gamma", "delta"] : ["alpha"], friendRequests: { incoming: [], outgoing: [] }
}));
const database = new DatabaseSync(path.join(temporary, "main.sqlite"));
database.exec("CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER NOT NULL DEFAULT 0); CREATE TABLE rooms(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,game_id TEXT NOT NULL,is_public INTEGER NOT NULL DEFAULT 1,finished INTEGER NOT NULL DEFAULT 0,created_at TEXT,data TEXT NOT NULL);");
for (const user of users) database.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(user.id, JSON.stringify(user), user.pseudo, user.email);
const room = { id: "chat-table", code: "CHAT01", name: "Table de test", gameId: "yahtzee", ownerId: "alpha", players: users.slice(0, 2), stake: 10, isPublic: true, finished: false, state: null, readyPlayerIds: [] };
database.prepare("INSERT INTO rooms VALUES(?,?,?,1,0,?,?)").run(room.id, room.code, room.gameId, new Date().toISOString(), JSON.stringify(room));
database.close();
const processes = [];
let serverOutput = "";
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { serverOutput += chunk; });
  child.stderr.on("data", (chunk) => { serverOutput += chunk; });
  processes.push(child);
  return child;
}
const waitFor = async (check, label) => {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* Server or UI is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}\n${serverOutput.slice(-3000)}`);
};
const request = async (id, endpoint, body, method = "POST") => {
  const response = await fetch(`${apiOrigin}${endpoint}`, { method, headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  assert.ok(response.ok, `${endpoint}: ${response.status} ${JSON.stringify(result)}`);
  return result;
};
let browser;
try {
  start(["src/index.js"], path.join(root, "server"), {
    NODE_ENV: "test", PORT: String(apiPort), HOST: "127.0.0.1", JWT_SECRET: secret,
    CLIENT_ORIGIN: origin, CLIENT_DIST: "", APP_BASE_PATH: "", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "",
    SMTP_HOST: "", EMAIL_FROM: "", SQLITE_PATH: path.join(temporary, "main.sqlite"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "PATCHNOTES_DB_PATH", "REQUEST_LOG_PATH"].map((key) => [key, path.join(temporary, `${key}.sqlite`)]))
  });
  start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], path.join(root, "client"), {
    VITE_API_URL: apiOrigin, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: "/socket.io", VITE_BASE_PATH: "/"
  });
  await waitFor(async () => (await fetch(`${apiOrigin}/api/health`)).ok && (await fetch(origin)).ok, "isolated servers");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "ktga_session", value: token("alpha"), url: apiOrigin, httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(() => {
    localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false }));
    window.chatToneCount = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) { window.chatToneCount += 1; return original.apply(this, args); };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
    await blocker.enableBlockingInPage(page);
  }
  await page.goto(origin);
  const toggle = page.locator(".conversation-toggle");
  const drawer = page.locator(".conversation-drawer");
  const contacts = () => page.locator('.conversation-contact-strip [role="tab"]');
  await toggle.waitFor();
  await toggle.click();
  await page.getByRole("button", { name: "Amis", exact: true }).click();
  assert.equal(await contacts().count(), 0, "friends without an opened conversation stay hidden");
  await page.getByRole("button", { name: "Fermer Social", exact: true }).click();
  await request("beta", "/api/chat/messages", { channelType: "direct", friendId: "alpha", content: "Bonjour alpha" });
  await waitFor(async () => await toggle.locator(".conversation-toggle-count").textContent() === "1", "private unread badge");
  await waitFor(async () => await page.evaluate(() => window.chatToneCount) === 2, "private notification sound");
  await toggle.click();
  await waitFor(async () => await contacts().count() === 1 && await contacts().first().innerText() === "beta", "only beta conversation visible");
  await waitFor(async () => await toggle.locator(".conversation-toggle-count").count() === 0, "visible message acknowledged");
  let profileRequests = 0;
  page.on("request", (entry) => { if (/\/api\/users\/[^/]+\/public/.test(entry.url())) profileRequests += 1; });
  await contacts().first().locator(".display-name").click();
  await page.waitForTimeout(400);
  assert.equal(profileRequests, 0, "conversation nickname does not open public profile");
  await page.getByRole("button", { name: "Choisir un ami", exact: true }).click();
  await page.getByRole("button", { name: "Discuter avec gamma", exact: true }).click();
  await waitFor(async () => await contacts().count() === 2, "explicit empty conversation opened");
  assert.equal(await contacts().first().innerText(), "beta", "recent messages sort before empty conversations");
  await waitFor(async () => (await request("alpha", "/api/chat/unread", undefined, "GET")).channels.find((row) => row.friendId === "gamma")?.opened, "empty conversation saved");
  await page.reload();
  await toggle.waitFor();
  await toggle.click();
  await page.getByRole("button", { name: /^Amis/ }).click();
  await waitFor(async () => await contacts().count() === 2, "empty conversation persists across reload");
  await request("gamma", "/api/chat/messages", { channelType: "direct", friendId: "alpha", content: "Salut depuis gamma" });
  await waitFor(async () => (await contacts().first().innerText()).startsWith("gamma"), "latest conversation first");
  const previews = path.join(root, "docs", "previews");
  mkdirSync(previews, { recursive: true });
  await page.screenshot({ path: path.join(previews, "chat-conversations-desktop.png"), fullPage: true });
  await page.reload();
  await toggle.waitFor();
  await toggle.click();
  await page.getByRole("button", { name: /^Amis/ }).click();
  await waitFor(async () => await contacts().count() === 2, "conversations persist across reload");
  assert.equal(await contacts().filter({ hasText: "delta" }).count(), 0, "unopened friend remains absent");
  await page.goto(`${origin}/table/CHAT01`);
  await toggle.waitFor();
  await waitFor(async () => (await request("alpha", "/api/chat/unread?roomCode=CHAT01", undefined, "GET")).channels.some((row) => row.channelType === "room"), "room access");
  await toggle.click();
  await page.getByRole("button", { name: "Table", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Fermer Social", exact: true }).click();
  await request("beta", "/api/chat/messages", { channelType: "room", roomCode: "CHAT01", content: "Bienvenue a la table" });
  await waitFor(async () => await toggle.locator(".conversation-toggle-count").textContent() === "1", "table unread badge");
  await waitFor(async () => await page.evaluate(() => window.chatToneCount) === 2, "table notification sound");
  await toggle.click();
  await page.getByRole("button", { name: /^Table 1/ }).click();
  await page.getByText("Bienvenue a la table", { exact: true }).waitFor();
  await waitFor(async () => await toggle.locator(".conversation-toggle-count").count() === 0, "table message acknowledged");
  await page.getByRole("button", { name: "Couper le son du chat", exact: true }).click();
  const tones = await page.evaluate(() => window.chatToneCount);
  await page.getByRole("button", { name: "Fermer Social", exact: true }).click();
  await page.waitForTimeout(800);
  await request("beta", "/api/chat/messages", { channelType: "room", roomCode: "CHAT01", content: "Message silencieux" });
  await waitFor(async () => await toggle.locator(".conversation-toggle-count").textContent() === "1", "silent message remains unread");
  assert.equal(await page.evaluate(() => window.chatToneCount), tones, "sound preference respected");
  await toggle.click();
  await page.getByText("Message silencieux", { exact: true }).waitFor();
  await waitFor(async () => await toggle.locator(".conversation-toggle-count").count() === 0, "silent message acknowledged");
  await page.screenshot({ path: path.join(previews, "chat-alerts-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  assert.ok(await drawer.isVisible(), "drawer survives content blocking on mobile");
  await page.screenshot({ path: path.join(previews, "chat-alerts-mobile.png"), fullPage: true });
  await request("alpha", "/api/connections/muted/beta", {});
  await page.waitForTimeout(800);
  await request("beta", "/api/chat/messages", { channelType: "room", roomCode: "CHAT01", content: "Message masque" });
  await page.waitForTimeout(400);
  assert.equal(await page.getByText("Message masque", { exact: true }).count(), 0, "muted messages are not delivered");
  const sanction = { login: "delta@example.com", tokens: 10000, moderation: { softBan: { active: true, reason: "Test sanction temporaire", endsAt: new Date(Date.now() + 86400000).toISOString() } } };
  await request("admin", "/api/admin/users/delta", sanction, "PATCH");
  const sanctioned = await request("admin", "/api/admin/users/delta", undefined, "GET");
  assert.deepEqual(sanctioned.tribunal.behavior, { score: 95, cases: 1, sanctions: 1 });
  await request("admin", "/api/admin/users/delta", sanction, "PATCH");
  const unchanged = await request("admin", "/api/admin/users/delta", undefined, "GET");
  assert.deepEqual(unchanged.tribunal.behavior, sanctioned.tribunal.behavior, "resaving does not penalize twice");
  const register = await request("admin", "/api/admin/tribunal", undefined, "GET");
  assert.equal(register.cases.filter((entry) => entry.source === "administrative-49-3" && entry.accusedId === "delta").length, 1);
  assert.deepEqual(errors, []);
  console.log("PASS: opened conversations, recent order, persistence, nickname selection, private/table sound and badges, mute, desktop/mobile.");
  console.log(process.env.BLOCKER_MODULE ? "PASS: Ghostery content blocking enabled throughout the browser checks." : "NOTE: content blocking not requested; set BLOCKER_MODULE to test it.");
  console.log("PASS: temporary administrative sanction lowers behavior once and creates a 49,3 tribunal record.");
} finally {
  await browser?.close();
  for (const child of processes) {
    if (child.exitCode !== null) continue;
    await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
  }
  if (path.dirname(temporary) === path.resolve(tmpdir()) && path.basename(temporary).startsWith("ktga-conversations-")) rmSync(temporary, { recursive: true, force: true });
}
