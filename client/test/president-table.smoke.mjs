import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Server } from "../../server/node_modules/socket.io/dist/index.js";
import { createPresidentState, applyPresidentAction } from "../../server/src/games/engines/president.js";
import { presidentCardKey, presidentDealSequence } from "../src/features/games/president.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? path.join(dependencies, "playwright/index.mjs")).href);
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")).href);
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const players = Array.from({ length: 6 }, (_, i) => ({ id: i ? `p${i}` : "me", pseudo: i ? ["", "Camille", "Lucky", "Midnight", "Jacky", "Nixie"][i] : "Bnmkt", tokens: 10000, ready: true, cosmetics: { equipped: { icon: i ? "star" : "chip", cardSkin: i ? "classic-red" : "premium-gold" } } }));
let room, revision = 0, webOrigin;
const actions = [], errors = [], watches = new Map();
function prepare(count, playing = false) {
  const seated = players.slice(0, count);
  room = { id: "president", code: "president", gameId: "president", name: "La table de Bnmkt", ownerId: "me", players: seated, stake: 100, maxPlayers: 6, readyPlayerIds: seated.map(p => p.id), finished: false, isPublic: true, activityMatchId: `test-${++revision}`, state: playing ? createPresidentState(seated) : null };
}
function payload(viewer) {
  const result = structuredClone(room);
  if (result.state) for (const [id, hand] of Object.entries(result.state.hands)) if (id !== viewer) result.state.hands[id] = hand.map(() => null);
  return result;
}
function broadcast() { for (const socket of realtime.sockets.sockets.values()) socket.emit("room", payload(socket.data.viewer)); }
const service = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", webOrigin ?? "*"); res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "authorization,content-type"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const pathname = new URL(req.url, "http://localhost").pathname, viewer = req.headers.authorization?.replace("Bearer ", "") ?? "me";
  const reply = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (pathname === "/api/rooms/president/start") { room.state = createPresidentState(room.players); room.activityMatchId = `test-${++revision}`; broadcast(); return reply(payload(viewer)); }
  if (pathname === "/api/rooms/president/action") {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const action = JSON.parse(Buffer.concat(chunks)); actions.push({ viewer, action });
    try { applyPresidentAction(room.state, viewer, action); broadcast(); return reply(payload(viewer)); }
    catch (error) { return reply({ error: error.message }, 400); }
  }
  if (pathname.startsWith("/api/rooms/")) return reply(payload(viewer));
  if (pathname === "/api/me") return reply(players.find(p => p.id === viewer));
  if (pathname === "/api/friends") return reply({ friends: [] });
  return reply({ messages: {} });
});
const realtime = new Server(service, { cors: { origin: true, credentials: true } });
realtime.on("connection", socket => socket.on("watch-room", ({ token }) => { socket.data.viewer = token; watches.set(token, (watches.get(token) ?? 0) + 1); }));
await new Promise(resolve => service.listen(0, "127.0.0.1", resolve));
const apiOrigin = `http://127.0.0.1:${service.address().port}`;
const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port;
await new Promise(resolve => probe.close(resolve)); webOrigin = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, stdio: "ignore", env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: apiOrigin, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: "/socket.io" } });
const output = path.join(root, "docs/previews/president-table-20261028", String(Date.now())); mkdirSync(output, { recursive: true });
async function until(check, label) { for (let i = 0; i < 120; i++) { try { if (await check()) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw Error(`Timeout: ${label}`); }
let browser;
try {
  await until(async () => (await fetch(webOrigin)).ok, "Vite");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  async function newPage(viewer = "me") {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(id => localStorage.setItem("ktgame-token", id), viewer);
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message)); await blocker.enableBlockingInPage(page);
    return page;
  }
  const page = await newPage();
  const url = viewer => `${webOrigin}/test/fixtures/table-interface.html?game=president&viewer=${viewer}`;
  prepare(6);
  await page.goto(url("me")); await page.getByRole("button", { name: "Démarrer la partie", exact: true }).waitFor();
  await page.evaluate(() => {
    window.dealFlights = [];
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement && node.dataset.presidentFlight) window.dealFlights.push({ owner: node.dataset.presidentFlight, faces: node.querySelectorAll("[data-card-face]").length, opacity: getComputedStyle(node).opacity }); }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "Démarrer la partie", exact: true }).click();
  await page.locator('[data-president-dealing="true"]').waitFor();
  const sequence = presidentDealSequence(room.state);
  await page.screenshot({ path: path.join(output, "distribution.png") });
  await until(async () => await page.locator("[data-president-dealing]").count() === 0, "deal complete");
  const flights = await page.evaluate(() => window.dealFlights);
  assert.equal(flights.length, 52); assert.deepEqual(flights.map(item => item.owner), sequence.map(item => item.playerId));
  assert.ok(flights.every(item => item.faces === 0 && item.opacity === "1"));
  assert.equal(await page.locator('.president-seat [data-card-face]').count(), 0);
  assert.equal(await page.locator('.president-seat .card-back').count(), 52 - room.state.hands.me.length);
  assert.equal(await page.locator('.president-seat').count(), 5);
  const cardKeys = () => page.locator('[data-president-card]').evaluateAll(nodes => nodes.map(node => node.dataset.presidentCard));
  assert.deepEqual(await cardKeys(), room.state.hands.me.map(presidentCardKey));
  const first = page.locator('[data-president-card]').first();
  if (process.env.PRESIDENT_DEBUG) {
    console.log(await page.evaluate(() => ['.room-app-shell','.layout','.layout > section','.board','.board-felt','.president-stage','.president-playfield','.president-self-zone','.president-card-hand'].map(selector => { const node=document.querySelector(selector), s=getComputedStyle(node), r=node.getBoundingClientRect(); return {selector,display:s.display,height:r.height,top:r.top,flex:s.flex,rows:s.gridTemplateRows,inline:node.getAttribute('style')}; })));
    await page.screenshot({ path: path.join(output, 'debug.png') });
  }
  const box = await first.boundingBox();
  await first.hover({ position: { x: 7, y: 8 } });
  await page.waitForTimeout(200);
  assert.ok((await first.boundingBox()).y < box.y - 10);
  assert.equal(await first.evaluate(node => getComputedStyle(node).zIndex), "80");
  assert.equal(await first.locator('.playing-card').evaluate(node => getComputedStyle(node).transformStyle), "preserve-3d");
  await first.click({ position: { x: 8, y: 15 } }); assert.equal(await first.getAttribute('aria-pressed'), "true");
  await first.click({ position: { x: 8, y: 15 } }); assert.equal(await first.getAttribute('aria-pressed'), "false");
  await page.mouse.move(0, 0); await page.waitForTimeout(200);
  const before = await cardKeys(), source = await first.boundingBox(), last = await page.locator('[data-president-card]').last().boundingBox();
  await page.mouse.move(source.x + 7, source.y + 10); await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, source.y + 10, { steps: 16 });
  assert.equal(await page.locator('.president-card-dragged').count(), 1);
  await page.mouse.up(); await page.waitForTimeout(200);
  assert.deepEqual(await cardKeys(), [...before.slice(1), before[0]]);
  assert.equal(await page.locator('[aria-pressed="true"][data-president-card]').count(), 0, "drag must not select");
  assert.equal(actions.length, 0, "reordering never sends an engine action");
  broadcast(); await page.waitForTimeout(200); assert.deepEqual(await cardKeys(), [...before.slice(1), before[0]]);
  await page.reload(); await page.locator('.president-stage').waitFor();
  assert.deepEqual(await cardKeys(), [...before.slice(1), before[0]], "manual order persists across reload");
  assert.equal(await page.locator('[data-president-dealing]').count(), 0, "reload never replays the deal");
  for (const count of [3, 4, 5, 6]) {
    prepare(count, true); broadcast(); await page.waitForTimeout(150);
    await until(async () => await page.locator('[data-president-dealing]').count() === 0, 'fixture deal complete');
    for (const [name, viewport] of [["laptop", { width: 1366, height: 768 }], ["desktop", { width: 1920, height: 1080 }], ["wide", { width: 2560, height: 1440 }], ["mobile", { width: 390, height: 844 }], ["small", { width: 320, height: 740 }]]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(180);
      const geometry = await page.locator('.president-card-hand').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return { scroll: node.scrollWidth, width: node.clientWidth, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, pageHeight: document.documentElement.scrollHeight, height: innerHeight, cards: [...node.children].map(card => { const r = card.getBoundingClientRect(); return { left: r.left - rect.left, right: r.right - rect.left, top: r.top - rect.top, opacity: getComputedStyle(card).opacity, pieceOpacity: getComputedStyle(card.firstElementChild).opacity, ratio: r.width / r.height }; }) };
      });
      assert.ok(geometry.scroll <= geometry.width + 1, `${count}/${name} hand overflow ${JSON.stringify(geometry)}`);
      assert.ok(geometry.pageWidth <= geometry.viewport, `${count}/${name} page overflow`);
      assert.ok(geometry.cards.every(card => card.left >= -1 && card.right <= geometry.width + 1 && card.opacity === "1" && card.pieceOpacity === "1" && Math.abs(card.ratio - 82 / 118) < .02), `${count}/${name}: opaque, proportioned, visible cards`);
      assert.ok(geometry.cards.every(card => Math.abs(card.top - geometry.cards[0].top) < 1), 'one row');
      if (viewport.width >= 1100) assert.ok(geometry.pageHeight <= geometry.height + 2, `${count}/${name} vertical overflow ${JSON.stringify(geometry)}`);
      if (count === 6 || count === 3 && name === 'laptop') await page.screenshot({ path: path.join(output, `${count}-players-${name}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Plein écran', exact: true }).click();
  await page.locator('.table-fullscreen').waitFor();
  assert.ok(await page.evaluate(() => Boolean(document.fullscreenElement)));
  await page.screenshot({ path: path.join(output, 'fullscreen.png') });
  await page.getByRole('button', { name: 'Réduire', exact: true }).click();

  // Two private browser views and real Socket.IO updates using the existing engine.
  prepare(3, true);
  room.state.hands.me = [{ rank: '8', suit: 'S' }, { rank: '3', suit: 'C' }, { rank: '8', suit: 'H' }, { rank: 'A', suit: 'D' }];
  broadcast(); await page.waitForTimeout(200);
  const opponent = await newPage('p1'); await opponent.goto(url('p1')); await opponent.locator('.president-stage').waitFor();
  const select = key => page.locator(`[data-president-card="${key}"]`).click({ position: { x: 7, y: 12 } });
  await select('0:8:S'); await select('0:8:H');
  assert.equal(await page.locator('[data-president-card][aria-pressed="true"]').count(), 2);
  await page.mouse.move(0, 0); await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'multiple-selection.png') });
  const remaining = await cardKeys();
  await page.getByRole('button', { name: 'Jouer la sélection', exact: true }).click();
  await until(async () => await opponent.locator('.president-played-cards [data-card-face]').count() === 2, 'remote pile');
  await page.waitForTimeout(550); await page.screenshot({ path: path.join(output, 'played-pair.png') });
  assert.deepEqual(await cardKeys(), remaining.filter(key => !['0:8:S','0:8:H'].includes(key)));
  assert.deepEqual(room.state.hands.me.map(card => card.rank), ['3', 'A']);
  assert.equal(await opponent.locator('.president-seat [data-card-face]').count(), 0);
  assert.equal(actions.at(-1).action.cards.length, 2);
  await opponent.getByRole('button', { name: /^Passer/ }).click();
  await until(() => room.state.currentPlayerIndex === 2, 'remote pass');
  const oldWatches = watches.get('me');
  for (const socket of realtime.sockets.sockets.values()) if (socket.data.viewer === 'me') socket.conn.close();
  await until(() => watches.get('me') > oldWatches, 'transport reconnect'); broadcast();
  assert.equal(await page.locator('[data-president-dealing]').count(), 0);
  await opponent.close();

  // New matches animate; accelerating, skipping and server updates restore every card.
  prepare(3); broadcast(); await page.getByRole('button', { name: 'Démarrer la partie', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Démarrer la partie', exact: true }).click();
  await page.getByRole('button', { name: 'Accélérer', exact: true }).click();
  await page.getByRole('button', { name: 'Passer l’animation', exact: true }).click();
  assert.equal(await page.locator('[data-president-dealing]').count(), 0);
  assert.equal(await page.locator('.president-flight').count(), 0);
  assert.ok(await page.locator('[data-president-deal-slot]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).visibility === 'visible')));
  prepare(3); broadcast(); await page.getByRole('button', { name: 'Démarrer la partie', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Démarrer la partie', exact: true }).click();
  await page.locator('[data-president-dealing]').waitFor();
  applyPresidentAction(room.state, 'me', { type: 'play', cards: room.state.hands.me.slice(0,1) }); broadcast();
  await until(async () => await page.locator('[data-president-dealing]').count() === 0, 'server update cancels visual timeline');
  assert.equal(await page.locator('.president-flight').count(), 0);
  assert.ok(await page.locator('[data-president-deal-slot]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).visibility === 'visible')));
  prepare(3); broadcast(); await page.getByRole('button', { name: 'Démarrer la partie', exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Démarrer la partie', exact: true }).click();
  await page.locator('.president-stage').waitFor();
  assert.equal(await page.locator('[data-president-dealing]').count(), 0, 'reduced motion skips visual timeline');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output,'results.json'), JSON.stringify({ ok: true, checks: ['52-round-robin-flights','hidden-opponents','opaque-3d-cosmetics','hover-front','toggle-and-multi-selection','pointer-reorder-without-click','order-survives-updates-and-reload','3-to-6-players','1366-1920-wide-mobile-fullscreen','socket-multiplayer-and-reconnect','accelerate-and-skip','immediate-server-update','reduced-motion','content-blocker'], actions, errors }, null, 2));
  console.log(`PASS: President table, all interaction and viewport checks. Screenshots: ${output}`);
} finally {
  await browser?.close(); if (vite.exitCode === null) await new Promise(resolve => { vite.once('exit', resolve); vite.kill(); });
  await new Promise(resolve => realtime.close(resolve));
}
