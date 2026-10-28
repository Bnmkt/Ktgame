import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = mkdtempSync(path.join(tmpdir(), "ktga-rooms-events-"));
const database = path.join(folder, "test.sqlite");
const db = new DatabaseSync(database);
db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('legacy-json-migrated','true');");
db.exec("CREATE TABLE users(id TEXT PRIMARY KEY, data TEXT NOT NULL, pseudo TEXT NOT NULL, email TEXT, guest INTEGER)");
for (const [id, pseudo] of [["owner", "bnmkt"], ["player", "Camille"], ["offline", "Alex"]]) {
  const account = { id, pseudo, email: `${id}@tests.invalid`, active: true, guest: false, admin: id === "owner", tokens: 10000, passwordHash: "unused-fixture-hash", passwordPolicyVersion: 1, emailVerifiedAt: new Date().toISOString(), profile: { birthDate: "1990-01-01" }, createdAt: new Date().toISOString() };
  db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(account), pseudo, account.email);
}
db.close();
async function freePort() { const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening"); const port = socket.address().port; await new Promise((resolve) => socket.close(resolve)); return port; }
const apiPort = await freePort();
const clientPort = await freePort();
const apiRoot = `http://127.0.0.1:${apiPort}/ktga`;
const base = `http://127.0.0.1:${clientPort}/ktga`;
const processes = [];
const errors = [];
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (data) => { log += data; }); child.stderr.on("data", (data) => { log += data; });
  child.diagnostics = () => log;
  processes.push(child); return child;
}
async function waitFor(url) { for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 150)); } throw new Error(`Timeout ${url}`); }
async function api(endpoint, token, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${apiRoot}/api${endpoint}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.ok(response.ok, `${method} ${endpoint}: ${JSON.stringify(data)}`); return data;
}
let browser;
try {
  start([path.join(root, "server/src/index.js")], folder, { NODE_ENV: "test", TEST_ADMIN_EMAIL: "bnmkt@tests.invalid", PORT: String(apiPort), HOST: "127.0.0.1", SQLITE_PATH: database, REQUEST_LOG_PATH: path.join(folder, "logs.sqlite"), JWT_SECRET: "isolated-test-only-secret", APP_BASE_PATH: "/ktga", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", CLIENT_DIST: "", CLIENT_ORIGIN: `http://127.0.0.1:${clientPort}`, API_RATE_LIMIT_MAX: "10000", AUTH_RATE_LIMIT_MAX: "100" });
  await waitFor(`${apiRoot}/api/health`);
  start([path.join(root, "client/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], path.join(root, "client"), { VITE_BASE_PATH: "/ktga/", VITE_API_URL: apiRoot, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_PATH: "/ktga/socket.io" });
  await waitFor(`${base}/`);
  const fixtureAccount = async (id) => {
    const token = jwt.sign({ id, guest: false, sessionVersion: 0 }, "isolated-test-only-secret", { expiresIn: "1h" });
    return { token, user: await api("/me", token) };
  };
  const owner = await fixtureAccount("owner"), player = await fixtureAccount("player"), offline = await fixtureAccount("offline");
  const room = await api("/rooms", owner.token, { gameId: "president", stake: 10, name: "Président multijoueur", isPublic: true });
  for (const account of [player, offline]) {
    await api(`/rooms/${room.code}/join`, account.token, {});
    await api(`/rooms/${room.code}/ready`, account.token, {});
  }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : pathToFileURL(path.join(tmpdir(), "ktga-chat-browser-tools/node_modules/playwright/index.mjs")).href);
  browser = await chromium.launch({ channel: "msedge", headless: true });
  async function newPage(account) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(token => {
      localStorage.setItem("ktgame-token", token);
      localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false }));
    }, account.token);
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); return page;
  }
  const host = await newPage(owner), guest = await newPage(player);
  await host.goto(`${base}/table/${room.code}`); await guest.goto(`${base}/table/${room.code}`);
  await guest.locator(".room-table-tools").waitFor();
  await host.getByRole("button", { name: "Démarrer la partie", exact: true }).click();
  await host.locator('[data-president-dealing="true"]').waitFor();
  await guest.locator('[data-president-dealing="true"]').waitFor();
  await host.getByRole("button", { name: "Passer l’animation", exact: true }).click();
  await guest.getByRole("button", { name: "Passer l’animation", exact: true }).click();
  const snapshot = await api(`/rooms/${room.code}`, owner.token);
  assert.equal(snapshot.state.hands[owner.user.id].length, 18);
  assert.ok(snapshot.state.hands[player.user.id].every(card => card === null));
  assert.ok(snapshot.state.hands[offline.user.id].every(card => card === null));
  assert.equal(await guest.locator('.president-seat [data-card-face]').count(), 0);
  const initial = await host.locator('[data-president-card]').evaluateAll(nodes => nodes.map(node => node.dataset.presidentCard));
  assert.deepEqual(initial, snapshot.state.hands[owner.user.id].map(card => `${card.deckId ?? 0}:${card.rank}:${card.suit}`));
  const first = host.locator('[data-president-card]').first();
  await first.focus(); await host.keyboard.press('Alt+ArrowRight');
  const reordered = await host.locator('[data-president-card]').evaluateAll(nodes => nodes.map(node => node.dataset.presidentCard));
  assert.deepEqual(reordered, [initial[1], initial[0], ...initial.slice(2)]);
  // Submit a pair when available, in reverse server order to exercise manual ordering.
  const hand = snapshot.state.hands[owner.user.id];
  const pair = hand.filter(card => hand.filter(other => other.rank === card.rank).length > 1).slice(0, 1);
  const chosen = pair.length ? hand.filter(card => card.rank === pair[0].rank).slice(0, 2).reverse() : hand.slice(0, 1);
  for (const card of chosen) {
    const key = `${card.deckId ?? 0}:${card.rank}:${card.suit}`;
    await host.locator(`[data-president-card="${key}"]`).click({ position: { x: 7, y: 12 } });
  }
  const response = host.waitForResponse(response => response.url().endsWith(`/rooms/${room.code}/action`) && response.request().method() === 'POST');
  await host.getByRole('button', { name: 'Jouer la sélection', exact: true }).click();
  const after = await (await response).json();
  assert.equal(after.state.hands[owner.user.id].length, hand.length - chosen.length);
  assert.ok(chosen.every(card => !after.state.hands[owner.user.id].some(other => card.rank === other.rank && card.suit === other.suit)));
  await guest.waitForFunction(count => document.querySelectorAll('.president-played-cards [data-card-face]').length === count, chosen.length);
  const selectedIds = chosen.map(card => `${card.deckId ?? 0}:${card.rank}:${card.suit}`);
  assert.deepEqual(await host.locator('[data-president-card]').evaluateAll(nodes => nodes.map(node => node.dataset.presidentCard)), reordered.filter(key => !selectedIds.includes(key)));
  if (after.pacing) await api(`/rooms/${room.code}/pacing/skip`, owner.token, { pacingId: after.pacing.id });
  await guest.getByRole('button', { name: /^Passer/ }).click();
  await host.waitForFunction(() => document.querySelector('.table-hud-facts')?.textContent.includes('Alex'));
  const current = await api(`/rooms/${room.code}`, owner.token);
  assert.equal(current.state.passes.includes(player.user.id), true);
  await host.reload(); await host.locator('.president-stage').waitFor();
  assert.equal(await host.locator('[data-president-dealing]').count(), 0, 'reconnect restores immediately');
  assert.deepEqual(await host.locator('[data-president-card]').evaluateAll(nodes => nodes.map(node => node.dataset.presidentCard)), reordered.filter(key => !selectedIds.includes(key)));
  await host.getByRole('button', { name: 'Plein écran', exact: true }).click();
  await host.locator('.table-fullscreen').waitFor();
  await host.screenshot({ path: path.join(folder, 'president-real-server-fullscreen.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: folder, checks: ['three-real-accounts','private-server-payloads','two-browser-deal','keyboard-manual-order','explicit-card-identities','server-preserves-remaining-order','socket-pile-and-turn','pass','reload-and-fullscreen'], errors }));
} catch (error) {
  for (const [i, context] of (browser?.contexts() ?? []).entries()) await context.pages()[0]?.screenshot({ path: path.join(folder, `failure-${i}.png`) }).catch(() => {});
  console.error(processes.map(child => child.diagnostics().slice(-1500)).join("\n"));
  throw error;
} finally {
  await browser?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
}
