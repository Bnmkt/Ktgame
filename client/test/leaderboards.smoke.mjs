import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = mkdtempSync(path.join(tmpdir(), "ktga-leaderboards-"));
const database = path.join(folder, "test.sqlite"), secret = "leaderboard-isolated-test-secret";
const seed = new DatabaseSync(database);
seed.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('legacy-json-migrated','true');"); seed.close();
process.env.SQLITE_PATH = database;
const { readDb, writeDb } = await import(pathToFileURL(path.join(root, "server/src/db.js")));
const { casinoDateKey } = await import(pathToFileURL(path.join(root, "server/src/services/time.js")));
const db = readDb(), today = casinoDateKey();
db.users = Array.from({ length: 110 }, (_, index) => ({ id: `p${String(index).padStart(3, "0")}`, pseudo: `Joueur ${index + 1}`, tokens: 10000 - index, guest: false, createdAt: "2025-01-01T12:00:00Z", passwordHash: "PRIVATE_HASH", profile: { birthDate: "1990-01-01", gender: "", bio: "" } }));
db.users.push({ id: "viewer", pseudo: "Camille", tokens: 10, guest: false, createdAt: "2025-01-01T12:00:00Z", passwordHash: "PRIVATE_HASH" });
const makeMatch = (id, gameId, finishedAt, ranking, payouts = {}) => ({ id, roomId: "same-room", gameId, finishedAt, players: [{ id: "p000", pseudo: "Joueur 1" }, { id: "p001", pseudo: "Joueur 2" }], winners: ["p000"], ranking, payouts });
db.history = [
  makeMatch("now", "yahtzee", new Date().toISOString(), [{ id: "p000", score: 310 }, { id: "p001", score: 280 }], { p000: 200, p001: 50 }),
  makeMatch("past", "yahtzee", "2025-02-10T12:00:00Z", [{ id: "p000", score: 180 }, { id: "p001", score: 420 }], { p000: 100 }),
  makeMatch("low", "shut-the-box", new Date().toISOString(), [{ id: "p000", score: 0 }, { id: "p001", score: -12 }])
];
db.transactions = [{ id: "tx", userId: "p001", amount: 900, balance: 900, createdAt: "2025-02-10T12:00:00Z", reason: "room-pot-win", gameId: "yahtzee" }];
for (let index = 0; index < 135; index++) db.history.push({ id: `viewer-match-${index}`, roomId: "viewer-room", name: index === 0 ? "Archive ancienne" : "Table archivee", gameId: "accordion", finishedAt: new Date(Date.UTC(2026, 7, 1, 12, 0, index)).toISOString(), players: [{ id: "viewer", pseudo: "Camille" }], winners: index % 2 ? ["viewer"] : [], payouts: {}, ranking: [{ id: "viewer", score: -3 }] });
for (let index = 0; index < 250; index++) db.transactions.push({ id: `viewer-tx-${index}`, userId: "viewer", amount: index === 0 ? 10 : 0, balance: 10, reason: index === 0 ? "daily-claim" : "adjustment", createdAt: new Date(Date.UTC(2026, 7, 1, 12, 0, index)).toISOString() });
writeDb(db);
const require = createRequire(import.meta.url);
const token = require(path.join(root, "server/node_modules/jsonwebtoken")).sign({ id: "viewer", guest: false }, secret);
async function freePort() { const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening"); const port = socket.address().port; await new Promise((resolve) => socket.close(resolve)); return port; }
const apiPort = await freePort(), clientPort = await freePort();
const apiRoot = `http://127.0.0.1:${apiPort}/ktga`, base = `http://127.0.0.1:${clientPort}/ktga`;
const processes = [], errors = [];
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; child.stdout.on("data", (data) => { log += data; }); child.stderr.on("data", (data) => { log += data; });
  child.diagnostics = () => log; processes.push(child);
}
async function waitFor(url) { for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 150)); } throw new Error(`Timeout ${url}`); }
async function api(query) { const response = await fetch(`${apiRoot}/api/leaderboards?${query}`, { headers: { Authorization: `Bearer ${token}` } }); const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data; }
let browser, page;
try {
  start([path.join(root, "server/src/index.js")], folder, { NODE_ENV: "test", PORT: String(apiPort), HOST: "127.0.0.1", SQLITE_PATH: database, REQUEST_LOG_PATH: path.join(folder, "logs.sqlite"), JWT_SECRET: secret, APP_BASE_PATH: "/ktga", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", CLIENT_DIST: "", CLIENT_ORIGIN: `http://127.0.0.1:${clientPort}`, RATE_LIMIT_MAX: "10000" });
  await waitFor(`${apiRoot}/api/health`);
  start([path.join(root, "client/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], path.join(root, "client"), { VITE_BASE_PATH: "/ktga/", VITE_API_URL: apiRoot, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_PATH: "/ktga/socket.io" });
  await waitFor(`${base}/`);
  const global = await api("period=all&metric=balance");
  assert.equal(global.rows.length, 100); assert.equal(global.total, 111); assert.equal(global.self.rank, 111);
  assert.ok(!/PRIVATE_HASH|birthDate|friendCode|"login"/.test(JSON.stringify(global)));
  assert.equal((await api("period=season&season=2025-Q1&metric=balance")).rows[0].value, 900);
  assert.equal((await api("game=yahtzee&metric=score&period=all")).rows[0].value, 420);
  assert.equal((await fetch(`${apiRoot}/api/leaderboards?metric=score`, { headers: { Authorization: `Bearer ${token}` } })).status, 400);
  assert.equal((await fetch(`${apiRoot}/api/leaderboards`)).status, 401);
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript((value) => localStorage.setItem("ktgame-token", value), token);
  page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: "Classements", exact: true }).click();
  await page.locator(".leaderboard-table tbody tr").nth(19).waitFor();
  assert.equal(await page.locator(".leaderboard-table tbody tr").count(), 20);
  await page.getByRole("navigation", { name: "Pages du classement" }).getByRole("button", { name: "Dernière page" }).click();
  assert.match(await page.locator(".leaderboard-table tbody tr").last().innerText(), /100/);
  await page.getByRole("navigation", { name: "Pages du classement" }).getByRole("button", { name: "Première page" }).click();
  assert.match(page.url(), /\/ktga\/classements$/);
  assert.match(await page.locator(".leaderboard-table tfoot").innerText(), /111/);
  await page.screenshot({ path: path.join(folder, "leaderboard-desktop.png") });
  await page.getByLabel("Jeu", { exact: true }).selectOption("yahtzee");
  await page.getByRole("tab", { name: "Meilleur score", exact: true }).click();
  await page.locator(".leaderboard-results").getByRole("heading", { name: "Meilleur score", exact: true }).waitFor();
  assert.match(await page.locator(".leaderboard-table tbody tr").first().innerText(), /310/);
  await page.getByLabel("Saison", { exact: true }).selectOption("2025-Q1");
  await page.locator(".leaderboard-table tbody tr").filter({ hasText: "420" }).waitFor();
  await page.getByRole("group", { name: "Période du classement" }).getByRole("button", { name: "Jour", exact: true }).click();
  await page.getByLabel("Jour", { exact: true }).fill("2025-01-02");
  await page.getByText("Aucun résultat pour cette période.", { exact: true }).waitFor();
  await page.getByLabel("Jour", { exact: true }).fill(today);
  await page.locator(".leaderboard-table tbody tr").filter({ hasText: "310" }).waitFor();
  await page.getByRole("button", { name: "Actualiser les classements", exact: true }).click();
  await page.locator(".leaderboard-table tbody tr").first().waitFor();
  await page.locator(".leaderboard-table").getByRole("button", { name: "Joueur 1", exact: true }).click();
  await page.getByRole("heading", { name: "Profil de Joueur 1", exact: true }).waitFor();
  await page.locator(".public-profile-modal .modal-title-actions .icon-toggle").click();
  await page.locator(".public-profile-modal").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".leaderboard-filters").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(folder, "leaderboard-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByLabel("Jeu", { exact: true }).selectOption("shut-the-box");
  await page.locator(".leaderboard-summary").getByText(/le plus bas en premier/).waitFor();
  assert.match(await page.locator(".leaderboard-table tbody tr").first().innerText(), /Joueur 1/);
  await page.reload();
  await page.locator(".leaderboard-table tbody tr").nth(19).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/profil`);
  await page.getByRole("button", { name: "Historique", exact: true }).click();
  await page.locator(".profile-history-list article").nth(39).waitFor();
  assert.equal(await page.locator(".profile-history-list article").count(), 40);
  assert.match(await page.locator(".profile-ledger-heading").innerText(), /135/);
  await page.getByRole("button", { name: "Afficher 40 parties supplémentaires" }).click();
  await page.locator(".profile-history-list article").nth(79).waitFor();
  await page.getByPlaceholder("Table, code ou joueur").fill("Archive ancienne");
  await page.locator(".profile-history-list article").filter({ hasText: "Archive ancienne" }).waitFor();
  assert.equal(await page.locator(".profile-history-list article").count(), 1);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page.locator(".profile-transaction-list article").nth(59).waitFor();
  assert.match(await page.locator(".profile-ledger-heading").innerText(), /250/);
  await page.getByRole("button", { name: "Afficher 60 transactions supplémentaires" }).click();
  await page.locator(".profile-transaction-list article").nth(119).waitFor();
  await page.getByPlaceholder("Opération, motif ou table").fill("Bonus journalier");
  await page.locator(".profile-transaction-list article").filter({ hasText: "Bonus journalier" }).waitFor();
  assert.equal(await page.locator(".profile-transaction-list article").count(), 1);
  await page.screenshot({ path: path.join(folder, "profile-ledger-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(folder, "profile-ledger-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const request = async (endpoint, accessToken, body) => {
    const response = await fetch(`${apiRoot}/api${endpoint}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
  };
  const statistics = await request("/me/statistics", token);
  assert.equal(statistics.gamesPlayed, 135); assert.equal(statistics.transactions, 250); assert.equal(statistics.wins, 67);
  const buyerToken = require(path.join(root, "server/node_modules/jsonwebtoken")).sign({ id: "p000", guest: false }, secret);
  const shop = await request("/shop", buyerToken);
  const item = shop.find((entry) => !entry.rewardOnly && entry.price > 0 && entry.price < 5000 && entry.value !== "chip");
  assert.ok(item);
  const purchase = await request("/shop/purchase", buyerToken, { itemId: item.id });
  assert.equal(purchase.user.tokens, 10000 - item.price);
  assert.ok(purchase.user.cosmetics[item.type].includes(item.value));
  assert.ok(purchase.user.achievements.unlocked.includes("shop-first-purchase"));
  const duplicate = await request("/shop/purchase", buyerToken, { itemId: item.id });
  assert.equal(duplicate.user.tokens, purchase.user.tokens);
  const claim = await request("/me/daily-claim", token, {});
  assert.ok(claim.user.tokens > 10);
  const checkDb = new DatabaseSync(database, { readOnly: true });
  assert.equal(checkDb.prepare("SELECT count(*) AS n FROM user_inventory WHERE user_id = ? AND type = ? AND item_id = ?").get("p000", item.type, item.value).n, 1);
  assert.equal(checkDb.prepare("SELECT count(*) AS n FROM user_achievements WHERE user_id = 'p000' AND achievement_id = 'shop-first-purchase' AND unlocked = 1").get().n, 1);
  checkDb.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: folder, checks: ["top-100-and-self", "privacy", "seasons", "day-and-empty", "all-time", "per-game-records", "lower-scores", "public-profile", "absolute-route", "desktop-mobile", "paginated-profile-history", "full-history-search", "independent-statistics", "inventory-purchase-idempotence", "achievement-relation", "daily-bonus"] }));
} catch (error) {
  await page?.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
  console.error(folder, processes.map((child) => child.diagnostics().slice(-1800)).join("\n")); throw error;
} finally {
  await browser?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) { const stopped = once(child, "exit"); child.kill(); await stopped; }
}
