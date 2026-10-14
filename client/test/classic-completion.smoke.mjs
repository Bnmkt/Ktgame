import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Server } from "../../server/node_modules/socket.io/dist/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory = path.join(root, "docs/previews/classic-completion-20261013", String(Date.now()));
fs.mkdirSync(directory, { recursive: true });
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const realtime = new Server({ cors: { origin, credentials: true }, serveClient: false, allowUpgrades: false, transports: ["polling"] });
realtime.listen(0);
await new Promise(resolve => realtime.httpServer.once("listening", resolve));
const apiOrigin = `http://127.0.0.1:${realtime.httpServer.address().port}`;
let wireRoom;
let connections = 0;
const connectionIssues = [];
realtime.engine.on("connection_error", error => connectionIssues.push(error.message));
realtime.on("connection", socket => { connections++; socket.on("watch-room", payload => { if (wireRoom) socket.emit("room", { ...wireRoom, spectator: Boolean(payload.spectator) }); }); });
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: path.join(root, "client"), windowsHide: true, env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: apiOrigin }, stdio: ["ignore", "pipe", "pipe"]
});
let output = "", browser;
const errors = [];
child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import '/src/styles.css';import '/src/navigation/casino.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{ClassicCompletion}=await import('/src/components/room/ClassicCompletion.jsx'),{Room}=await import('/src/pages/RoomPage.jsx');
const {SpectatorPage}=await import('/src/pages/SpectatorPage.jsx');
const h=React.createElement,root=ReactDOM.createRoot(document.getElementById('root'));
window.skips=0;window.replays=0;window.leaves=0;
window.recap=(room)=>root.render(h(LocaleProvider,null,h('main',{style:{maxWidth:800,margin:'24px auto',padding:12}},h(ClassicCompletion,{key:room.activityMatchId,room,userId:'self',isOwner:true,pacing:room.pacing,canSkip:true,onSkip:()=>window.skips++,onReplay:()=>window.replays++,onInstantReplay:()=>window.replays++,onLeave:()=>window.leaves++}))));
window.table=(room)=>root.render(h(LocaleProvider,null,h(Room,{key:room.activityMatchId,code:room.code,user:room.players[0],setUser:()=>{},onBack:()=>{},onExcluded:()=>{}})));
window.joins=0;window.spectate=(room)=>root.render(h(LocaleProvider,null,h(SpectatorPage,{key:room.activityMatchId,code:room.code,user:{id:'observer',pseudo:'Spectateur',cosmetics:{equipped:{}}},onBack:()=>{},onJoin:()=>window.joins++})));
window.ready=true;
</script></body></html>`;
const players = [{ id: "self", pseudo: "Bnmkt", tokens: 20300100, cosmetics: { equipped: { icon: "chip", nameEffect: "gold" } }, profile: {} },
  { id: "other", pseudo: "Partenaire", cosmetics: { equipped: { icon: "dice" } } },
  { id: "third", pseudo: "Un pseudo particulièrement long", cosmetics: { equipped: { icon: "star" } } }, { id: "bot", pseudo: "Bot 1", isBot: true }];
const fixture = (id, gameId = "yahtzee") => ({ id: "room", activityMatchId: id, code: "123456", ownerId: "self", name: "Table de Bnmkt", gameId, players, stake: 100, finished: true,
  state: { gameId, finished: true, players, currentPlayerIndex: 0, winners: ["self"], ranking: players.map((player, index) => ({ id: player.id, score: [312, 286, 214, 173][index] })), roomPayouts: { self: 210, other: 90 }, scores: Object.fromEntries(players.map(player => [player.id, {}])), dice: [], round: 13, maxRounds: 13 },
  completion: { xp: { amount: 350, level: 10, previousLevel: 9, mastery: 1, previousMastery: 1, masteryLabel: "I", title: "Brelan I", levelXp: 140, nextXp: 1280 } },
  pacing: { id, kind: "round-results", final: true, endsAt: Date.now() + 30000, startedAt: Date.now() }
});
try {
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
    if (attempt === 199) throw new Error(output);
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["compact", { width: 1366, height: 768 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await blocker.enableBlockingInPage(page);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && message.text().includes("socket.io")) connectionIssues.push(message.text()); });
    page.on("requestfailed", request => { if (request.url().includes("socket.io")) connectionIssues.push(`${request.url()} ${request.failure()?.errorText}`); });
    let room = fixture(name), joins = 0;
    wireRoom = room;
    await page.route("**/__completion", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.route("**/api/**", route => {
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const key = new URL(route.request().url()).pathname;
      if (key === "/api/rooms/123456/join") joins++;
      const data = key === "/api/rooms/123456" || key === "/api/rooms/123456/join" ? room : key === "/api/rooms/123456/spectate" ? { ...room, spectator: true } : key === "/api/me" ? room.players[0] : key === "/api/friends" ? { friends: [] } : { messages: {} };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(data), headers });
    });
    await page.goto(`${origin}/__completion`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.ready, undefined, { timeout: 60000 }).catch(error => { throw new Error(`${error.message}\n${JSON.stringify(errors)}\n${output.slice(-1500)}`); });
    await page.evaluate(value => window.recap(value), room);
    const modal = page.getByRole("dialog", { name: "Bilan de la partie" });
    await modal.waitFor();
    assert.equal(await modal.getByRole("heading", { name: "Victoire !" }).count(), 1);
    assert.equal(await modal.locator("progress").getAttribute("value"), "140");
    assert.equal(await modal.getByText("+350 XP", { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await modal.evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
    await modal.screenshot({ path: path.join(directory, `${name}-victory.png`) });
    await modal.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.equal(await page.evaluate(() => window.skips), 0, "Closing cannot change server pacing");
    await page.evaluate(value => window.recap(value), { ...room });
    assert.equal(await page.getByRole("dialog").count(), 0, "Room updates cannot reopen dismissed results");
    await page.getByRole("button", { name: "Revoir les résultats" }).click();
    await modal.getByRole("button", { name: "Voir la table" }).click();
    await page.getByRole("button", { name: "Retour à la salle d'attente" }).click();
    assert.equal(await page.evaluate(() => window.replays), 1);
    await page.screenshot({ path: path.join(directory, `${name}-table-summary.png`) });
    room = fixture(`${name}-loss`); room.state.winners = ["other"]; room.state.ranking = [room.state.ranking[1], room.state.ranking[0], ...room.state.ranking.slice(2)];
    await page.evaluate(value => window.recap(value), room);
    await modal.waitFor();
    assert.equal(await modal.locator(".completion-finished").count(), 1);
    await modal.screenshot({ path: path.join(directory, `${name}-loss.png`) });
    // Render the real table to check that the legacy final views no longer stack.
    room = fixture(`${name}-real-table`); wireRoom = room;
    await page.evaluate(value => window.table(value), room);
    await modal.waitFor();
    assert.equal(await page.locator(".round-results-modal, .board-result, .leaderboard").count(), 0);
    await modal.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.equal(await page.locator(".classic-completion").count(), 1);
    assert.equal(await page.locator(".yahtzee-score-panel").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(directory, `${name}-real-room.png`) });
    if (name === "compact") {
      await page.getByRole("button", { name: "Plein écran", exact: true }).click();
      await page.getByRole("button", { name: "Revoir les résultats" }).click();
      assert.equal(await modal.evaluate(node => !!node.closest(":fullscreen")), true);
      assert.equal(await modal.evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
      await page.screenshot({ path: path.join(directory, `${name}-fullscreen.png`) });
      await page.evaluate(() => document.exitFullscreen());
    }
    // Real-time transition from observation to a seat, without changing results.
    // The document is synthetic, so bridge polling through the real fixture
    // server rather than triggering the browser's public-to-loopback guard.
    await page.route(`${apiOrigin}/socket.io/**`, async route => route.fulfill({ response: await route.fetch() }));
    room = fixture(`${name}-spectator`); room.maxPlayers = 6;
    room.players = room.players.filter(player => player.id !== "self");
    room.state.gameId = room.gameId = "cul-de-chouette";
    room.state.finished = room.finished = false; room.state.dice = [1, 2, 3]; room.state.scores = {}; room.state.modifiers = {};
    wireRoom = room;
    await page.evaluate(value => window.spectate(value), room);
    const toggle = page.getByRole("checkbox", { name: "Rejoindre automatiquement à la fin" });
    await toggle.waitFor(); assert.equal(await toggle.isChecked(), true); assert.equal(joins, 0);
    await page.waitForFunction(() => document.querySelector('.spectator-page .eyebrow')?.textContent.includes('En direct'), undefined, { timeout: 10000 }).catch(async error => { throw new Error(`${error.message}\n${connections} connections\n${JSON.stringify(connectionIssues)}\n${await page.locator('.spectator-page').innerText()}\n${JSON.stringify(await page.evaluate(async () => { const api = await import('/src/api.js'); return { url: api.SOCKET_URL, path: api.SOCKET_PATH }; }))}`); });
    await page.screenshot({ path: path.join(directory, `${name}-spectator-auto.png`) });
    room.state.finished = room.finished = true; wireRoom = room;
    realtime.emit("room", { ...room, spectator: true });
    await page.waitForFunction(() => window.joins === 1); assert.equal(joins, 1);
    realtime.emit("room", { ...room, spectator: true }); await page.waitForTimeout(200); assert.equal(joins, 1);
    await toggle.uncheck(); room = { ...room, activityMatchId: `${name}-disabled`, finished: false, state: { ...room.state, finished: false } }; wireRoom = room;
    await page.evaluate(value => window.spectate(value), room); await toggle.waitFor(); assert.equal(await toggle.isChecked(), false);
    await page.waitForFunction(() => document.querySelector('.spectator-page .eyebrow')?.textContent.includes('En direct'));
    room.finished = room.state.finished = true; realtime.emit("room", { ...room, spectator: true }); await page.waitForTimeout(200); assert.equal(joins, 1);
    await toggle.check(); await page.waitForFunction(() => window.joins === 2);
    room = { ...room, activityMatchId: `${name}-full`, maxPlayers: 3 }; wireRoom = room;
    await page.evaluate(value => window.spectate(value), room); await toggle.waitFor(); await page.waitForTimeout(200); assert.equal(joins, 2);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, directory, viewports: 3, errors }));
} finally {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) await page.unrouteAll({ behavior: "ignoreErrors" });
  await browser?.close();
  await realtime.close();
  if (child.exitCode === null) { const exit = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exit; }
}
