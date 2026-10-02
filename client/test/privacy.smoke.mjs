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
const folder = mkdtempSync(path.join(tmpdir(), "ktga-privacy-"));
const database = path.join(folder, "test.sqlite");
const db = new DatabaseSync(database);
db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('legacy-json-migrated','true')");
db.close();
async function freePort() { const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port; }
const apiPort = await freePort(), clientPort = await freePort();
const apiRoot = `http://127.0.0.1:${apiPort}/ktga`, base = `http://127.0.0.1:${clientPort}/ktga`;
const children = [], errors = [];
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (data) => { output = (output + data).slice(-5000); });
  child.stderr.on("data", (data) => { output = (output + data).slice(-5000); });
  child.on("exit", (code) => { if (code) console.error(output); });
  children.push(child); return child;
}
async function waitFor(url) { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 150)); } throw new Error(`Timeout ${url}`); }
async function api(endpoint, token, body, method = body ? "POST" : "GET", expected) {
  const response = await fetch(`${apiRoot}/api${endpoint}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (expected) assert.equal(response.status, expected, JSON.stringify(result)); else assert.ok(response.ok, `${endpoint}: ${JSON.stringify(result)}`);
  return result;
}
const registration = { password: "test-only-password", birthDate: "1990-01-01", termsVersion: "2026-09-27" };
const consent = () => ({ version: "2026-09-27", chosenAt: Date.now(), enabled: true, ageConfirmed: true });
let browser;
try {
  start([path.join(root, "server/src/index.js")], folder, { NODE_ENV: "test", TEST_ADMIN_EMAIL: "bnmkt@tests.invalid", HOST: "127.0.0.1", PORT: String(apiPort), SQLITE_PATH: database, REQUEST_LOG_PATH: path.join(folder, "logs.sqlite"), JWT_SECRET: "privacy-test-only", APP_BASE_PATH: "/ktga", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", CLIENT_DIST: "", CLIENT_ORIGIN: `http://127.0.0.1:${clientPort}` });
  await waitFor(`${apiRoot}/api/health`);
  start([path.join(root, "client/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], path.join(root, "client"), { VITE_BASE_PATH: "/ktga/", VITE_API_URL: apiRoot, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_PATH: "/ktga/socket.io" });
  await waitFor(`${base}/`);
  await api("/auth/register", null, { pseudo: "rejected", password: "password" }, "POST", 400);
  await api("/auth/register", null, { ...registration, email: "public@netdis.org", pseudo: "reserved-domain" }, "POST", 400);
  const owner = await api("/auth/register", null, { ...registration, email: "bnmkt@tests.invalid", pseudo: "bnmkt" });
  const other = await api("/auth/register", null, { ...registration, email: "second@tests.invalid", pseudo: "second" });
  const managed = await api("/auth/register", null, { ...registration, email: "managed@tests.invalid", pseudo: "managed" });
  const managedDetail = await api(`/admin/users/${managed.user.id}`, owner.token);
  assert.equal(managedDetail.user.emailVerified, false);
  assert.equal(managedDetail.statistics.gamesPlayed, 0);
  assert.deepEqual(managedDetail.activeRooms, []);
  await api(`/admin/users/${managed.user.id}/email-validation`, owner.token, { verified: true });
  assert.equal((await api(`/admin/users/${managed.user.id}`, owner.token)).user.emailVerified, true);
  await api(`/admin/users/${managed.user.id}/revoke-sessions`, owner.token, {});
  await api("/me", managed.token, undefined, "GET", 401);
  await api(`/admin/users/${managed.user.id}`, owner.token, undefined, "DELETE");
  await api(`/admin/users/${managed.user.id}`, owner.token, undefined, "GET", 404);
  await api("/me/activity", owner.token, { page: "shop" }, "POST", 403);
  await api("/admin/parental-approvals", other.token, { reference: "TEST-1", verified: true }, "POST", 403);
  const approval = await api("/admin/parental-approvals", owner.token, { reference: "TEST-1", verified: true });
  const child = await api("/auth/register", null, { ...registration, email: "child@tests.invalid", pseudo: "child", birthDate: "2020-01-01", parentalCode: approval.code });
  await api("/auth/register", null, { ...registration, email: "child-two@tests.invalid", pseudo: "child-two", birthDate: "2020-01-01", parentalCode: approval.code }, "POST", 400);
  await api("/me/privacy", child.token, consent(), "POST", 400);
  const shop = await api("/shop", owner.token);
  const packedItem = await api("/admin/shop", owner.token, { name: "Halo du soir", description: "Objet de test en pack.", price: 100, type: "icons", category: "classic", icon: "sparkles", packName: "Soirée Néon" });
  const packedItemTwo = await api("/admin/shop", owner.token, { name: "Cadre du soir", description: "Second objet du pack.", price: 100, type: "profileFrames", category: "classic", packName: "Soirée Néon" });
  assert.deepEqual(packedItem.packs, ["soiree-neon"]);
  assert.equal(packedItem.packName, "Soirée Néon");
  const packedFromCatalog = (await api("/shop", owner.token)).find((entry) => entry.id === packedItem.id);
  assert.equal(packedFromCatalog.packName, "Soirée Néon");
  await api(`/admin/shop/${packedItem.id}`, owner.token, { ...packedFromCatalog, packName: "" }, "PATCH");
  assert.deepEqual((await api("/shop", owner.token)).find((entry) => entry.id === packedItem.id).packs, []);
  assert.deepEqual(packedItemTwo.packs, ["soiree-neon"]);
  const item = shop.find((row) => row.type === "icons" && row.price > 0 && row.price <= owner.user.tokens && !row.rewardOnly);
  assert.ok(item);
  await api("/shop/purchase", owner.token, { itemId: item.id });
  const achievement = await api("/admin/achievements", owner.token, { title: "Boutique equipee", description: "Visiter la boutique equipe.", type: "site", group: "Test", target: 1, rule: { source: "event", event: "site.visit", condition: { all: [{ field: "page", operator: "eq", value: "shop" }, { field: "player.equippedItemIds", operator: "contains", value: item.id }] } } });
  await api("/me/privacy", owner.token, consent());
  const result = await api("/me/activity", owner.token, { page: "shop", player: { equippedItemIds: [] }, markers: ["password:private"] });
  assert.ok(result.unlocked.includes(achievement.id), JSON.stringify({ result, achievement, item, cosmetics: (await api("/me", owner.token)).cosmetics }));
  await api("/me/privacy", other.token, consent());
  const forged = await api("/me/activity", other.token, { page: "shop", player: { equippedItemIds: [item.id] } });
  assert.ok(!forged.unlocked.includes(achievement.id));
  const timeGoals = [];
  for (const [title, event, valueField] of [["Temps table", "table.activity", "tableSeconds"], ["Temps manche", "game.round.activity", "roundSeconds"]]) {
    timeGoals.push(await api("/admin/achievements", owner.token, { title, description: title, type: "site", group: "Test", target: 1, rule: { source: "event", event, aggregate: "max", scope: "career", valueField, condition: { field: "seconds", operator: "gt", value: 0 } } }));
  }
  const timeMetric = await api("/admin/achievements", owner.token, { title: "Temps cumule", description: "Temps aux tables", type: "site", group: "Test", target: 1, rule: { source: "metric", metric: "tableActiveSeconds" } });
  const room = await api("/rooms", owner.token, { gameId: "yahtzee", stake: 10 });
  await api(`/rooms/${room.code}/start`, owner.token, {});
  await api(`/rooms/${room.code}/join`, other.token, {});
  await api("/me/activity", owner.token, { active: false });
  await api("/me/activity", other.token, { active: false });
  for (const token of [owner.token, other.token]) await api("/me/activity", token, { page: "room", roomCode: room.code, roundSeconds: 9999 });
  await new Promise((resolve) => setTimeout(resolve, 5200));
  const playingTime = await api("/me/activity", owner.token, { page: "room", roomCode: room.code });
  const spectatorTime = await api("/me/activity", other.token, { page: "room", roomCode: room.code });
  for (const goal of [...timeGoals, timeMetric]) {
    assert.ok(playingTime.unlocked.includes(goal.id), `player time unlock: ${goal.title}`);
    assert.ok(!spectatorTime.unlocked.includes(goal.id), `spectators cannot unlock: ${goal.title}`);
  }
  const settingsBefore = await api("/admin", owner.token);
  const defaultsToTest = {
    yahtzee: { rollsPerTurn: 5 }, "421": { rounds: 8, paidRerollsEnabled: false },
    "cul-de-chouette": { rounds: 12 }, blackjack: { dealerMode: "classic-17", minimumBet: 75, maximumBet: 250 },
    president: { revolutionEnabled: false }, farkle: { targetScore: 15000, entryScore: 200 },
    "liars-dice": { startingDice: 7 }, "shut-the-box": { maxTile: 12 }, "golf-solitaire": { wrapRanks: true },
    accordion: { allowOneApart: false, allowThreeApart: true }, "midnight-dice": { rounds: 6, uniqueContracts: false },
    "velvet-ruse": { claimRule: "rank-only", handSize: 6 }, belote: { frenchRules: true, announcements: false },
    bataille: { pileMode: "single", scoringMode: "pile-sum", hiddenDeck: true, returnAfterRounds: 8 }
  };
  await api("/admin/games/yahtzee", other.token, { defaultModifiers: { rollsPerTurn: 5 } }, "PATCH", 403);
  await api("/admin/games/yahtzee", owner.token, { defaultModifiers: null }, "PATCH", 400);
  let midnightTable;
  for (const [id, defaults] of Object.entries(defaultsToTest)) {
    const game = settingsBefore.games.find((entry) => entry.id === id);
    await api(`/admin/games/${id}`, owner.token, { ...game, defaultModifiers: { ...defaults, invalidField: 999 } }, "PATCH");
    const table = await api("/rooms", owner.token, { gameId: id, stake: 10 });
    if (id === "midnight-dice") midnightTable = table;
    const actual = id === "bataille" ? table.battleModifiers : table.gameModifiers;
    for (const [key, value] of Object.entries(defaults)) assert.equal(actual[key], value, `${id}.${key}`);
    assert.equal(actual.invalidField, undefined);
    // An older admin client saving metadata must not reset configured variants.
    const { defaultModifiers: ignored, ...metadata } = game;
    await api(`/admin/games/${id}`, owner.token, metadata, "PATCH");
  }
  await api(`/rooms/${midnightTable.code}/start`, owner.token, {});
  assert.equal((await api(`/rooms/${room.code}`, owner.token)).state.modifiers.rollsPerTurn, 3, "running table retains its original defaults");
  assert.equal((await api("/admin", owner.token)).games.find((game) => game.id === "yahtzee").defaultModifiers.rollsPerTurn, 5);
  await api("/me/privacy", owner.token, { ...consent(), enabled: false });
  await api("/me/activity", owner.token, { page: "shop" }, "POST", 403);
  const publicProfile = await api(`/users/${child.user.id}/public`, owner.token);
  assert.ok(!JSON.stringify(publicProfile).includes("TEST-1"));
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("pageerror", (error) => errors.push(error.message));
  const activityRequests = [];
  page.on("request", (request) => { if (request.url().endsWith("/api/me/activity")) activityRequests.push(request); });
  await page.goto(`${base}/mentions-legales`);
  await page.getByRole("heading", { name: "Mentions légales", exact: true }).waitFor();
  await page.screenshot({ path: path.join(folder, "consent-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Refuser le suivi facultatif", exact: true }).click();
  await page.screenshot({ path: path.join(folder, "legal-desktop.png"), fullPage: true });
  assert.equal(activityRequests.length, 0);
  for (const route of ["conditions", "confidentialite", "cookies", "parents"]) {
    await page.goto(`${base}/${route}`);
    await page.locator(".legal-layout article").waitFor();
    assert.ok(await page.locator(".legal-layout article section").count() >= 3);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/confidentialite`);
  await page.locator(".legal-layout article").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(folder, "privacy-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Mes préférences" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await page.screenshot({ path: path.join(folder, "preferences-mobile.png") });
  await dialog.getByRole("button", { name: "Accepter le suivi facultatif" }).click();
  await page.evaluate((token) => localStorage.setItem("ktgame-token", token), other.token);
  await page.goto(`${base}/shop?secret=answer-42&password=not-collected`);
  await page.bringToFront();
  await page.waitForRequest((request) => request.url().endsWith("/api/me/activity") && request.postDataJSON()?.page === "shop", { timeout: 40000 });
  const sent = activityRequests.findLast((request) => request.postDataJSON()?.page === "shop").postDataJSON();
  assert.deepEqual(sent.markers, ["secret:answer-42"]);
  assert.ok(!JSON.stringify(sent).includes("not-collected"));
  await page.getByRole("button", { name: "Packs", exact: true }).click();
  await page.locator(".pack-theme-tabs").getByRole("button", { name: /Soirée Néon/ }).waitFor();
  await page.getByRole("button", { name: "Mes préférences" }).click();
  const revoked = page.waitForResponse((response) => response.url().endsWith("/api/me/privacy") && response.request().postDataJSON().enabled === false);
  await page.getByRole("dialog").getByRole("button", { name: "Refuser le suivi facultatif" }).click();
  await revoked;
  await api("/me/activity", other.token, { page: "shop" }, "POST", 403);
  await page.evaluate(() => localStorage.removeItem("ktgame-token"));
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "Inscription", exact: true }).click();
  await page.getByLabel("Tranche d'âge").selectOption("under13");
  await page.getByLabel("Code remis au parent").waitFor();
  await page.screenshot({ path: path.join(folder, "parental-enrollment-mobile.png"), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.evaluate((token) => localStorage.setItem("ktgame-token", token), owner.token);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/table/${midnightTable.code}`);
  const mandateDialog = page.getByRole("dialog", { name: "Choisis ton mandat" });
  const mandatePanel = mandateDialog.locator(".midnight-codex-panel");
  await mandateDialog.waitFor();
  assert.equal(await mandateDialog.evaluate((element) => element.parentElement?.parentElement === document.body), true, "the selector is portaled outside the game table");
  assert.equal(await page.locator(".midnight-table .midnight-codex-panel").count(), 0);
  assert.equal(await page.locator(".midnight-contract-dialog-layer").evaluate((element) => getComputedStyle(element).position), "fixed");
  assert.equal(await page.locator(".game-log-center").evaluate((element) => getComputedStyle(element).visibility), "hidden");
  assert.equal(await mandatePanel.locator(".midnight-codex-groups article").count(), 12);
  assert.equal(await mandatePanel.getByRole("button", { name: "Choisir", exact: true }).count(), 4);
  await page.screenshot({ path: path.join(folder, "midnight-contracts-page-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(folder, "midnight-contracts-page-mobile.png") });
  await mandatePanel.getByRole("button", { name: "Choisir", exact: true }).first().click();
  await mandatePanel.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/admin`);
  await page.locator(".admin-nav").getByRole("button", { name: /Succès/ }).click();
  await page.getByRole("button", { name: "Créer un succès" }).click();
  const wizard = page.locator(".achievement-wizard");
  await wizard.getByRole("radio", { name: /Visiter une page/ }).check();
  await wizard.getByRole("button", { name: "Continuer" }).click();
  await wizard.getByLabel("Page a visiter").selectOption("shop");
  await wizard.getByRole("button", { name: "Choisir un objet a porter", exact: true }).click();
  const items = page.getByRole("dialog", { name: "Choisir un objet a porter", exact: true });
  await items.getByRole("searchbox").fill(item.id);
  await items.locator(".achievement-picker-option").first().click();
  await items.getByRole("button", { name: "Appliquer la selection" }).click();
  await wizard.getByLabel("Indice dans le lien (facultatif)").fill("answer-42");
  await page.screenshot({ path: path.join(folder, "visit-wizard-desktop.png") });
  await wizard.getByRole("button", { name: "Continuer" }).click();
  await wizard.getByLabel("Nom du succès").fill("Guide de navigation");
  await wizard.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await wizard.waitFor({ state: "detached" });
  const admin = await api("/admin", owner.token);
  assert.ok(admin.achievements.some((row) => row.title === "Guide de navigation" && row.rule.event === "site.visit"));
  await page.locator(".admin-nav").getByRole("button", { name: "Paramètres" }).click();
  await page.locator(".parental-admin").scrollIntoViewIfNeeded();
  await page.locator(".parental-admin").getByLabel("Référence du dossier").fill("UI-CASE-1");
  await page.locator(".parental-admin").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Délivrer un code valable 72 h" }).click();
  await page.locator(".parental-code code").waitFor();
  await page.screenshot({ path: path.join(folder, "parental-admin-desktop.png") });
  await page.locator(".admin-nav").getByRole("button", { name: /Jeux/ }).click();
  await page.locator(".admin-table tbody tr").filter({ hasText: "farkle" }).getByRole("button", { name: /Modifier/ }).click();
  const defaultsPanel = page.locator(".game-default-settings");
  assert.equal(await defaultsPanel.getByLabel("Objectif de points", { exact: true }).inputValue(), "15000");
  await defaultsPanel.getByLabel("Objectif de points", { exact: true }).fill("12000");
  await page.screenshot({ path: path.join(folder, "game-defaults-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(folder, "game-defaults-mobile.png") });
  await page.locator(".admin-editor").getByRole("button", { name: /Enregistrer/ }).click();
  await page.locator(".admin-editor").waitFor({ state: "hidden" });
  const newFarkle = await api("/rooms", owner.token, { gameId: "farkle" });
  assert.equal(newFarkle.gameModifiers.targetScore, 12000);
  assert.deepEqual(errors, []);
  console.log(`Privacy integration and desktop/mobile checks passed. Screenshots: ${folder}`);
} finally {
  await browser?.close();
  for (const child of children.reverse()) { if (child.exitCode !== null || child.signalCode !== null) continue; const exited = once(child, "exit"); child.kill(); await exited; }
}
