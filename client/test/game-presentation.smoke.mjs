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
const directory = path.join(root, "docs/previews/game-featured-20261010");
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
async function setup(viewport, { logged = false, admin = false, guests = true, ranked = false, closed = false, coverImage, descriptiveImage } = {}) {
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
  const requests = [], uploads = [];
  await page.route("**/api/**", (route) => {
    const key = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${key}`);
    const imageHeaders = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
    if (/\/api\/admin\/games\/yahtzee\/images\/(coverImage|descriptiveImage)$/.test(key)) {
      const bytes = route.request().postDataBuffer();
      const field = key.split("/").at(-1);
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      const expected = field === "coverImage" ? [1280, 560] : [960, 720];
      assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], expected);
      uploads.push({ field, bytes });
      fs.writeFileSync(path.join(directory, `crop-${viewport.width}-${field}.png`), bytes);
      return route.fulfill({ contentType: "application/json", headers: imageHeaders, body: JSON.stringify({ image: `/api/game-images/${field}.png`, width: expected[0], height: expected[1] }) });
    }
    if (key.startsWith("/api/game-images/")) return route.fulfill({ contentType: "image/png", headers: imageHeaders, body: uploads.at(-1)?.bytes ?? fs.readFileSync(path.join(root, "client/public/ktga-preview.png")) });
    let status = 200, data = [];
    if (key === "/api/config") data = { siteName: "KTGA.ME", featuredGameId: "yahtzee", guestAccessEnabled: guests };
    else if (key === "/api/games") data = games.map((game) => ({ ...game, ...(coverImage === undefined ? {} : { coverImage }), ...(descriptiveImage === undefined ? {} : { descriptiveImage }) }));
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
  return { page, context, requests, uploads };
}
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    let { page, context } = await setup(viewport);
    await page.goto(origin);
    await page.locator(".public-game-spotlight").waitFor();
    assert.equal(await page.locator(".public-game-entry").count(), 1);
    await page.waitForFunction(() => document.querySelector(".game-artwork-backdrop img")?.naturalWidth > 0);
    const featured = await page.locator(".public-game-featured").boundingBox();
    const grid = await page.locator(".public-games-featured").boundingBox();
    assert.ok(Math.abs(featured.x + featured.width / 2 - grid.x - grid.width / 2) < 2, "Featured game stays centered within the page content");
    if (name === "desktop") assert.ok(featured.width > featured.height * 2, "Featured game uses a horizontal format");
    await page.getByRole("link", { name: "Jouer", exact: true }).waitFor();
    assert.equal(await page.locator(".public-game-featured .public-game-pieces, .public-game-featured .die, .public-game-featured .playing-card").count(), 0);
    const heading = await page.locator(".public-game-featured h3").boundingBox();
    assert.ok(Math.abs(heading.x + heading.width / 2 - featured.x - featured.width / 2) < 2, "Featured title is centered independently of the metadata");
    assert.equal(await page.locator(".public-game-featured h3").evaluate((node) => getComputedStyle(node).color), "rgb(237, 203, 118)");
    if (name === "desktop") {
      const details = await page.locator(".public-game-featured .public-game-type").boundingBox();
      assert.ok(details.x >= heading.x + heading.width, "Game type and players sit to the right of the title");
    }
    await page.screenshot({ path: path.join(directory, `${name}-home.png`), fullPage: true });
    await page.getByRole("link", { name: "Tous les jeux", exact: true }).click();
    await page.getByRole("heading", { name: "Choisir un jeu", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".public-game-entry").length === 2);
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
    await page.locator(".public-game-featured h3").waitFor();
    assert.equal(await page.locator(".public-game-featured .public-game-pieces").count(), 0);
    if (coverImage === "N/A") await page.waitForFunction(() => document.querySelector('.public-game-featured img')?.naturalWidth > 0);
    assert.equal(await page.locator(".public-game-entry").count(), 1);
    await context.close();
  }
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const { page, context, uploads } = await setup(viewport, { logged: true, admin: true });
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
    for (const label of ["Image descriptive", "Bannière"]) {
      await page.locator(".game-media-field").filter({ has: page.locator("strong", { hasText: label }) }).getByRole("button", { name: "Modifier / recadrer", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${label} · Yahtzee`, exact: true });
      await dialog.getByLabel("Importer une image du jeu").setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
      await dialog.getByRole("alert").waitFor();
      await dialog.getByLabel("Importer une image du jeu").setInputFiles(path.join(root, "client/public/ktga-preview.png"));
      await dialog.getByRole("button", { name: "Appliquer le recadrage" }).waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector('.game-art-actions button:last-child')?.disabled);
      await dialog.getByRole("slider", { name: "Zoom du recadrage" }).fill("2");
      const crop = await dialog.getByRole("group", { name: "Zone de recadrage" }).boundingBox();
      await page.mouse.move(crop.x + crop.width / 2, crop.y + crop.height / 2);
      await page.mouse.down();
      await page.mouse.move(crop.x + crop.width / 2 + 30, crop.y + crop.height / 2 + 20, { steps: 4 });
      await page.mouse.up();
      const before = uploads.length;
      const box = await dialog.boundingBox();
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.down(); await page.mouse.move(2, 2, { steps: 4 }); await page.mouse.up();
      assert.equal(await dialog.count(), 1, "Dragging from the modal onto its overlay must not close it");
      await dialog.getByRole("slider", { name: "Zoom du recadrage" }).fill("0.5");
      assert.match(await dialog.locator("output").innerText(), /0\.50/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: path.join(directory, `${name}-${label === "Bannière" ? "cover" : "description"}-crop.png`) });
      await dialog.getByRole("button", { name: "Appliquer le recadrage" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(uploads.length, before + 1);
      const field = label === "Bannière" ? "coverImage" : "descriptiveImage";
      const pixel = await page.evaluate(async (url) => {
        const image = new Image(); image.crossOrigin = "anonymous"; image.src = url; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
        return [...context.getImageData(0, 0, 1, 1).data];
      }, `${origin}/api/game-images/${field}.png`);
      assert.deepEqual(pixel, [16, 27, 23, 255], "0.5x export fills the outside margins with the preview's opaque background");
    }
    await page.locator(".game-media-fields").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".game-media-fields .game-artwork-media img").count(), 2);
    await page.screenshot({ path: path.join(directory, `${name}-game-editor.png`) });
    await page.locator(".game-media-field").filter({ has: page.locator("strong", { hasText: "Bannière" }) }).getByRole("button", { name: "Modifier / recadrer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Bannière · Yahtzee", exact: true });
    const before = uploads.length;
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(uploads.length, before, "Cancel must not upload or replace the selected image");
    checks.push(`${name}: image modal, import, validation, drag, zoom, PNG output, cancellation and overlay guard`);
    await context.close();
  }
  {
    const { page, context } = await setup({ width: 390, height: 844 }, { coverImage: "N/A", descriptiveImage: "N/A" });
    await page.goto(origin);
    await page.locator(".public-game-featured h3").waitFor();
    assert.equal(await page.locator(".public-game-featured img, .public-game-featured .public-game-pieces").count(), 0);
    await page.getByRole("link", { name: "Jouer", exact: true }).waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
