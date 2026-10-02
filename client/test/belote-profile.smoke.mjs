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
const folder = mkdtempSync(path.join(tmpdir(), "ktga-belote-profile-"));
const database = path.join(folder, "test.sqlite");
const db = new DatabaseSync(database);
db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('legacy-json-migrated','true');"); db.close();
async function freePort() { const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening"); const port = socket.address().port; await new Promise((resolve) => socket.close(resolve)); return port; }
const apiPort = await freePort(), clientPort = await freePort();
const apiRoot = `http://127.0.0.1:${apiPort}/ktga`, base = `http://127.0.0.1:${clientPort}/ktga`;
const processes = [], errors = [];
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, RATE_LIMIT_MAX: "10000", ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; child.stdout.on("data", (data) => { log += data; }); child.stderr.on("data", (data) => { log += data; });
  child.diagnostics = () => log; processes.push(child);
}
async function waitFor(url) { for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 150)); } throw new Error(`Timeout ${url}`); }
async function api(endpoint, token, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${apiRoot}/api${endpoint}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.ok(response.ok, `${method} ${endpoint}: ${JSON.stringify(data)}`); return data;
}
let browser, page, publicPage;
try {
  start([path.join(root, "server/src/index.js")], folder, { NODE_ENV: "test", TEST_ADMIN_EMAIL: "bnmkt@tests.invalid", PORT: String(apiPort), HOST: "127.0.0.1", SQLITE_PATH: database, REQUEST_LOG_PATH: path.join(folder, "logs.sqlite"), JWT_SECRET: "isolated-test-only-secret", APP_BASE_PATH: "/ktga", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", CLIENT_DIST: "", CLIENT_ORIGIN: `http://127.0.0.1:${clientPort}`, API_RATE_LIMIT_MAX: "10000", AUTH_RATE_LIMIT_MAX: "100" });
  await waitFor(`${apiRoot}/api/health`);
  start([path.join(root, "client/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], path.join(root, "client"), { VITE_BASE_PATH: "/ktga/", VITE_API_URL: apiRoot, VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`, VITE_SOCKET_PATH: "/ktga/socket.io" });
  await waitFor(`${base}/`);
  const owner = await api("/auth/register", null, { email: "bnmkt@tests.invalid", pseudo: "bnmkt", password: "test-password", birthDate: "1990-01-01", termsVersion: "2026-09-27" });
  const guest = await api("/auth/register", null, { email: "camille@tests.invalid", pseudo: "Camille", password: "test-password", birthDate: "1990-01-01", termsVersion: "2026-09-27" });
  const legacy = await api("/me", owner.token, { memberCardStats: ["overallWinRate", "achievementsUnlocked"] }, "PATCH");
  assert.deepEqual(legacy.profileStats.memberCardStats, ["winRate", "achievementsUnlocked"]);
  let room = await api("/rooms", owner.token, { gameId: "belote", stake: 10, name: "Belote belge", isPublic: true });
  assert.equal(room.gameModifiers.frenchRules, false);
  for (let i = 0; i < 3; i++) room = await api(`/rooms/${room.code}/bot`, owner.token, {});
  room = await api(`/rooms/${room.code}/game-settings`, owner.token, { targetScore: 21 });
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript((token) => localStorage.setItem("ktgame-token", token), owner.token);
  page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/table/${room.code}`);
  await page.getByLabel("Équipe de Bot 2", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Je suis prêt", exact: true }).click();
  room = await api(`/rooms/${room.code}`, owner.token);
  assert.equal(room.beloteSeats.indexOf(room.players.find((player) => player.pseudo === "Bot 2").id) % 2, 1);
  await page.locator(".belote-team-picker").screenshot({ path: path.join(folder, "team-picker.png") });
  await page.getByRole("button", { name: "Démarrer la partie", exact: true }).click();
  await page.locator(".belote-bidding").waitFor();
  await page.locator(".belote-board").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(folder, "belote-bid.png") });
  const taken = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/action"));
  await page.locator(".belote-bid-actions button").first().click();
  room = await (await taken).json();
  await page.locator(".belote-playable").first().waitFor();
  assert.equal(await page.locator(".belote-hand button:enabled").count(), room.state.legalCards.length);
  assert.ok(room.state.hands[room.players[1].id].every((card) => card === null));
  const spectator = await api(`/rooms/${room.code}`, guest.token);
  assert.ok(Object.values(spectator.state.hands).flat().every((card) => card === null));
  assert.equal(spectator.spectator, true); assert.equal(spectator.state.deck, undefined);
  const spectatorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await spectatorContext.addInitScript((token) => localStorage.setItem("ktgame-token", token), guest.token);
  const watcher = await spectatorContext.newPage(); watcher.on("pageerror", (err) => errors.push(err.message));
  await watcher.goto(`${base}/table/${room.code}`);
  await watcher.locator(".belote-table").waitFor();
  assert.equal(await watcher.locator(".belote-hand button, .belote-bid-actions button").count(), 0);
  const forbidden = await fetch(`${apiRoot}/api/rooms/${room.code}/action`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${guest.token}` }, body: JSON.stringify({ type: "play", card: room.state.legalCards[0] }) });
  assert.equal(forbidden.status, 403);
  await watcher.locator(".belote-table").screenshot({ path: path.join(folder, "spectator-belote.png") });
  await watcher.setViewportSize({ width: 390, height: 844 });
  await watcher.locator(".belote-table").scrollIntoViewIfNeeded();
  await watcher.screenshot({ path: path.join(folder, "spectator-mobile.png") });
  assert.ok(await watcher.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(folder, "belote-play.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".belote-hand").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(folder, "belote-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  for (const button of await page.locator(".belote-hand button").all()) {
    const bounds = await button.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  let actions = 0;
  while (!room.state.finished && actions++ < 500) {
    const state = room.state;
    assert.equal(state.players[state.currentPlayerIndex].id, owner.user.id);
    const action = state.phase === "round-end" ? { type: "next-deal" } : ["bid", "forced-bid"].includes(state.phase) ? { type: "take", suit: state.phase === "forced-bid" || state.bidRound === 1 ? state.turnedCard.suit : ["S", "H", "D", "C"].find((suit) => suit !== state.turnedCard.suit) } : { type: "play", card: state.legalCards[0] };
    room = await api(`/rooms/${room.code}/action`, owner.token, action);
    if (actions === 1) {
      await watcher.locator(".belote-trick-card").first().waitFor();
      await watcher.locator(".belote-table").screenshot({ path: path.join(folder, "spectator-trick-mobile.png"), animations: "disabled" });
      for (const card of await watcher.locator(".belote-trick-card .playing-card").all()) {
        const bounds = await card.boundingBox(); assert.ok(bounds.width >= 40 && bounds.height >= 50);
      }
      await watcher.setViewportSize({ width: 1440, height: 1000 });
      await watcher.locator(".belote-table").screenshot({ path: path.join(folder, "spectator-trick-desktop.png"), animations: "disabled" });
    }
  }
  assert.equal(room.state.finished, true); assert.equal(room.state.winners.length, 2);
  const beloteRecords = await api("/leaderboards?game=belote&metric=score&period=all", owner.token);
  const ownerSeat = room.state.players.findIndex((player) => player.id === owner.user.id);
  assert.equal(beloteRecords.rows.find((row) => row.id === owner.user.id).value, room.state.teamScores[ownerSeat % 2]);
  await watcher.getByText("Partie terminée", { exact: true }).waitFor();
  assert.equal(room.state.roomPayouts[owner.user.id], 10);
  room = await api(`/rooms/${room.code}/replay`, owner.token, {});
  assert.ok(!room.state); assert.equal(room.players.length, 4);
  await watcher.getByRole("heading", { name: "En salle d'attente", exact: true }).waitFor();
  const bot = room.players.find((player) => player.isBot);
  await api(`/rooms/${room.code}/kick`, owner.token, { playerId: bot.id });
  await watcher.getByRole("button", { name: "Rejoindre la table", exact: true }).click();
  await watcher.locator(".belote-team-picker").waitFor();
  assert.equal((await api(`/rooms/${room.code}`, guest.token)).spectator, false);
  await spectatorContext.close();
  await api(`/rooms/${room.code}/ready`, guest.token, { ready: true });
  room = await api(`/rooms/${room.code}/start`, owner.token, {});
  const oldSeat = room.state.players.findIndex((player) => player.id === guest.user.id);
  room = await api(`/rooms/${room.code}/kick`, owner.token, { playerId: guest.user.id });
  assert.equal(room.state.players.length, 4); assert.ok(room.state.players[oldSeat].isBot);
  assert.ok(!room.state.players.some((player) => player.id === guest.user.id));
  assert.equal(room.state.players[room.state.currentPlayerIndex].id, owner.user.id);

  await page.goto(`${base}/profil`);
  await page.getByRole("button", { name: "Affichage du profil", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Statistique 1", exact: true }).waitFor();
  assert.equal(await page.getByRole("radiogroup", { name: "Statistique 1", exact: true }).getByRole("radio", { name: "Taux de victoire", exact: true }).count(), 1);
  assert.equal(await page.getByRole("radio", { name: "Taux victoire/partie", exact: true }).count(), 0);
  await page.route(`**/api/users/${owner.user.id}/public`, async (route) => {
    const response = await route.fetch(); const data = await response.json();
    data.activity = data.activity.map((row, index) => ({ ...row, count: index % 5 === 0 ? 17 : index % 3 }));
    await route.fulfill({ response, json: data });
  });
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("ktga-public-profile", { detail: id })), owner.user.id);
  const chart = page.locator(".public-profile-modal .activity-card");
  await chart.getByRole("button", { name: "Semaine", exact: true }).click();
  assert.equal(await chart.locator(".activity-point").count(), 7);
  assert.equal(await chart.locator(".activity-line").count(), 1);
  assert.equal(await chart.locator(".activity-bar").count(), 0);
  assert.ok(await chart.locator(".activity-grid-line").count() > 1);
  assert.ok(await chart.locator(".activity-value-label").count() > 0);
  await chart.locator(".activity-point-target").last().focus();
  assert.match(await chart.locator('[aria-live="polite"]').innerText(), /partie\(s\)/i);
  await chart.screenshot({ path: path.join(folder, "profile-week.png") });
  await chart.getByRole("button", { name: "Année", exact: true }).click();
  assert.equal(await chart.locator(".activity-point").count(), 365);
  await chart.screenshot({ path: path.join(folder, "profile-year.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await chart.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(folder, "profile-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const chartBounds = await chart.boundingBox();
  for (const button of await chart.locator(".range-tabs button").all()) {
    const bounds = await button.boundingBox(); assert.ok(bounds.x >= chartBounds.x && bounds.x + bounds.width <= chartBounds.x + chartBounds.width);
  }
  const plot = await chart.locator(".activity-plot").boundingBox();
  assert.ok(plot.x + plot.width <= chartBounds.x + chartBounds.width);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(`**/api/users/${guest.user.id}/public`, async (route) => {
    const response = await route.fetch(); const data = await response.json(); data.activity = [];
    await route.fulfill({ response, json: data });
  });
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("ktga-public-profile", { detail: id })), guest.user.id);
  await page.locator(".public-profile-modal").getByRole("heading", { name: "Profil de Camille", exact: true }).waitFor();
  assert.equal(await chart.locator(".activity-point").count(), 0);
  await page.goto(`${base}/admin`);
  await page.getByRole("navigation", { name: "Sections d'administration" }).getByRole("button", { name: "Santé serveur", exact: true }).click();
  await page.locator(".health-chart-card").first().waitFor();
  const cpu = page.locator(".health-chart-card").filter({ hasText: "CPU" });
  assert.match(await cpu.innerText(), /Maximum : 100 %/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const tops = await page.locator(".health-subtabs button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    assert.ok(Math.max(...tops) - Math.min(...tops) < 2);
    await page.locator(".health-subtabs").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(folder, `health-${width}.png`) });
  }
  await api(`/admin/users/${owner.user.id}`, owner.token, { tokens: 1000000 }, "PATCH");
  const publicContext = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await publicContext.addInitScript((token) => localStorage.setItem("ktgame-token", token), guest.token);
  publicPage = await publicContext.newPage();
  publicPage.on("pageerror", (error) => errors.push(error.message));
  const catalog = await api("/games", guest.token);
  const guestBalance = (await api("/me", guest.token)).tokens;
  let diceTable;
  for (const game of catalog) {
    let table = await api("/rooms", owner.token, { gameId: game.id, stake: game.id === "texas-holdem" ? 1000 : 10, isPublic: true });
    for (let index = 1; index < game.minPlayers; index++) table = await api(`/rooms/${table.code}/bot`, owner.token, {});
    table = await api(`/rooms/${table.code}/start`, owner.token, {});
    if (game.id === "blackjack") table = await api(`/rooms/${table.code}/action`, owner.token, { type: "bet", amount: 50 });
    const view = await api(`/rooms/${table.code}/join`, guest.token, {});
    assert.equal(view.spectator, true, game.id);
    assert.equal(view.state.deck, undefined); assert.equal(view.state.stock, undefined);
    assert.ok(Object.values(view.state.hands).flat().every((card) => card === null));
    assert.ok(!view.players.some((player) => player.id === guest.user.id));
    assert.ok((await api("/rooms", guest.token)).some((row) => row.code === table.code && row.inProgress));
    const denied = await fetch(`${apiRoot}/api/rooms/${table.code}/action`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${guest.token}` }, body: JSON.stringify({ type: "bet", amount: 100 }) });
    assert.equal(denied.status, 403, game.id);
    await publicPage.goto(`${base}/table/${table.code}`);
    await publicPage.locator(".spectator-page .board").waitFor();
    await publicPage.getByText(/En direct/).first().waitFor();
    assert.equal(await publicPage.locator(".spectator-board button, .belote-board button, .public-dice-board button").count(), 0);
    if (["yahtzee", "421", "cul-de-chouette", "farkle", "shut-the-box"].includes(game.id)) {
      const rolled = await api(`/rooms/${table.code}/action`, owner.token, { type: "roll", keepIndexes: [] });
      await publicPage.locator(".public-dice-board .pip").first().waitFor();
      const watched = await api(`/rooms/${table.code}`, guest.token);
      assert.deepEqual(watched.state.lastDiceByPlayer, rolled.state.lastDiceByPlayer);
      if (game.id === "yahtzee") {
        diceTable = table;
        assert.equal(await publicPage.locator(".public-dice-choices dt").count(), 13);
        await publicPage.setViewportSize({ width: 390, height: 844 });
        await publicPage.screenshot({ path: path.join(folder, "spectator-dice-mobile.png") });
        assert.ok(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await publicPage.setViewportSize({ width: 1280, height: 960 });
      }
    }
    if (["blackjack", "yahtzee", "texas-holdem", "golf-solitaire"].includes(game.id)) await publicPage.screenshot({ path: path.join(folder, `spectator-${game.id}.png`), animations: "disabled" });
  }
  assert.equal((await api("/me", guest.token)).tokens, guestBalance);
  await publicPage.goto(`${base}/`);
  await publicPage.getByRole("heading", { name: "Jeux disponibles", exact: true }).waitFor();
  assert.equal(await publicPage.locator(".live-room-list button").count(), 0);
  await api("/friends/request", guest.token, { userId: owner.user.id });
  await api(`/friends/${guest.user.id}/accept`, owner.token, {});
  await publicPage.reload();
  await publicPage.locator(".live-room-list button").nth(4).waitFor();
  assert.equal(await publicPage.locator(".live-room-list button").count(), 5);
  await publicPage.locator(".live-room-list button").first().click();
  await publicPage.locator(".spectator-page .board").waitFor();
  await page.goto(`${base}/table/${diceTable.code}`);
  await page.locator(".yahtzee-controls").waitFor();
  await publicPage.getByRole("button", { name: "Amis", exact: true }).click();
  const friendModal = publicPage.getByRole("dialog", { name: "Amis", exact: true });
  await friendModal.getByRole("button", { name: "Rejoindre bnmkt", exact: true }).click();
  await publicPage.getByRole("dialog", { name: "Rejoindre avec un code" }).getByRole("button", { name: "Rejoindre", exact: true }).click();
  await publicPage.locator(".public-dice-board").waitFor();
  assert.match(publicPage.url(), new RegExp(`/observer/${diceTable.code}$`));
  let locked = await api("/rooms", owner.token, { gameId: "blackjack", stake: 10, isPublic: false, password: "secret-table" });
  locked = await api(`/rooms/${locked.code}/start`, owner.token, {});
  const metadata = await api(`/rooms/${locked.code}`, guest.token);
  assert.equal(metadata.accessRequired, true); assert.deepEqual(metadata.state, { gameId: "blackjack" });
  const lockedResponse = await fetch(`${apiRoot}/api/rooms/${locked.code}/join`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${guest.token}` }, body: JSON.stringify({ password: "wrong" }) });
  assert.equal(lockedResponse.status, 403);
  const { io } = await import(pathToFileURL(path.join(root, "client/node_modules/socket.io-client/build/esm-debug/index.js")).href);
  const deniedSocket = io(`http://127.0.0.1:${apiPort}`, { path: "/ktga/socket.io", autoConnect: false });
  try {
    const deniedEvent = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Protected socket did not reject the spectator")), 5000);
      deniedSocket.once("room-error", (payload) => { clearTimeout(timeout); resolve(payload); });
      deniedSocket.once("room", () => { clearTimeout(timeout); reject(new Error("Protected room leaked through socket")); });
    });
    deniedSocket.on("connect", () => deniedSocket.emit("watch-room", { roomId: locked.id, token: guest.token, spectator: true }));
    deniedSocket.connect(); await deniedEvent;
  } finally { deniedSocket.disconnect(); }
  await publicPage.goto(`${base}/table/${locked.code}`);
  await publicPage.getByLabel("Mot de passe de la table").fill("secret-table");
  await publicPage.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await publicPage.locator(".spectator-page .board").waitFor();
  await publicPage.getByText(/En direct/).first().waitFor();
  let invitedRoom = await api("/rooms", owner.token, { gameId: "yahtzee", stake: 10, isPublic: false, password: "invite-password" });
  invitedRoom = await api(`/rooms/${invitedRoom.code}/start`, owner.token, {});
  await api(`/rooms/${invitedRoom.code}/invite`, owner.token, { friendId: guest.user.id });
  const invite = (await api("/friends", guest.token)).roomInvites.find((entry) => entry.code === invitedRoom.code);
  assert.ok(invite);
  const invited = await api(`/room-invites/${invite.id}/accept`, guest.token, {});
  assert.equal(invited.spectator, true);
  assert.equal(invited.players.length, 1);
  assert.equal((await api("/me", guest.token)).tokens, guestBalance);
  await publicContext.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: folder, actions, checks: ["belote-bid-play", "team-selection", "full-game-and-replay", "private-hands", "automatic-spectator-join", "join-after-replay", "all-games-spectator", "public-dice-and-combinations", "friend-tables-max-five", "friend-join-and-invitation", "spectator-no-actions-or-wager", "protected-http-and-socket-access", "seat-replacement", "legacy-winrate", "daily-line-points-and-axis", "365-days", "health-100-percent", "single-row-tabs", "mobile"] }));
} catch (error) {
  await publicPage?.screenshot({ path: path.join(folder, "failure-public.png") }).catch(() => {});
  await page?.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
  console.error(`Screenshots: ${folder}`); console.error(processes.map((child) => child.diagnostics().slice(-1800)).join("\n")); throw error;
} finally {
  await browser?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) { const stopped = once(child, "exit"); child.kill(); await stopped; }
}
