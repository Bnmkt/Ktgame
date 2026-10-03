import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Server } from "../../server/node_modules/socket.io/dist/index.js";
import { applyPresidentAction } from "../../server/src/games/engines/president.js";
import { games } from "../../server/src/games/shared.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const cosmetics = { equipped: { icon: "chip", nameEffect: "none", cardSkin: "default", diceSkin: "default", memberCard: "default" } };
const user = { id: "alpha", pseudo: "Alpha", guest: false, tokens: 10000, profile: { displayName: "Alpha", birthDate: "2000-01-01", favoriteGames: [] }, cosmetics, achievements: {}, profileStats: { publicStats: [] } };
const players = [user, { ...user, id: "beta", pseudo: "Beta" }, { ...user, id: "gamma", pseudo: "Gamma" }];
const cards = (...ranks) => ranks.map((rank, index) => ({ rank, suit: ["S", "H", "D", "C"][index % 4] }));
const fixtures = new Map();
function fixture(code, rank, hand, revolution = false, count = 1) {
  const room = { id: code, code, name: `President ${code}`, gameId: "president", ownerId: user.id, players, finished: false, isPublic: true, stake: 10, pacing: { id: code, kind: "turn-end", actorId: "beta", actorIsBot: false, startedAt: Date.now(), endsAt: Date.now() + 60000 }, state: {
    gameId: "president", players, modifiers: { revolutionEnabled: true }, hands: { alpha: cards(...hand), beta: cards("5", "6", "7"), gamma: cards("8", "9", "10") },
    pile: [{ playerId: "beta", cards: cards(...Array(count).fill(rank)) }], currentSet: { playerId: "beta", rank, count },
    passes: [], finishedOrder: [], revolution, logs: [], currentPlayerIndex: 0, finished: false, winners: []
  } };
  fixtures.set(code, room);
  return room;
}
fixture("NORMAL", "2", ["4", "A"]);
fixture("REVLOW", "2", ["A", "A"], true);
fixture("REVTOP", "3", ["A", "2"], true);
fixture("PAIR", "K", ["A", "2"], false, 2);
fixture("MANUAL", "2", ["4", "A"]);
fixture("READY", "K", ["A", "A"]).pacing = null;
const actions = [];
let webOrigin = "";
const service = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", webOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, "http://localhost");
  const reply = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/api/me") return reply(user);
  if (url.pathname === "/api/config") return reply({ siteName: "KTGA.ME", minRoomStake: 10 });
  if (url.pathname === "/api/games") return reply(games);
  if (url.pathname === "/api/rooms") return reply([...fixtures.values()]);
  if (["/api/shop", "/api/notifications"].includes(url.pathname)) return reply([]);
  if (url.pathname === "/api/friends") return reply({ friends: [], incoming: [], outgoing: [], roomInvites: [] });
  if (url.pathname === "/api/tribunal/availability") return reply({ available: false });
  if (url.pathname === "/api/community-events/carousel") return reply({ events: [] });
  if (url.pathname === "/api/chat/unread") return reply({ channels: [] });
  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/action)?$/);
  if (match) {
    const room = fixtures.get(match[1]);
    if (!room) return reply({ error: "Unknown fixture" }, 404);
    if (match[2]) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const action = JSON.parse(Buffer.concat(chunks).toString());
      actions.push({ code: room.code, action, at: Date.now() });
      if (room.pacing) return reply({ error: "Previous turn still visible" }, 409);
      try { applyPresidentAction(room.state, user.id, action); }
      catch (error) { return reply({ error: error.message }, 400); }
      if (room.code === "MANUAL") await new Promise((resolve) => setTimeout(resolve, 300));
      realtime.emit("room", room);
    }
    return reply(room);
  }
  return reply({ ok: true });
});
const realtime = new Server(service, { cors: { origin: (origin, callback) => callback(null, true), credentials: true } });
await new Promise((resolve) => service.listen(0, "127.0.0.1", resolve));
const apiOrigin = `http://127.0.0.1:${service.address().port}`;
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const webPort = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
webOrigin = `http://127.0.0.1:${webPort}`;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, stdio: "ignore", env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: apiOrigin, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: "/socket.io" } });
const waitFor = async (check, label) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if (await check()) return; } catch { /* UI or Vite not ready yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
};
let browser;
try {
  await waitFor(async () => (await fetch(webOrigin)).ok, "Vite");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const initializeAudio = () => {
    localStorage.setItem("ktgame-token", "fixture-token");
    localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false }));
    window.turnTones = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) { window.turnTones += 1; return original.apply(this, args); };
  };
  await context.addInitScript(initializeAudio);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function begin(code) {
    await page.goto(`${webOrigin}/table/${code}`);
    await page.locator(".president-table").waitFor();
    await page.locator(".board-heading h2").click();
    assert.equal(await page.evaluate(() => window.turnTones), 0, "no cue during the previous turn's pause");
    const room = fixtures.get(code);
    room.pacing = null;
    const readyAt = Date.now();
    realtime.emit("room", room);
    await waitFor(async () => await page.evaluate(() => window.turnTones) === 2, "turn sound after pause");
    return readyAt;
  }
  const readyAt = await begin("NORMAL");
  const pass = () => page.locator(".president-self-zone").getByRole("button", { name: /^Passer/ });
  assert.equal(await pass().isDisabled(), false, "manual pass immediately available when the turn starts");
  await page.waitForTimeout(1900);
  assert.equal(actions.filter((entry) => entry.code === "NORMAL").length, 0, "no automatic pass before three seconds");
  const output = path.join(root, "docs", "previews");
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, "president-auto-pass.png"), fullPage: true });
  await waitFor(() => actions.some((entry) => entry.code === "NORMAL"), "automatic pass");
  assert.ok(actions.find((entry) => entry.code === "NORMAL").at - readyAt >= 2900);
  assert.equal(actions.find((entry) => entry.code === "NORMAL").action.type, "pass");
  await begin("REVLOW");
  await page.waitForTimeout(3300);
  assert.equal(actions.filter((entry) => entry.code === "REVLOW").length, 0, "2 can be beaten in revolution");
  assert.match(await page.locator(".president-requirement").innerText(), /en dessous de 2/);
  await page.locator(".president-card-hand button").first().click();
  await page.getByRole("button", { name: "Jouer la sélection", exact: true }).click();
  await waitFor(() => actions.some((entry) => entry.code === "REVLOW" && entry.action.type === "play"), "legal revolution response");
  await begin("REVTOP");
  await waitFor(() => actions.some((entry) => entry.code === "REVTOP" && entry.action.type === "pass"), "3 unbeatable in revolution");
  await begin("PAIR");
  await waitFor(() => actions.some((entry) => entry.code === "PAIR" && entry.action.type === "pass"), "not enough matching cards");
  await begin("MANUAL");
  await pass().click();
  assert.equal(await pass().isDisabled(), true, "pass is locked while server acknowledgement is pending");
  await page.waitForTimeout(3300);
  assert.equal(actions.filter((entry) => entry.code === "MANUAL").length, 1, "manual pass cancels automatic request");
  assert.equal(await page.evaluate(() => window.turnTones), 2, "no repeated cue on action response or socket update");
  const freshContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await freshContext.addInitScript(initializeAudio);
  // Automation grants activation implicitly; simulate a first visit until a real input.
  await freshContext.addInitScript(() => {
    let activated = false;
    Object.defineProperty(navigator, "userActivation", { configurable: true, value: { get hasBeenActive() { return activated; } } });
    window.addEventListener("pointerdown", () => { activated = true; }, true);
    window.addEventListener("keydown", () => { activated = true; }, true);
  });
  const firstVisit = await freshContext.newPage();
  firstVisit.on("pageerror", (error) => errors.push(error.message));
  await firstVisit.goto(`${webOrigin}/table/READY`);
  await firstVisit.locator(".president-table").waitFor();
  assert.equal(await firstVisit.evaluate(() => window.turnTones), 0, "browser blocks initial cue before an interaction");
  await firstVisit.locator(".board-heading h2").click();
  await waitFor(async () => await firstVisit.evaluate(() => window.turnTones) === 2, "initial cue retried on first interaction");
  await freshContext.close();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator(".president-table").isVisible());
  await page.screenshot({ path: path.join(output, "president-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS: President automatic/manual passes, three-second delay after pacing, normal/revolution ranks, combination size, turn audio without duplicates, desktop/mobile.");
} finally {
  await browser?.close();
  if (vite.exitCode === null) await new Promise((resolve) => { vite.once("exit", resolve); vite.kill(); });
  await new Promise((resolve) => realtime.close(resolve));
}
