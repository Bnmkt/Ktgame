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
const folder = mkdtempSync(path.join(tmpdir(), "ktga-rooms-events-"));
const database = path.join(folder, "test.sqlite");
const db = new DatabaseSync(database);
db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('legacy-json-migrated','true');");
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
  start([path.join(root, "server/src/index.js")], folder, { NODE_ENV: "test", PORT: String(apiPort), HOST: "127.0.0.1", SQLITE_PATH: database, REQUEST_LOG_PATH: path.join(folder, "logs.sqlite"), JWT_SECRET: "isolated-test-only-secret", APP_BASE_PATH: "/ktga", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", CLIENT_DIST: "", CLIENT_ORIGIN: `http://127.0.0.1:${clientPort}`, API_RATE_LIMIT_MAX: "10000", AUTH_RATE_LIMIT_MAX: "100" });
  await waitFor(`${apiRoot}/api/health`);
  start([path.join(root, "client/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], path.join(root, "client"), { VITE_BASE_PATH: "/ktga/", VITE_API_URL: apiRoot, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_PATH: "/ktga/socket.io" });
  await waitFor(`${base}/`);
  const owner = await api("/auth/register", null, { pseudo: "bnmkt", password: "test-password", ageBand: "13plus", termsVersion: "2026-09-27" });
  const player = await api("/auth/register", null, { pseudo: "Camille", password: "test-password", ageBand: "13plus", termsVersion: "2026-09-27" });
  const offline = await api("/auth/register", null, { pseudo: "Alex", password: "test-password", ageBand: "13plus", termsVersion: "2026-09-27" });
  const initialAdmin = await api("/admin", owner.token);
  const updatedSettings = await api("/admin/settings", owner.token, { siteIcon: "crown" }, "PATCH");
  assert.equal(updatedSettings.siteIcon, "crown");
  assert.equal(updatedSettings.pokerDefaultBigBlind, initialAdmin.settings.pokerDefaultBigBlind);
  const texas = initialAdmin.games.find((game) => game.id === "texas-holdem");
  await api("/admin/games/texas-holdem", owner.token, { ...texas, minPokerBuyIn: 2000, pokerDefaultBigBlind: 40, pokerTurnSeconds: 180 }, "PATCH");
  const configuredAdmin = await api("/admin", owner.token);
  const configuredTexas = configuredAdmin.games.find((game) => game.id === "texas-holdem");
  assert.equal(configuredTexas.minPokerBuyIn, 2000);
  assert.equal(configuredTexas.pokerDefaultBigBlind, 40);
  assert.equal(configuredTexas.pokerTurnSeconds, 180);
  for (const target of [player, offline]) { await api("/friends/request", owner.token, { userId: target.user.id }); await api(`/friends/${owner.user.id}/accept`, target.token, {}); }
  const room = await api("/rooms", owner.token, { gameId: "yahtzee", stake: 10, name: "Table de test", isPublic: true, password: "room-password" });
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  async function newPage(account) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript((token) => localStorage.setItem("ktgame-token", token), account.token);
    const page = await context.newPage(); page.on("pageerror", (err) => errors.push(err.message)); return page;
  }
  const host = await newPage(owner); const guest = await newPage(player);
  await host.goto(`${base}/table/${room.code}`); await host.locator(".room-table-tools").waitFor();
  await guest.goto(`${base}/`);
  assert.equal(await guest.getByText("Salon de jeux", { exact: true }).count(), 0);
  await guest.getByRole("button", { name: "Rejoindre avec un code", exact: true }).click();
  const join = guest.getByRole("dialog", { name: "Rejoindre avec un code" });
  assert.equal(await join.locator('input[type="password"]').count(), 0);
  await join.getByLabel("Code de la table").fill(room.code);
  await join.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await join.getByLabel("Mot de passe de la table").fill("room-password");
  await join.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await guest.locator(".room-table-tools").waitFor();
  await guest.getByRole("button", { name: "Je suis prêt", exact: true }).click();
  await host.getByRole("button", { name: "Démarrer la partie", exact: true }).click();
  await host.getByRole("heading", { name: "Manche en cours" }).waitFor();
  const rollButton = host.locator('button[data-request-feedback="state"]').filter({ hasText: "Lancer" }).first();
  await rollButton.waitFor();
  await host.route("**/api/rooms/*/action", async (route) => { await new Promise((resolve) => setTimeout(resolve, 350)); await route.continue(); }, { times: 1 });
  const firstRollResponse = host.waitForResponse((response) => response.url().includes(`/api/rooms/${room.code}/action`) && response.request().method() === "POST");
  await rollButton.click();
  await host.waitForTimeout(80);
  assert.equal(await rollButton.isDisabled(), true);
  assert.equal(await rollButton.evaluate((button) => button.classList.contains("roll-cooldown")), true);
  await firstRollResponse;
  await host.waitForFunction((button) => !button.disabled, await rollButton.elementHandle());
  assert.equal(await rollButton.evaluate((button) => button.classList.contains("roll-cooldown")), false);
  const rerollResponse = host.waitForResponse((response) => response.url().includes(`/api/rooms/${room.code}/action`) && response.request().method() === "POST");
  await rollButton.click();
  await rerollResponse;
  await host.waitForFunction((button) => !button.disabled, await rollButton.elementHandle());
  await host.waitForTimeout(750);
  const continuousAnimations = await host.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations === Infinity).map((animation) => animation.animationName));
  assert.deepEqual(continuousAnimations, []);
  await host.getByRole("button", { name: "Plein écran", exact: true }).click();
  await host.locator(".room-app-shell.table-fullscreen").waitFor();
  assert.deepEqual(await host.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations === Infinity).map((animation) => animation.animationName)), []);
  await host.screenshot({ path: path.join(folder, "room-performance-fullscreen.png") });
  await host.getByRole("button", { name: "Réduire", exact: true }).click();
  await host.getByRole("navigation", { name: "Navigation du casino" }).getByRole("button", { name: "Amis", exact: true }).click();
  const friends = host.getByRole("dialog", { name: "Amis", exact: true });
  await friends.getByRole("button", { name: "Rejoindre Camille", exact: true }).waitFor();
  assert.equal(await friends.getByRole("button", { name: "Rejoindre Camille", exact: true }).isEnabled(), true);
  assert.equal(await friends.getByRole("button", { name: "Rejoindre Alex", exact: true }).isEnabled(), false);
  await friends.getByRole("button", { name: "Rejoindre Camille", exact: true }).click();
  const friendJoin = host.getByRole("dialog", { name: "Rejoindre avec un code" });
  assert.equal(await friendJoin.getByLabel("Code de la table").inputValue(), room.code);
  await friendJoin.getByRole("button", { name: "Annuler", exact: true }).click();
  await friends.getByRole("button", { name: "Retirer Camille", exact: true }).click();
  await host.getByRole("dialog", { name: "Retirer cet ami ?" }).getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal((await api("/friends", owner.token)).friends.length, 2);
  await host.screenshot({ path: path.join(folder, "friends.png") });
  await friends.getByRole("button", { name: "Fermer", exact: true }).click();
  await host.getByTitle("Exclure ce joueur", { exact: true }).click();
  let confirm = host.getByRole("dialog", { name: "Exclure ce joueur ?" });
  assert.match(await confirm.innerText(), /manche est en cours/);
  await confirm.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal((await api(`/rooms/${room.code}`, owner.token)).players.length, 2);
  await host.getByTitle("Exclure ce joueur", { exact: true }).click();
  await confirm.getByRole("button", { name: "Exclure", exact: true }).click();
  await guest.getByRole("dialog", { name: "Vous avez été exclu", exact: true }).waitFor();
  await guest.screenshot({ path: path.join(folder, "excluded.png") });
  assert.equal((await api("/notifications", player.token)).filter((row) => row.type === "room-exclusion").length, 1);
  assert.equal((await api("/notifications", owner.token)).filter((row) => row.type === "room-exclusion").length, 0);
  assert.equal((await api("/friends", owner.token)).friends.find((row) => row.id === player.user.id).activeRoom, null);
  await guest.getByRole("button", { name: "J’ai compris", exact: true }).click();
  await host.getByRole("navigation", { name: "Navigation du casino" }).getByRole("button", { name: "Amis", exact: true }).click();
  await friends.getByRole("button", { name: "Retirer Alex", exact: true }).click();
  await host.getByRole("dialog", { name: "Retirer cet ami ?" }).getByRole("button", { name: "Retirer", exact: true }).click();
  await friends.getByRole("button", { name: "Retirer Alex", exact: true }).waitFor({ state: "detached" });
  assert.equal((await api("/friends", owner.token)).friends.length, 1);
  assert.equal((await api("/friends", offline.token)).friends.length, 0);
  await friends.getByRole("button", { name: "Fermer", exact: true }).click();
  await host.goto(`${base}/admin`);
  const adminNav = host.getByRole("navigation", { name: "Sections d'administration" });
  assert.equal(await adminNav.getByRole("button", { name: "Metrics", exact: true }).count(), 0);
  await adminNav.getByRole("button", { name: "Paramètres", exact: true }).click();
  await host.getByRole("heading", { name: "Paramètres du casino", exact: true }).waitFor();
  await host.screenshot({ path: path.join(folder, "casino-settings-identity.png"), fullPage: true });
  await host.getByRole("button", { name: "Économie et bonus", exact: true }).click();
  assert.equal(await host.locator(".bonus-rule-list > article").count(), 3);
  assert.equal(await host.locator(".bonus-line-chart polyline").count(), 1);
  assert.ok(await host.locator(".bonus-line-chart circle.tier-point").count() > 3);
  await host.locator("label").filter({ hasText: "Multiplicateur maximal" }).locator("input").fill("12");
  await host.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await host.getByText("Paramètres du casino enregistrés.", { exact: true }).waitFor();
  assert.equal((await api("/admin", owner.token)).settings.dailyBonusMaxMultiplier, 12);
  await host.screenshot({ path: path.join(folder, "casino-settings-bonus.png"), fullPage: true });
  await host.setViewportSize({ width: 390, height: 844 });
  assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await host.screenshot({ path: path.join(folder, "casino-settings-bonus-mobile.png"), fullPage: true });
  await host.setViewportSize({ width: 1440, height: 1000 });
  await adminNav.getByRole("button", { name: "Santé serveur", exact: true }).click();
  await host.getByRole("navigation", { name: "Santé serveur", exact: true }).getByRole("button", { name: "Metrics", exact: true }).click();
  await host.getByRole("heading", { name: "Metrics", exact: true }).waitFor();
  for (const type of ["dice", "cards"]) {
    const created = await api("/admin/community-events", owner.token, {});
    const draft = created.event;
    draft.internalName = `Combinaisons ${type}`;
    draft.game.type = type; draft.participation.entryCost = 0; draft.participation.potContributionValue = 0;
    if (type === "dice") draft.game.dice.count = 6;
    draft.game.cards.suitEffects.hearts = [{ type: "tokens", value: 2, target: "player", label: "Prime cœur" }];
    draft.actions.allowPurchase = false;
    await api(`/admin/community-events/${draft.id}`, owner.token, draft, "PATCH");
    await host.goto(`${base}/admin`);
    await adminNav.getByRole("button", { name: "Événements", exact: true }).click();
    await host.locator(".event-admin-card").filter({ has: host.getByRole("heading", { name: draft.internalName, exact: true }) }).getByRole("button", { name: "Configurer", exact: true }).click();
    await host.locator(".event-editor-tabs").getByRole("button", { name: "Jeu & effets", exact: true }).click();
    const combinations = host.locator(".event-combinations");
    await combinations.getByRole("button", { name: "Combinaison", exact: true }).click();
    const combination = combinations.locator(".event-combination").last();
    await combination.getByLabel("Nom", { exact: true }).fill(type === "dice" ? "421 inclus" : "Deux As dont un cœur");
    if (type === "dice") {
      await combination.getByLabel("Dé 1", { exact: true }).selectOption("4");
      await combination.getByRole("button", { name: "Ajouter un dé", exact: true }).click();
      await combination.getByLabel("Dé 2", { exact: true }).selectOption("2");
      await combination.getByRole("button", { name: "Ajouter un dé", exact: true }).click();
      await combination.getByLabel("Dé 3", { exact: true }).selectOption("1");
    } else {
      await combination.getByRole("button", { name: "Ajouter une carte", exact: true }).click();
      await combination.getByLabel("Enseigne 2", { exact: true }).selectOption("hearts");
      await combination.getByLabel("Enseigne 1", { exact: true }).selectOption("hearts");
      assert.match(await combination.getByRole("alert").innerText(), /exemplaires/);
      await combination.getByLabel("Enseigne 1", { exact: true }).selectOption("any");
    }
    await combination.getByLabel("Condition", { exact: true }).selectOption(type === "dice" ? "customValues" : "exactCards");
    assert.match(await combination.getByRole("alert").innerText(), /Combinaison impossible/);
    await combination.getByLabel("Condition", { exact: true }).selectOption(type === "dice" ? "containsValues" : "containsCards");
    assert.equal(await combination.getByRole("alert").count(), 0);
    await combination.getByRole("button", { name: "Ajouter un effet", exact: true }).click();
    await combination.locator(".event-effect-row select").first().selectOption("tokens");
    await combination.getByLabel("Valeur", { exact: true }).fill("17");
    await combination.scrollIntoViewIfNeeded();
    await host.screenshot({ path: path.join(folder, `combination-${type}.png`) });
    await host.setViewportSize({ width: 390, height: 844 });
    await combination.locator(".combination-values").scrollIntoViewIfNeeded();
    await host.screenshot({ path: path.join(folder, `combination-${type}-mobile.png`) });
    assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const control of await combination.locator(".combination-values select").all()) {
      const bounds = await control.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    }
    await host.setViewportSize({ width: 1440, height: 1000 });
    const savedResponse = host.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/community-events/${draft.id}`));
    await host.locator(".event-editor-footer").getByRole("button", { name: "Enregistrer", exact: true }).click();
    assert.equal((await savedResponse).status(), 200);
    const saved = (await api(`/admin/community-events/${draft.id}`, owner.token)).event.game[type].combinations.at(-1);
    assert.deepEqual(type === "dice" ? saved.condition.values : saved.condition.cards, type === "dice" ? [4, 2, 1] : [{ rank: "A", suit: "any" }, { rank: "A", suit: "hearts" }]);
    assert.equal(saved.effects[0].value, 17);
    await host.locator(".event-editor-footer").getByRole("button", { name: "Fermer", exact: true }).click();
    await host.locator(".event-admin-card").filter({ has: host.getByRole("heading", { name: draft.internalName, exact: true }) }).getByRole("button", { name: "Configurer", exact: true }).click();
    await host.locator(".event-editor-tabs").getByRole("button", { name: "Jeu & effets", exact: true }).click();
    assert.equal(await combination.getByLabel("Condition", { exact: true }).inputValue(), type === "dice" ? "containsValues" : "containsCards");
    assert.equal(await combination.locator(".combination-value").count(), type === "dice" ? 3 : 2);
    await api(`/admin/community-events/${draft.id}/status`, owner.token, { status: "active" });
    await host.goto(`${base}/evenement/${draft.slug}`);
    await host.getByRole("button", { name: "Participer", exact: true }).click();
    await host.locator(".event-primary-action").click();
    await host.locator(".event-draw-scores").waitFor();
    const stage = host.locator(type === "dice" ? ".event-action-card .dice-throw-tray" : ".event-card-table");
    assert.ok((await host.locator(".event-primary-action").boundingBox()).y < (await stage.boundingBox()).y);
    assert.ok((await stage.boundingBox()).width > 700);
    const wallet = host.locator(".casino-wallet");
    assert.ok(!(await wallet.innerText()).includes("jetons"));
    assert.ok((await wallet.locator("svg").boundingBox()).x > (await wallet.locator(".compact-number").boundingBox()).x);
    assert.ok(await host.locator(".event-rules-card .event-effect-rules li").count() > 0);
    await stage.scrollIntoViewIfNeeded(); await host.screenshot({ path: path.join(folder, `event-${type}.png`) });
    await host.getByRole("button", { name: "Voir les calculs", exact: true }).click();
    assert.ok(await host.locator(".event-calculation-modal .event-effect-rules li").count() > 0);
    await host.getByRole("button", { name: "J’ai compris", exact: true }).click();
    await host.locator(".event-ranking-card").screenshot({ path: path.join(folder, `ranking-${type}.png`) });
    await host.setViewportSize({ width: 390, height: 844 });
    await stage.scrollIntoViewIfNeeded(); await host.screenshot({ path: path.join(folder, `event-${type}-mobile.png`) });
    assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await host.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: folder, checks: ["protected-room", "live-friend-presence", "friend-delete-confirmation", "in-game-exclusion", "recipient-only-notification", "casino-settings", "admin-metrics-tab", "event-rules", "dice-card-stages", "dice-card-combination-editor", "combination-persistence", "mobile"] }));
} catch (error) {
  for (const [index, context] of (browser?.contexts() ?? []).entries()) {
    const page = context.pages()[0];
    if (page) { await page.screenshot({ path: path.join(folder, `failure-${index}.png`) }).catch(() => {}); console.error((await page.locator(".event-combinations").allTextContents()).join("\n").slice(0, 2000)); }
  }
  console.error(processes.map((child) => child.diagnostics().slice(-2500)).join("\n"));
  throw error;
} finally {
  await browser?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) { const stopped = once(child, "exit"); child.kill(); await stopped; }
}
