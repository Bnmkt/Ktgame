import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "../../server/node_modules/express/index.js";
import { PRIVACY_VERSION } from "../src/privacy/consent.js";
import { defaultPublicSettings } from "../src/config/site.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tools = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(tools, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(tools, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory = path.join(root, "docs/previews/game-halo-20261012", String(Date.now()));
fs.mkdirSync(directory, { recursive: true });
const app = express();
app.use(express.static(path.join(root, "client/dist"), { index: false }));
app.use((_req, res) => res.sendFile(path.join(root, "client/dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const game = { id: "yahtzee", name: "Yahtzee", type: "dice", minPlayers: 1, maxPlayers: 6, description: "Treize catégories et cinq dés.", category: "score", complexity: "easy", coverImage: "/ktga-preview.png" };
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const [name, viewport, guest] of [["desktop", { width: 1440, height: 1000 }, false], ["mobile-guest", { width: 390, height: 844 }, true]]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(version => {
      localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version, chosenAt: Date.now(), enabled: false }));
      localStorage.setItem("ktga-install-choice", "ignored");
    }, PRIVACY_VERSION);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await blocker.enableBlockingInPage(page);
    await page.route("**/api/**", route => {
      const key = new URL(route.request().url()).pathname;
      const responses = {
        "/api/me": { id: "player", pseudo: "Testeur", guest, tokens: 1000, profile: { favoriteGames: [] }, cosmetics: { equipped: {} } },
        "/api/config": { ...defaultPublicSettings, featuredGameId: "yahtzee" },
        "/api/games": [game], "/api/friends": { friends: [] }, "/api/community-events/carousel": { events: [] },
        "/api/tribunal/availability": { available: false }, "/api/ranked": { games: [] }, "/api/ranked/history": { rows: [] }
      };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(key.startsWith("/api/locales/") ? { messages: {} } : responses[key] ?? []), headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } });
    });
    await page.route(/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com)\//, route => route.fulfill({ contentType: "text/javascript", body: "" }));
    await page.goto(origin);
    const card = page.locator(".game-grid .game-card").first();
    await card.waitFor();
    await card.locator(".game-artwork-soft-edge > img:not(.game-artwork-glow)").evaluate(img => img.decode());
    assert.equal(await card.locator(".game-artwork-glow").evaluate(img => getComputedStyle(img).filter), "blur(18px)");
    assert.equal(await card.locator(".game-artwork-soft-edge > img:not(.game-artwork-glow)").evaluate(img => getComputedStyle(img).filter), "none");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await card.screenshot({ path: path.join(directory, `${name}.png`) });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ errors, directory, result: "Sharp game images with image-based halo for players and guests" }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
