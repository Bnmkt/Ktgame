import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "../../server/node_modules/express/index.js";
import { PRIVACY_VERSION } from "../src/privacy/consent.js";
import { defaultPublicSettings } from "../src/config/site.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory = path.join(root, "docs/previews/game-presentation-20261010");
fs.mkdirSync(directory, { recursive: true });
const app = express();
app.use(express.static(path.join(root, "client/dist"), { index: false }));
app.use((_req, res) => res.sendFile(path.join(root, "client/dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const games = [
  { id: "yahtzee", name: "Yahtzee", type: "dice", minPlayers: 1, maxPlayers: 6, description: "Treize catégories, cinq dés et une dernière chance.", audience: "solo-multi", category: "score", complexity: "easy", coverImage: "/ktga-preview.png", descriptiveImage: "/ktga-preview.png" },
  { id: "421", name: "421", type: "dice", minPlayers: 2, maxPlayers: 6, description: "La meilleure combinaison remporte la manche.", audience: "multi", category: "score", complexity: "easy" }
];
let browser; const errors = [], checks = [];
async function setup(viewport, { logged = false, admin = false, guests = true, ranked = false, closed = false, coverImage } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((version) => {
    localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version, chosenAt: Date.now(), enabled: false }));
    localStorage.setItem("ktga-install-choice", "ignored");
  }, PRIVACY_VERSION);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  await blocker.enableBlockingInPage(page);
  let user = logged ? { id: "player", pseudo: "Bnmkt", admin, tokens: 1000, profile: { favoriteGames: ["421"] }, cosmetics: { equipped: {} } } : null;
  const requests = [];
  await page.route("**/api/**", (route) => {
    const key = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${key}`);
    let status = 200, data = [];
    if (key === "/api/config") data = { siteName: "KTGA.ME", featuredGameId: "yahtzee", guestAccessEnabled: guests };
    else if (key === "/api/games") data = coverImage === undefined ? games : games.map((game) => ({ ...game, coverImage }));
    else if (key === "/api/admin") data = { users: [], games, shop: [], achievements: [], pricing: {}, permissions: {}, overview: {}, settings: { ...defaultPublicSettings, featuredGameId: "yahtzee" } };
    else if (key === "/api/me") { status = user ? 200 : 401; data = user ?? { error: "Anonymous" }; }
    else if (key === "/api/table-entry/ABC123") { status = closed ? 404 : 200; data = closed ? { error: "Cette partie est terminée." } : { code: "ABC123", hostName: "Bnmkt", requiresPassword: true, ranked }; }
    else if (key === "/api/auth/guest") { user = { id: "guest", pseudo: "Testeur", guest: true, tokens: 1000, profile: {}, cosmetics: { equipped: {} } }; data = { token: "fixture-only", user }; }
    else if (key === "/api/rooms/ABC123" || key === "/api/rooms/ABC123/join") { status = 403; data = { error: "Mot de passe de table requis." }; }
    else if (key === "/api/friends") data = { friends: [] };
    else if (key === "/api/community-events/carousel") data = { events: [] };
    else if (key === "/api/tribunal/availability") data = { available: false };
    else if (key === "/api/notifications") data = [];
    else if (key === "/api/ranked") data = { games: [] };
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } });
  });
  await page.route(/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com)\//, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  return { page, context, requests };
}
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    let { page, context } = await setup(viewport);
    await page.goto(origin);
    await page.locator(".public-game-spotlight").waitFor();
    assert.equal(await page.locator(".public-game-entry").count(), 1);
    await page.waitForFunction(() => document.querySelector(".game-artwork-backdrop img")?.naturalWidth > 0);
    await page.screenshot({ path: path.join(directory, `${name}-home.png`), fullPage: true });
    await page.getByRole("link", { name: "Tous les jeux", exact: true }).click();
    await page.getByRole("heading", { name: "Choisir un jeu", exact: true }).waitFor();
    assert.equal(await page.locator(".public-game-entry").count(), 2);
    assert.equal(await page.locator(".public-game-entry .game-artwork-media img").count(), 1);
    assert.equal(await page.locator(".public-game-entry .public-game-pieces").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(directory, `${name}-catalog.png`), fullPage: true });
    await context.close();

    ({ page, context } = await setup(viewport, { logged: true }));
    await page.goto(origin);
    await page.getByRole("button", { name: "Tous les jeux", exact: true }).waitFor();
    assert.equal(await page.locator(".game-card").count(), 1);
    await page.getByRole("button", { name: "Tous les jeux", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".game-card").length === 2 && document.querySelector(".game-card h3")?.innerText.includes("421"));
    assert.match(await page.locator(".game-card").first().innerText(), /421/, "Favorites remain first in the full selection");
    assert.equal(await page.locator(".game-card .game-artwork-backdrop img").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(directory, `${name}-lobby.png`), fullPage: true });
    await context.close();

    const invitation = await setup(viewport); ({ page, context } = invitation);
    await page.goto(`${origin}/table/ABC123`);
    await page.getByRole("button", { name: /Pas encore de compte/ }).waitFor();
    await page.screenshot({ path: path.join(directory, `${name}-invitation.png`), fullPage: true });
    await page.getByRole("button", { name: /Pas encore de compte/ }).click();
    await page.getByLabel("Pseudo temporaire").fill("Testeur");
    await page.getByRole("button", { name: "Rejoindre la partie", exact: true }).click();
    await page.getByLabel("Code d’accès de la table", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/table/ABC123");
    assert.ok(invitation.requests.includes("POST /api/auth/guest"));
    assert.ok(invitation.requests.includes("GET /api/rooms/ABC123"));
    await context.close();
    checks.push(`${name}: featured, full catalog, favorites, images/fallback, blocker, guest invitation and password step`);
  }
  for (const options of [{ guests: false }, { ranked: true }, { closed: true }]) {
    const { page, context } = await setup({ width: 1280, height: 900 }, options);
    await page.goto(`${origin}/table/ABC123`);
    await page.getByRole("button", { name: "Se connecter", exact: true }).waitFor();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole("button", { name: /Pas encore de compte/ }).count(), 0);
    await context.close();
  }
  for (const coverImage of ["N/A", "/missing-image.webp"]) {
    const { page, context } = await setup({ width: 390, height: 844 }, { coverImage });
    await page.goto(origin);
    await page.locator(".public-game-entry .public-game-pieces").waitFor();
    assert.equal(await page.locator(".public-game-entry").count(), 1);
    await context.close();
  }
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const { page, context } = await setup(viewport, { logged: true, admin: true });
    await page.goto(`${origin}/admin`);
    const section = async (value, title) => {
      if (name === "mobile") await page.locator(".admin-mobile-nav select").selectOption(value);
      else await page.locator(".admin-sidebar").getByRole("button", { name: new RegExp(`^${title}`) }).click();
    };
    await page.locator(".admin-content .admin-dashboard").waitFor();
    await section("settings", "Paramètres");
    await page.getByRole("combobox", { name: /^Jeux à l’affiche/ }).selectOption("421");
    await page.screenshot({ path: path.join(directory, `${name}-settings.png`), fullPage: true });
    await section("games", "Jeux");
    await page.getByRole("row").filter({ hasText: "yahtzee" }).getByRole("button", { name: "Modifier", exact: true }).click();
    await page.locator(".game-media-fields").getByRole("textbox", { name: /Image descriptive/ }).fill("/ktga-preview.png");
    await page.locator(".game-media-fields").getByRole("textbox", { name: /Bannière/ }).fill("/ktga-preview.png");
    await page.locator(".game-media-fields").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".game-media-fields .game-artwork-media img").count(), 2);
    await page.screenshot({ path: path.join(directory, `${name}-game-editor.png`) });
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
