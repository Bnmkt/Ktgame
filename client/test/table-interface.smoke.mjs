import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGameState, applyAction } from "../../server/src/games/engines.js";
import { scoreCulDeChouette } from "../../server/src/games/engines/cul-de-chouette.js";

const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? path.join(dependencies, "playwright/index.mjs")).href);
const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE ?? path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")).href);
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const socket = createServer().listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = `http://127.0.0.1:${port}`;
const output = new URL(`../../docs/previews/table-interface-20261027/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const vite = spawn(process.execPath, [path.join(root, "client/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: origin, VITE_SOCKET_URL: origin, VITE_SOCKET_PATH: "/table-test-socket" }, windowsHide: true, stdio: "pipe" });
let viteLog = "";
vite.stdout.on("data", (data) => { viteLog += data; });
vite.stderr.on("data", (data) => { viteLog += data; });
let browser;
const errors = [], requests = [], checks = [];
let room;
const players = Array.from({ length: 9 }, (_, index) => ({ id: index ? `p${index}` : "me", pseudo: index ? `Bot ${index}` : "Bnmkt", tokens: 10000, isBot: index > 0, cosmetics: { equipped: { icon: index ? "star" : "chip", diceSkin: index ? "premium-ruby" : "table-inlay", cardSkin: index ? "classic-red" : "premium-gold" } }, gameTitle: index ? undefined : { title: "Nocturne" } }));
function prepare(game, count = game === "texas-holdem" ? 6 : 2) {
  const state = createGameState(game, players.slice(0, count), { buyIn: 1500, bigBlind: 100, maximumBet: 1500 });
  state.currentPlayerIndex = 0;
  if (game === "yahtzee") { state.dice = [1, 3, 5, 2, 6]; state.rollsLeft = 2; }
  if (game === "cul-de-chouette") { state.dice = [2, 2, 4]; state.rollsLeft = 2; state.lastRoll = { ...scoreCulDeChouette(state.dice), playerId: "me", pending: true }; }
  if (game === "farkle") state.dice = [1, 3, 5, 2, 6, 4];
  room = { code: game, gameId: game, name: "La table de Bnmkt", ownerId: "me", stake: game === "texas-holdem" ? 1500 : 100, players: state.players, maxPlayers: 9, state };
  return room;
}
function payload() {
  const result = structuredClone(room);
  // Match server privacy: no opponent values sent to the browser.
  if (result.state.hands) for (const [id, hand] of Object.entries(result.state.hands)) if (id !== "me" && !result.state.shownPlayerIds?.includes(id)) result.state.hands[id] = hand.map(() => null);
  delete result.state.deck;
  return result;
}
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (attempt === 99) throw new Error(viteLog);
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await blocker.enableBlockingInPage(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/action")) {
      const action = route.request().postDataJSON(); requests.push(action);
      try { room.state = applyAction(room.state, "me", action); }
      catch (error) { await route.fulfill({ status: 400, json: { error: error.message } }); return; }
    }
    await route.fulfill({ json: url.pathname.startsWith("/api/rooms/") ? payload() : url.pathname === "/api/friends" ? { friends: [] } : { messages: {} } });
  });
  async function open(game, count) {
    prepare(game, count);
    await page.goto(`${origin}/test/fixtures/table-interface.html?game=${game}`);
    await page.locator(".table-hud").waitFor();
    if (game !== "texas-holdem") {
      await page.locator(".dice-throw-tray").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.dice-throw-tray .die')].every((node) => node.dataset.diceSolid === "ready"));
      await page.waitForTimeout(950);
    } else await page.waitForTimeout(800);
  }
  async function noOverflow(label) {
    const layout = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth, shell: document.querySelector(".table-interface").scrollWidth }));
    assert.ok(layout.page <= layout.viewport, `${label}: horizontal overflow ${JSON.stringify(layout)}`);
  }
  for (const game of ["farkle", "yahtzee", "cul-de-chouette", "texas-holdem"]) {
    await page.setViewportSize({ width: 1672, height: 941 });
    await open(game);
    assert.ok(await page.locator(".table-hud").isVisible(), "HUD survives content blocking");
    if (game !== "texas-holdem") {
      const dice = page.locator(".dice-throw-tray .die");
      assert.equal(await dice.count(), game === "farkle" ? 6 : game === "yahtzee" ? 5 : 3);
      assert.equal(await dice.first().getAttribute("class").then((value) => value.includes("die-skin-table-inlay")), true);
      const canvas = dice.first().locator("canvas");
      const colored = await canvas.evaluate((node) => {
        const pixels = node.getContext("2d").getImageData(0, 0, node.width, node.height).data;
        return pixels.some((value, index) => index % 4 === 3 && value > 100);
      });
      assert.ok(colored, "Three.js dice must contain rendered pixels");
      const pose = await dice.first().locator(".dice-solid-scene").getAttribute("data-dice-pose");
      await dice.first().click();
      assert.equal(await dice.first().getAttribute("aria-pressed"), "true");
      assert.equal(await dice.first().locator(".dice-solid-scene").getAttribute("data-dice-pose"), pose, "selection must preserve 3D pose");
    } else {
      assert.equal(await page.locator(".poker-seat").count(), 6);
      assert.equal(await page.locator(".poker-seat .card-back").count(), 10);
      assert.equal(await page.locator(".poker-local-hand .card-solid-edge").count(), 8);
      assert.equal(await page.locator(".poker-local-hand .playing-card").first().evaluate((node) => getComputedStyle(node).transformStyle), "preserve-3d");
    }
    for (const [name, viewport] of [["desktop", { width: 1672, height: 941 }], ["laptop", { width: 1280, height: 720 }], ["tablet", { width: 820, height: 1180 }], ["mobile", { width: 390, height: 844 }], ["small", { width: 320, height: 740 }]]) {
      await page.setViewportSize(viewport);
      if (game !== "texas-holdem") await page.locator(".dice-throw-tray").scrollIntoViewIfNeeded();
      else await page.locator(".poker-local-hand").scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      if (game !== "texas-holdem") {
        await page.waitForFunction(() => [...document.querySelectorAll('.dice-throw-tray canvas')].every((node) => node.getContext('2d').getImageData(0, 0, node.width, node.height).data.some((value, i) => i % 4 === 3 && value > 100)));
      }
      await noOverflow(`${game}/${name}`);
      if (game === "yahtzee") assert.ok(await page.locator(".table-score-sheet").isVisible(), "the playable score sheet must stay available on mobile");
      await page.screenshot({ path: fileURLToPath(new URL(`${game}-${name}.png`, output)), fullPage: true });
    }
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.getByRole("button", { name: "Plein écran", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".table-fullscreen"));
    await noOverflow(`${game}/fullscreen`);
    assert.ok(await page.locator(".table-board-heading").isVisible());
    await page.screenshot({ path: fileURLToPath(new URL(`${game}-fullscreen.png`, output)), fullPage: true });
    await page.getByRole("button", { name: "Réduire", exact: true }).click();
    checks.push(`${game}: layouts, blocker, selection, 3D, fullscreen`);
  }
  // Exercise the real Room handlers against the unchanged game engines.
  await open("yahtzee");
  await page.locator('.dice-mode-toggle input').check();
  while (await page.locator('.dice-throw-tray .die[aria-pressed="true"]').count()) await page.locator('.dice-throw-tray .die[aria-pressed="true"]').first().click();
  await page.locator(".dice-throw-tray .die").first().click();
  await page.getByRole("button", { name: /Lancer les dés/ }).click();
  await page.waitForFunction(() => document.querySelector('.table-action-bar button')?.getAttribute('aria-busy') === 'false');
  assert.deepEqual(requests.at(-1).keepIndexes, [0]);
  assert.equal(room.state.dice[0], 1);
  await page.locator(".table-sheet-choice").last().click();
  await page.getByRole("button", { name: /^Valider \+/ }).click();
  await page.waitForTimeout(150);
  assert.equal(requests.at(-1).type, "score");
  assert.ok(room.state.scores.me.chance >= 5);
  await open("cul-de-chouette");
  await page.getByRole("button", { name: "Valider la combinaison", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(room.state.scores.me, 32);
  await open("farkle");
  room.state.turnScore = 500;
  await page.locator(".dice-throw-tray .die").first().click();
  await page.getByRole("button", { name: /Marquer la sélection/ }).click();
  await page.waitForTimeout(150);
  assert.equal(room.state.turnScore, 600);
  await page.getByRole("button", { name: /Encaisser/ }).click();
  await page.waitForTimeout(150);
  assert.equal(room.state.scores.me, 600);
  await open("texas-holdem");
  assert.equal(await page.getByRole("button", { name: "Relancer", exact: true }).isEnabled(), true, "the displayed minimum raise must be immediately actionable");
  await page.locator(".table-bet-options > summary").click();
  assert.ok(await page.locator(".table-bet-options .bet-mouse-controls").first().isVisible());
  await page.getByRole("button", { name: /^Suivre/ }).click();
  await page.waitForTimeout(150);
  assert.equal(requests.at(-1).type, "call");
  assert.equal(room.state.streetBets.me, 100);
  await open("texas-holdem");
  await page.getByRole("spinbutton", { name: "Relancer à", exact: true }).fill("300");
  await page.getByRole("button", { name: "Relancer", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(requests.at(-1).amount, 300);
  assert.equal(room.state.streetBets.me, 300);
  await open("texas-holdem", 9);
  await noOverflow("poker/nine-seats");
  await page.screenshot({ path: fileURLToPath(new URL("texas-holdem-nine-seats.png", output)), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow("poker/nine-seats-small");
  await page.screenshot({ path: fileURLToPath(new URL("texas-holdem-nine-seats-small.png", output)), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.ok(await page.locator(".table-panel summary > svg").first().evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration) <= .001));
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL("results.json", output), JSON.stringify({ blocker: "Ghostery (EasyList + EasyPrivacy)", checks, requests, errors }, null, 2));
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), checks, actions: requests.length, errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, viteLog: viteLog.slice(-3000), game: room?.gameId }));
  throw error;
} finally {
  await browser?.close();
  vite.kill();
}
