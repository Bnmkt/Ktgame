import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = mkdtempSync(path.join(tmpdir(), "ktga-event-refunds-"));
const database = path.join(folder, "test.sqlite");
const db = new DatabaseSync(database);
db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('legacy-json-migrated','true')");
db.close();
async function freePort() { const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening"); const port = listener.address().port; await new Promise((resolve) => listener.close(resolve)); return port; }
const apiPort = await freePort();
const clientPort = await freePort();
const apiRoot = `http://127.0.0.1:${apiPort}/ktga`;
const base = `http://127.0.0.1:${clientPort}/ktga`;
const children = [];
const errors = [];
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  children.push(child);
  return child;
}
async function stop(child) { if (child.exitCode !== null || child.signalCode !== null) return; const ended = once(child, "exit"); child.kill(); await ended; }
async function waitFor(url) { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 150)); } throw new Error(`Timeout ${url}`); }
async function api(endpoint, token, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${apiRoot}/api${endpoint}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.ok(response.ok, `${endpoint}: ${JSON.stringify(result)}`);
  return result;
}
const serverEnv = { NODE_ENV: "test", TEST_ADMIN_EMAIL: "bnmkt@tests.invalid", HOST: "127.0.0.1", PORT: String(apiPort), SQLITE_PATH: database, REQUEST_LOG_PATH: path.join(folder, "logs.sqlite"), JWT_SECRET: "event-refunds-test-only", APP_BASE_PATH: "/ktga", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", CLIENT_DIST: "", CLIENT_ORIGIN: `http://127.0.0.1:${clientPort}` };
let browser;
try {
  const server = start([path.join(root, "server/src/index.js")], folder, serverEnv);
  await waitFor(`${apiRoot}/api/health`);
  start([path.join(root, "client/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], path.join(root, "client"), { VITE_BASE_PATH: "/ktga/", VITE_API_URL: apiRoot, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_PATH: "/ktga/socket.io" });
  await waitFor(`${base}/`);
  const owner = await api("/auth/register", null, { email: "bnmkt@tests.invalid", pseudo: "bnmkt", password: "test-only-password", birthDate: "1990-01-01", termsVersion: "2026-09-27" });
  const initialTokens = owner.user.tokens;
  async function createEvent() {
    const { event } = await api("/admin/community-events", owner.token, {});
    event.startsAt = new Date(Date.now() - 3600000).toISOString();
    event.endsAt = new Date(Date.now() + 3600000).toISOString();
    event.participation.entryCost = 10;
    event.participation.potContributionValue = 8;
    event.pot.initial = 100000;
    event.pot.remainderRule = "top";
    event.actions.allowPurchase = false;
    await api(`/admin/community-events/${event.id}`, owner.token, event, "PATCH");
    await api(`/admin/community-events/${event.id}/status`, owner.token, { status: "active" });
    await api(`/community-events/${event.id}/join`, owner.token, {});
    return event;
  }
  const event = await createEvent();
  const preview = await api(`/community-events/${event.slug}`, owner.token);
  assert.equal(preview.potentialReward.amount, 10);
  assert.equal(preview.potentialReward.detail.outcome, "entry-refund");
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((token) => localStorage.setItem("ktgame-token", token), owner.token);
  await page.goto(`${base}/evenement/${event.slug}`);
  await page.locator(".event-potential-reward").filter({ hasText: "Remboursement si l'objectif reste inachevé" }).waitFor();
  await api(`/admin/community-events/${event.id}/status`, owner.token, { status: "finished" });
  await page.getByRole("heading", { name: "Objectif non atteint", exact: true }).waitFor();
  await page.locator(".event-final-summary").scrollIntoViewIfNeeded();
  assert.equal(await page.locator(".event-final-summary .event-reward-breakdown").count(), 0);
  assert.match(await page.locator(".event-final-summary").innerText(), /Ton remboursement/);
  await page.screenshot({ path: path.join(folder, "refund-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".event-final-summary").scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(folder, "refund-mobile.png") });
  assert.equal((await api("/me", owner.token)).tokens, initialTokens);
  const automatic = await createEvent();
  automatic.endsAt = new Date(Date.now() - 1000).toISOString();
  await api(`/admin/community-events/${automatic.id}`, owner.token, automatic, "PATCH");
  const ended = await api(`/community-events/${automatic.slug}`, owner.token);
  assert.equal(ended.event.status, "finished");
  assert.equal(ended.reward.amount, 10);
  assert.equal(ended.reward.detail.outcome, "entry-refund");
  assert.equal((await api("/me", owner.token)).tokens, initialTokens);
  await browser.close(); browser = null;
  await stop(server);
  start([path.join(root, "server/src/index.js")], folder, serverEnv);
  await waitFor(`${apiRoot}/api/health`);
  assert.equal((await api(`/community-events/${event.slug}`, owner.token)).reward.amount, 10);
  assert.equal((await api("/me", owner.token)).tokens, initialTokens);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: folder, checks: ["manual-close", "automatic-expiry", "paid-fee-only", "persistent-idempotency", "preview", "desktop-mobile"] }));
} finally {
  await browser?.close();
  for (const child of children.reverse()) await stop(child);
}
