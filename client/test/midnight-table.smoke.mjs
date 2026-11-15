import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Server } from "../../server/node_modules/socket.io/dist/index.js";
import { createMidnightDiceState, applyMidnightDiceAction, midnightContractOffers, midnightDiceBotAction } from "../../server/src/games/engines/midnight-dice.js";
import { publicMidnightOptions } from "../src/features/games/midnightDice/contracts.js";
import { spectatorState } from "../../server/src/games/spectator-state.js";

const root = fileURLToPath(new URL("../../", import.meta.url)), external = createRequire(path.join(process.env.KTGA_BROWSER_TOOLS, "package.json"));
const { chromium } = external("playwright"), { PlaywrightBlocker } = external("@ghostery/adblocker-playwright");
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const players = Array.from({ length: 8 }, (_, index) => ({ id: index ? `p${index}` : "me", pseudo: index ? `Joueur ${index + 1}` : "Bnmkt", tokens: 10000, ready: true, cosmetics: { equipped: { icon: "chip", diceSkin: index ? "default" : "table-inlay" } } }));
let room, revision = 0, origin;
const actions = [], errors = [];
function prepare(count, playing = false) {
  const seated = players.slice(0, count);
  room = { code: "midnight-dice", id: "midnight", gameId: "midnight-dice", name: "La table de Minuit", ownerId: "me", players: seated, maxPlayers: 8, minPlayers: 2, readyPlayerIds: seated.map(player => player.id), finished: false, stake: 100, isPublic: true, activityMatchId: `test-${++revision}`, state: playing ? createMidnightDiceState(seated, { gameModifiers: { rounds: 3, firstPlayer: "first-seat", victory: "midnight", victoryReveal: "end" } }) : null };
}
function payload(viewer) {
  const copy = structuredClone(room);
  if (copy.state) {
    copy.state.contractOffers = midnightContractOffers(copy.state, viewer);
    copy.state.resolvedOptions = publicMidnightOptions(copy.state);
    delete copy.state.privateContractOffers; delete copy.state.contractDrawPiles; delete copy.state.contractDrawPile;
    copy.state.secretContracts = Object.fromEntries(copy.state.players.map(player => [player.id, player.id === viewer ? copy.state.secretContracts[player.id] ?? null : null]));
    copy.state.usedContracts = Object.fromEntries(copy.state.players.map(player => [player.id, player.id === viewer ? copy.state.usedContracts[player.id] : []]));
  }
  return copy;
}
const service = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", origin ?? "*"); response.setHeader("Access-Control-Allow-Credentials", "true"); response.setHeader("Access-Control-Allow-Headers", "authorization,content-type"); response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const pathname = new URL(request.url, "http://localhost").pathname, viewer = request.headers.authorization?.replace("Bearer ", "") ?? "me";
  const reply = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
  if (pathname.endsWith("/start")) { room.state = createMidnightDiceState(room.players, { gameModifiers: { rounds: 3, firstPlayer: "first-seat", victory: "midnight", victoryReveal: "end" } }); room.activityMatchId = `test-${++revision}`; broadcast(); return reply(payload(viewer)); }
  if (pathname.endsWith("/action")) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const action = JSON.parse(Buffer.concat(chunks)); actions.push({ viewer, action });
    try { applyMidnightDiceAction(room.state, viewer, action); broadcast(); return reply(payload(viewer)); }
    catch (failure) { return reply({ error: failure.message }, 400); }
  }
  if (pathname.startsWith("/api/rooms/")) return reply(payload(viewer));
  if (pathname === "/api/me") return reply(players.find(player => player.id === viewer));
  if (pathname === "/api/friends") return reply({ friends: [] });
  return reply({ messages: {} });
});
const realtime = new Server(service, { cors: { origin: true, credentials: true } });
realtime.on("connection", socket => socket.on("watch-room", ({ token }) => { socket.data.viewer = token; }));
function broadcast() { for (const socket of realtime.sockets.sockets.values()) socket.emit("room", payload(socket.data.viewer)); }
await new Promise(resolve => service.listen(0, "127.0.0.1", resolve)); const api = `http://127.0.0.1:${service.address().port}`;
const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); origin = `http://127.0.0.1:${port}`;
const output = path.join(root, "docs/previews/midnight-physical-20261115", String(Date.now())); fs.mkdirSync(output, { recursive: true });
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, stdio: "ignore", env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: api, VITE_SOCKET_URL: api, VITE_SOCKET_PATH: "/socket.io" } });
const until = async (check, label) => { for (let i = 0; i < 150; i++) { try { if (await check()) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw Error(`Timeout: ${label}`); };
let browser;
try {
  await until(async () => (await fetch(origin)).ok, "Vite");
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader", "--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets"] });
  async function pageFor(viewer) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(id => localStorage.setItem("ktgame-token", id), viewer);
    const page = await context.newPage(); page.on("pageerror", failure => errors.push(failure.message)); await blocker.enableBlockingInPage(page);
    return page;
  }
  const page = await pageFor("me"); prepare(6);
  const url = viewer => `${origin}/test/fixtures/table-interface.html?game=midnight-dice&viewer=${viewer}`;
  await page.goto(url("me")); await page.getByRole("button", { name: "Démarrer la partie", exact: true }).click();
  await page.locator(".midnight-board").waitFor();
  assert.equal(await page.locator("[data-midnight-offer]").count(), 4);
  assert.equal(await page.locator(".midnight-side-seats").first().locator(".midnight-player-zone").count(), 3);
  assert.equal(await page.locator(".midnight-side-seats").last().locator(".midnight-player-zone").count(), 3);
  await until(async () => await page.locator(".midnight-card-flight").count() === 0, "initial visual deal");
  assert.match(await page.locator(".midnight-victory-rule").textContent(), /Condition secrète/);
  await page.screenshot({ path: path.join(output, "choix-six-joueurs.png"), fullPage: true });
  const offered = await page.locator("[data-midnight-offer]").evaluateAll(nodes => nodes.map(node => node.dataset.midnightOffer));
  await page.locator("[data-midnight-offer]").first().locator(".midnight-offer-inspect").click();
  await page.getByRole("dialog").waitFor();
  const ratio = await page.locator(".midnight-card-expanded .midnight-card").evaluate(node => node.clientWidth / node.clientHeight);
  assert.ok(Math.abs(ratio - 88 / 63) < .01);
  assert.equal(await page.locator(".midnight-card-expanded .midnight-card-examples > div").count(), 3);
  assert.equal(await page.locator(".midnight-card-expanded [data-midnight-copy-fits=false]").count(), 0);
  await page.screenshot({ path: path.join(output, "mandat-agrandi.png"), fullPage: true });
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.locator("[data-midnight-offer]").first().locator(".midnight-offer-face").click();
  assert.equal(actions.length, 0, "selecting never confirms implicitly");
  await page.getByRole("button", { name: "Confirmer le mandat", exact: true }).click();
  await until(() => room.state.secretContracts.me, "confirmed mandate");
  assert.equal(room.state.secretContracts.me, offered[0]);
  const opponent = await pageFor("p1"); await opponent.goto(url("p1")); await opponent.locator(".midnight-board").waitFor();
  assert.equal(await opponent.locator('[data-midnight-player="me"] [data-midnight-contract]').count(), 0);
  assert.equal(payload("p1").state.secretContracts.me, null);
  await opponent.locator("[data-midnight-offer]").first().locator(".midnight-offer-face").click(); await opponent.getByRole("button", { name: "Confirmer le mandat", exact: true }).click();
  await until(() => room.state.currentPlayerIndex === 2, "opponent choice");
  while (room.state.phase === "contract") { const player = room.state.players[room.state.currentPlayerIndex]; applyMidnightDiceAction(room.state, player.id, midnightDiceBotAction(room.state, player)); }
  broadcast(); await page.bringToFront(); await page.locator(".midnight-market-floor").scrollIntoViewIfNeeded(); await page.locator(".midnight-market-piece .dice-solid-scene canvas").first().waitFor();
  const positions = () => page.locator("[data-midnight-market-id]").evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.midnightMarketId, [node.style.left, node.style.top, node.style.getPropertyValue("--midnight-rest-rotation")]])));
  const before = await positions(), ids = [...room.state.marketIds], count = room.state.market.length;
  await page.locator(".midnight-market-piece .die").first().click();
  await page.getByRole("button", { name: "Relancer (2)", exact: true }).click();
  await page.getByRole("button", { name: "Relancer (1)", exact: true }).waitFor();
  assert.equal(room.state.market.length, count); assert.deepEqual(room.state.marketIds, ids); assert.deepEqual(await positions(), before);
  await page.getByRole("button", { name: "Relancer (1)", exact: true }).click();
  await page.getByRole("button", { name: "Relancer (0)", exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: "Relancer (0)", exact: true }).isDisabled());
  await page.getByRole("button", { name: "Jouer le dé", exact: true }).click();
  await until(() => room.state.trays.me.length === 1, "die pickup");
  assert.equal(room.state.market.length, count - 1);
  assert.deepEqual(await positions(), Object.fromEntries(Object.entries(before).filter(([id]) => id !== ids[0])));
  assert.ok(await page.getByRole("button", { name: "Jouer le dé", exact: true }).isDisabled());
  const ownDie = page.locator('[data-midnight-die-slot="me:0"] .dice-solid-scene');
  await ownDie.locator('canvas').waitFor();
  await until(async () => (await ownDie.getAttribute('data-dice-motion')) === 'settled', 'recovered die stops rotating');
  const settledPose = await ownDie.getAttribute('data-dice-pose');
  await page.waitForTimeout(400);
  assert.equal(await ownDie.getAttribute('data-dice-pose'), settledPose, '3D pose stays fixed after pickup');
  assert.equal(await ownDie.getAttribute('data-dice-result'), String(room.state.trays.me[0]));
  assert.ok(await page.locator('[data-midnight-die-slot="me:0"] .die').evaluate(node => node.classList.contains('die-skin-table-inlay')), 'equipped 3D material remains in use');
  // Read-only personal cards stay usable while the table blocks game actions.
  const ownMandateName = room.state.contractCatalog[room.state.secretContracts.me].label;
  room.pacing = { id: 'inspection-pause', kind: 'turn-end', actorId: 'me', actorName: 'Bnmkt', startedAt: Date.now(), endsAt: Date.now() + 60000 };
  broadcast(); await page.locator('.board.pacing-locked').waitFor();
  await page.getByRole('button', { name: 'Consulter mon mandat', exact: true }).click();
  await page.getByRole('dialog', { name: ownMandateName, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.locator('.midnight-active-contract').click();
  await page.getByRole('dialog', { name: ownMandateName, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  assert.ok(await page.locator('[data-midnight-player="p1"] .midnight-personal-contract').isDisabled(), 'opponent mandate stays inaccessible');
  assert.ok(await page.getByRole('button', { name: 'Jouer le dé', exact: true }).isDisabled());
  room.pacing = null; broadcast(); await until(async () => await page.locator('.board.pacing-locked').count() === 0, 'pause clears');
  await page.getByRole('button', { name: 'Consulter mon mandat', exact: true }).click();
  await page.getByRole('dialog', { name: ownMandateName, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await until(async () => await page.locator(".midnight-card-flight").count() === 0, "visual settled");
  for (const [name, viewport] of [["laptop", { width: 1366, height: 768 }], ["desktop", { width: 1920, height: 1080 }], ["tablet", { width: 820, height: 1180 }], ["mobile", { width: 390, height: 844 }], ["small", { width: 320, height: 740 }]]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(250);
    assert.ok(await page.locator(".midnight-board").isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
    assert.equal(await page.locator(".midnight-player-zone").count(), 6);
    const cards = await page.locator(".midnight-card").evaluateAll(nodes => nodes.filter(node => node.clientWidth).every(node => Math.abs(node.clientWidth / node.clientHeight - 88 / 63) < .03)); assert.ok(cards, `${name}: landscape card proportions`);
    await page.screenshot({ path: path.join(output, `plateau-${name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 768 }); await page.getByRole("button", { name: "Plein écran", exact: true }).click();
  assert.ok(await page.evaluate(() => Boolean(document.fullscreenElement))); await page.screenshot({ path: path.join(output, "plein-ecran.png") });
  await page.getByRole("button", { name: "Réduire", exact: true }).click();
  const selected = room.state.secretContracts.me;
  while (room.state.round === 1) { const player = room.state.players[room.state.currentPlayerIndex]; applyMidnightDiceAction(room.state, player.id, { type: "draft", index: 0 }); }
  broadcast(); await page.getByRole("button", { name: "Résultat de la manche", exact: true }).waitFor();
  assert.equal(midnightContractOffers(room.state, "me").filter(id => offered.includes(id)).length, 3);
  assert.ok(!midnightContractOffers(room.state, "me").includes(selected));
  await page.getByRole("button", { name: "Résultat de la manche", exact: true }).click();
  await page.locator(".midnight-round-results").waitFor();
  assert.equal(await page.locator(".midnight-results-dialog .midnight-round-results article").count(), 6);
  assert.match(await page.locator(".midnight-round-results").textContent(), /Prime du mandat.*Total de la manche/s);
  await page.screenshot({ path: path.join(output, "revelation.png"), fullPage: true });
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.reload(); await page.locator(".midnight-board").waitFor();
  assert.equal(await page.locator(".midnight-card-flight").count(), 0, "reconnect restores without dealing again");
  assert.match(await page.locator(".midnight-victory-rule").textContent(), /Condition secrète/);
  while (!room.state.finished) { const player = room.state.players[room.state.currentPlayerIndex]; applyMidnightDiceAction(room.state, player.id, room.state.phase === "contract" ? midnightDiceBotAction(room.state, player) : { type: "draft", index: 0 }); }
  broadcast(); await page.getByRole("dialog", { name: "Bilan de la partie", exact: true }).waitFor();
  assert.ok(!/Condition secrète/.test(await page.locator(".classic-completion-modal .midnight-victory-rule").textContent()));
  assert.equal(payload("p1").state.resolvedOptions.victory, room.state.resolvedOptions.victory);
  assert.equal(spectatorState(room.state).resolvedOptions.victory, room.state.resolvedOptions.victory);
  await page.screenshot({ path: path.join(output, "bilan-final.png"), fullPage: true });
  await opponent.close();
  prepare(8, true); broadcast(); await page.locator(".midnight-board").waitFor(); await until(async () => await page.locator(".midnight-player-zone").count() === 8, "eight-player compatibility");
  assert.equal(await page.locator(".midnight-side-seats").first().locator(".midnight-player-zone").count(), 3); assert.equal(await page.locator(".midnight-extra-seats .midnight-player-zone").count(), 2);
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.screenshot({ path: path.join(output, "huit-joueurs.png"), fullPage: true });
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ ok: true, output, actions, blocker: true, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, output, actions: actions.length, blocker: true, privateMandates: true, deferredVictory: true }));
} catch (failure) {
  const active = browser?.contexts()[0]?.pages()[0];
  if (active) {
    await active.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
    console.log(JSON.stringify(await active.evaluate(() => [".board-felt", ".midnight-market-floor", ".midnight-market-piece", ".midnight-market-piece .die", ".midnight-market-piece .dice-solid-scene", ".midnight-market-piece canvas"].map(selector => { const node = document.querySelector(selector); if (!node) return { selector }; const style = getComputedStyle(node), rect = node.getBoundingClientRect(); return { selector, count: document.querySelectorAll(selector).length, width: rect.width, height: rect.height, x: rect.x, y: rect.y, visibility: style.visibility, display: style.display, opacity: style.opacity, data: { ...node.dataset } }; }))));
  }
  throw failure;
} finally { await browser?.close(); if (vite.exitCode === null) { const exited = new Promise(resolve => vite.once("exit", resolve)); vite.kill(); await exited; } await new Promise(resolve => realtime.close(resolve)); }
