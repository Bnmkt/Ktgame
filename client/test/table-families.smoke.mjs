import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createGameState, applyAction } from "../../server/src/games/engines.js";
import { publicBeloteState } from "../../server/src/games/engines/belote.js";
import { familyTableGames } from "../src/features/games/table-families.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const requireTools = createRequire(path.join(process.env.KTGA_BROWSER_TOOLS, "package.json"));
const { chromium } = requireTools("playwright"), { PlaywrightBlocker } = requireTools("@ghostery/adblocker-playwright");
const { Server } = createRequire(new URL("../../server/package.json", import.meta.url))("socket.io");
const server = http.createServer(), realtime = new Server(server, { cors: { origin: true, credentials: true } });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const apiOrigin = `http://127.0.0.1:${server.address().port}`;
const portServer = http.createServer(); await new Promise(resolve => portServer.listen(0, "127.0.0.1", resolve));
const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const directory = path.join(root, "docs/previews/table-families-20261102", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: path.join(root, "client"), windowsHide: true, stdio: "pipe", env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: apiOrigin, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: "/socket.io" }
});
let output = "", browser, room, pendingState, serial = 0;
const errors = [], actions = [], checks = [];
vite.stdout.on("data", data => output += data); vite.stderr.on("data", data => output += data);
const players = Array.from({ length: 4 }, (_, i) => ({ id: i ? `p${i}` : "me", pseudo: i ? `Joueur ${i}` : "Bnmkt", tokens: 10000, isBot: false, cosmetics: { equipped: { icon: i ? "star" : "chip", cardSkin: i ? "classic-red" : "premium-gold", diceSkin: "table-inlay" } } }));
function prepare(game, waiting = false) {
  const count = game === "belote" ? 4 : ["golf-solitaire", "accordion"].includes(game) ? 1 : 2;
  const state = createGameState(game, players.slice(0, count), { gameModifiers: { individualContracts: false } });
  if (game === "421") applyAction(state, "me", { type: "roll", keepIndexes: [] });
  if (game === "shut-the-box") { state.dice = [3, 4]; state.lastTotal = 7; }
  if (game === "midnight-dice") while (state.phase === "contract") applyAction(state, state.players[state.currentPlayerIndex].id, { type: "choose-contract", contract: state.contractOffers[0] });
  pendingState = state;
  room = { id: `fixture-${++serial}`, code: game, name: "La table de Bnmkt", gameId: game, activityMatchId: `match-${serial}`, ownerId: "me", stake: 100, players: structuredClone(state.players), minPlayers: count, maxPlayers: count, readyPlayerIds: state.players.map(p => p.id), state: waiting ? null : state };
}
function payload(viewer = "me") {
  const result = structuredClone(room), state = result.state;
  if (!state) return result;
  if (state.gameId === "belote") result.state = publicBeloteState(state, viewer);
  else if (["liars-dice", "velvet-ruse"].includes(state.gameId)) {
    state.hands = Object.fromEntries(Object.entries(state.hands).map(([id, cards]) => [id, id === viewer ? cards : Array(cards.length).fill(null)]));
    if (state.deck) state.deck = Array(state.deck.length).fill(null);
    if (state.dossier) state.dossier = state.dossier.map(({ actual, ...entry }) => entry);
    if (state.pendingClaim) delete state.pendingClaim.actual;
  } else if (state.gameId === "midnight-dice") {
    delete state.privateContractOffers;
    state.secretContracts = Object.fromEntries(Object.entries(state.secretContracts).map(([id, value]) => [id, id === viewer ? value : null]));
  } else if (state.gameId === "bataille") {
    state.piles = Object.fromEntries(Object.entries(state.piles).map(([id, cards]) => [id, Array(cards.length).fill(null)]));
    state.drawnCards = Object.fromEntries(Object.entries(state.drawnCards).map(([id, card]) => [id, id === viewer ? card : { hidden: true }]));
    state.battleLanes.forEach(lane => lane.cards = lane.cards.map(card => card.revealedToAll ? card : { hidden: true, ownerId: card.ownerId, placedRound: card.placedRound }));
    delete state.pendingChoices; delete state.pendingTransfers; delete state.deckKnowledge;
  }
  return result;
}
const publish = () => { for (const socket of realtime.sockets.sockets.values()) if (socket.data.viewer) socket.emit("room", payload(socket.data.viewer)); };
realtime.on("connection", socket => socket.on("watch-room", ({ token }) => { socket.data.viewer = token?.replace("fixture-", "") || "me"; socket.emit("room", payload(socket.data.viewer)); }));
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (i === 149) throw Error(output); await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets", "--enable-unsafe-swiftshader"] });
  async function newPage(viewer = "me") {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(id => localStorage.setItem("ktgame-token", "fixture-" + id), viewer);
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const blocker = PlaywrightBlocker.deserialize(fs.readFileSync(process.env.KTGA_BLOCKER_CACHE)); await blocker.enableBlockingInPage(page);
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/rooms/")) {
        try {
          if (url.pathname.endsWith("/start")) room.state = pendingState;
          if (url.pathname.endsWith("/action")) { const action = route.request().postDataJSON(); actions.push({ viewer, ...action }); room.state = applyAction(room.state, viewer, action); }
          const result = payload(viewer); await route.fulfill({ json: result }); publish(); return;
        } catch (error) { await route.fulfill({ status: 400, json: { error: error.message } }); return; }
      }
      await route.fulfill({ json: url.pathname === "/api/friends" ? { friends: [] } : { messages: {} } });
    });
    return page;
  }
  const page = await newPage();
  async function open(game, waiting = false) {
    prepare(game, waiting);
    await page.goto(`${origin}/test/fixtures/table-interface.html?game=${game}`);
    await page.locator(waiting ? ".waiting-room-actions" : ".table-hud").waitFor();
    if (!waiting) await page.waitForTimeout(650);
  }
  async function noOverflow(label) {
    const bounds = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, width: innerWidth, board: document.querySelector(".board-felt")?.scrollWidth, visible: document.querySelector(".board-felt")?.clientWidth }));
    if (bounds.board > bounds.visible + 2) {
      await page.screenshot({ path: path.join(directory, `${label.replaceAll('/', '-')}-overflow.png`), fullPage: true });
      bounds.children = await page.locator('.board-felt').evaluate(root => { const edge = root.getBoundingClientRect().right; return [...root.querySelectorAll('*')].filter(node => node.getClientRects().length && node.getBoundingClientRect().right > edge + 2).slice(0, 8).map(node => ({ class: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, edge })); });
    }
    assert.ok(bounds.page <= bounds.width + 1 && bounds.board <= bounds.visible + 2, `${label}: ${JSON.stringify(bounds)}`);
  }
  for (const game of process.env.TABLE_GAMES?.split(",") ?? familyTableGames) {
    await open(game);
    assert.equal(await page.locator("[data-table-dealing]").count(), 0, "An existing game restores immediately");
    assert.equal(await page.locator(".table-hud").isVisible(), true, "HUD survives Ghostery");
    assert.equal(await page.locator(".board-heading, .turn-line, .dice-score-strip").count(), 0, "Legacy duplicate HUD is removed");
    for (const [label, viewport] of [["desktop", { width: 1920, height: 1080 }], ["laptop", { width: 1366, height: 768 }], ["mobile", { width: 390, height: 844 }], ["small", { width: 320, height: 740 }]]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(150); await noOverflow(`${game}/${label}`);
      if (viewport.width >= 1100) {
        const bounds = await page.locator(".board").boundingBox();
        if (bounds.y + bounds.height > viewport.height + 3) { await page.screenshot({ path: path.join(directory, `${game}-${label}-overflow.png`), fullPage: true }); }
        const styles = bounds.y + bounds.height > viewport.height + 3 ? await page.evaluate(() => ["main", ".layout", ".layout > section", ".board", ".board-felt", ".liar-arena"].map(selector => { const node = document.querySelector(selector); if (!node) return null; const s = getComputedStyle(node); return { selector, height: s.height, min: s.minHeight, max: s.maxHeight, display: s.display, flex: s.flex, grid: s.gridTemplateRows }; })) : [];
        assert.ok(bounds.y + bounds.height <= viewport.height + 3, `${game}: desktop playfield fits ${JSON.stringify({bounds,styles})} / ${viewport.height}`);
      }
      await page.screenshot({ path: path.join(directory, `${game}-${label}.png`), fullPage: true });
    }
    const cards = page.locator(".board-felt .card-solid-piece");
    if (await cards.count()) {
      assert.equal(await cards.first().evaluate(node => getComputedStyle(node).transformStyle), "preserve-3d");
      assert.ok(await cards.first().locator(".card-solid-depth").count());
      for (const card of await cards.all()) assert.equal(await card.evaluate(node => getComputedStyle(node).opacity), "1");
    }
    assert.equal(await page.locator(".belote-card-fan [data-card-face], .velvet-opponent-hand [data-card-face], .battle-opponent .battle-drawn-station [data-card-face]").count(), 0);
    if (["421", "shut-the-box", "liars-dice", "midnight-dice"].includes(game)) {
      const canvas = page.locator(".board-felt .dice-solid-scene canvas").first(); await canvas.waitFor();
      await canvas.evaluate(node => node.scrollIntoView({ block: "center", inline: "nearest" }));
      await page.waitForTimeout(100);
      await page.waitForFunction(node => node.getContext("2d").getImageData(0, 0, node.width, node.height).data.some((v, i) => i % 4 === 3 && v > 100), await canvas.elementHandle(), { timeout: 8000 }).catch(async error => {
        throw Error(`${game}: ${error.message} ${JSON.stringify({ errors, nodes: await canvas.evaluate(node => { const result = []; for (let n = node; n && result.length < 7; n = n.parentElement) { const s = getComputedStyle(n); result.push({ class: n.className, data: {...n.dataset}, bitmap: [n.width,n.height], width: s.width, height: s.height, display: s.display, grid: s.gridTemplateColumns, rect: n.getBoundingClientRect().toJSON() }); } return result; }) })}`);
      });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole("button", { name: "Plein écran", exact: true }).click(); await page.locator(".table-fullscreen").waitFor();
    await noOverflow(`${game}/fullscreen`); await page.screenshot({ path: path.join(directory, `${game}-fullscreen.png`), fullPage: true });
    await page.getByRole("button", { name: "Réduire", exact: true }).click();
    await page.setViewportSize({ width: 820, height: 1180 }); await noOverflow(`${game}/tablet`);
    checks.push(`${game}: 4 resolutions, fullscreen, 3D, cosmetics, privacy, blocker`);
  }
  await open("421"); await page.locator(".dice-mode-toggle input").check();
  while (await page.locator('.dice-throw-tray .die[aria-pressed="true"]').count()) await page.locator('.dice-throw-tray .die[aria-pressed="true"]').first().click();
  const die = page.locator(".dice-throw-tray .die[aria-pressed]").first(); const value = room.state.dice[0];
  await die.click(); await page.getByRole("button", { name: /^Lancer \(/ }).click();
  await page.waitForTimeout(700); assert.deepEqual(actions.at(-1).keepIndexes, [0]); assert.equal(room.state.dice[0], value);
  await page.getByRole("button", { name: "Valider", exact: true }).click(); await page.waitForTimeout(100); assert.equal(actions.at(-1).type, "bank");
  await open("shut-the-box"); await page.locator(".shut-tiles button").nth(6).click();
  await page.getByRole("button", { name: "Fermer la sélection", exact: true }).click(); await page.waitForTimeout(100); assert.ok(!room.state.boxes.me.includes(7));
  await open("liars-dice"); await page.getByRole("button", { name: /^Annoncer/ }).click(); await page.waitForTimeout(100); assert.equal(actions.at(-1).type, "bid");
  await open("midnight-dice"); await page.getByRole("button", { name: "Prendre", exact: true }).first().click(); await page.waitForTimeout(100); assert.equal(room.state.trays.me.length, 1);
  room.state = createGameState("midnight-dice", players.slice(0, 2)); publish();
  await page.getByRole("dialog", { name: "Choisis ton mandat", exact: true }).waitFor();
  await page.getByRole("button", { name: "Choisir", exact: true }).first().click(); await page.waitForTimeout(100); assert.equal(actions.at(-1).type, "choose-contract");
  await open("bataille"); const opponent = await newPage("p1"); await opponent.goto(`${origin}/test/fixtures/table-interface.html?game=bataille&viewer=p1`); await opponent.locator(".table-hud").waitFor();
  await page.getByRole("button", { name: "Piocher une carte", exact: true }).click(); await page.waitForTimeout(130);
  assert.ok(room.state.drawnCards.me); assert.equal(await opponent.locator('.battle-opponent .battle-drawn-station [data-card-face]').count(), 0);
  await page.getByRole("button", { name: /^Placer sur/ }).first().click(); await page.waitForTimeout(100); assert.ok(room.state.submittedPlayerIds.includes("me")); await opponent.close();
  await open("velvet-ruse"); await page.locator('.table-card-stock[data-table-deal-slot]').count();
  await page.getByRole("button", { name: /^Pioche ·/ }).click(); await page.waitForTimeout(150);
  assert.equal(actions.at(-1).source, "deck"); assert.ok(await page.locator('[data-card-flight][data-card-covered]').count(), "Draw travels as a covered solid card");
  await page.waitForTimeout(550); await page.locator(".velvet-hand > button").first().click();
  await page.getByRole("button", { name: "Glisser face cachée", exact: true }).click(); await page.waitForTimeout(100); assert.equal(actions.at(-1).type, "declare");
  await open("belote"); const suit = room.state.turnedCard.suit;
  await page.locator(".belote-bid-actions > button").first().click(); await page.waitForTimeout(650); assert.equal(room.state.trump, suit);
  const legal = page.locator(".belote-hand > button.belote-playable").first(); await legal.click(); await page.waitForTimeout(100); assert.equal(actions.at(-1).type, "play");
  await open("golf-solitaire"); const stockBefore = room.state.stock.length;
  await page.getByRole("button", { name: /^Pioche ·/ }).click(); await page.waitForTimeout(150); assert.equal(room.state.stock.length, stockBefore - 1);
  assert.ok(await page.locator('[data-card-flight][data-card-covered]').count()); await page.waitForTimeout(550);
  await open("accordion"); const pair = room.state.piles.flatMap((_, from) => [from - 1, from - 3].filter(to => to >= 0 && (room.state.piles[from].at(-1).rank === room.state.piles[to].at(-1).rank || room.state.piles[from].at(-1).suit === room.state.piles[to].at(-1).suit)).map(to => ({ from, to })))[0];
  assert.ok(pair); await page.locator(".accordion-line > button").nth(pair.from).click(); await page.locator(".accordion-line > button").nth(pair.to).click(); await page.waitForTimeout(100); assert.equal(room.state.piles.length, 51);
  for (const game of ["belote", "velvet-ruse", "golf-solitaire", "accordion", "bataille"]) {
    await open(game, true); await page.getByRole("button", { name: "Démarrer la partie", exact: true }).click();
    await page.locator("[data-table-dealing]").waitFor(); await page.waitForTimeout(160);
    assert.ok(await page.locator('[data-card-flight][data-card-covered]').count(), `${game}: deal leaves the actual solid deck`);
    assert.equal(await page.locator('[data-card-flight][data-card-face]').count(), 0);
    await page.screenshot({ path: path.join(directory, `${game}-distribution.png`), fullPage: true });
    if (game === "golf-solitaire") await page.locator("[data-table-dealing]").waitFor({ state: "detached" });
    else if (await page.locator("[data-table-dealing]").count()) await page.getByRole("button", { name: "Passer la distribution", exact: true }).click({ timeout: 1000 }).catch(async error => { if (await page.locator("[data-table-dealing]").count()) throw error; });
    assert.equal(await page.locator("[data-table-dealing]").count(), 0); assert.equal(await page.locator('[data-card-flight]').count(), 0);
    await page.reload(); await page.locator(".table-hud").waitFor(); assert.equal(await page.locator("[data-table-dealing]").count(), 0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open("accordion", true); await page.getByRole("button", { name: "Démarrer la partie", exact: true }).click(); await page.locator(".table-hud").waitFor();
  assert.equal(await page.locator("[data-table-dealing]").count(), 0, "Reduced motion restores the dealt board directly");
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ ok: true, checks, actions: actions.length, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, directory, checks, actions: actions.length }));
} finally { await browser?.close(); await new Promise(resolve => realtime.close(resolve)); if (vite.exitCode === null) { const done = new Promise(resolve => vite.once("exit", resolve)); vite.kill(); await done; } }
