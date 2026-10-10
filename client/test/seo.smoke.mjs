import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "../../server/node_modules/express/index.js";
import { registerPublicPages } from "../../server/src/services/public-pages.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const api = "https://api.ktga.me";
const [settings, games, help, catalog] = await Promise.all(["config", "games", "help", "patchnotes"].map(async (route) => { const response = await fetch(`${api}/api/${route}`); assert.equal(response.status, 200); return response.json(); }));
const notes = new Map();
for (const entry of catalog.notes) notes.set(entry.version, await (await fetch(`${api}/api/patchnotes/${entry.version}`)).json());
const output = path.join(root, "docs/previews/seo-20261007"); fs.mkdirSync(output, { recursive: true });
let server;
let origin = process.env.SEO_ORIGIN;
if (!origin) {
  const app = express();
  await registerPublicPages({ app, clientDist: path.join(root, "client/dist"), settings: () => settings, games: () => games, help: () => help, catalog: () => catalog, note: (version) => notes.get(version) });
  app.use(express.static(path.join(root, "client/dist"), { index: false }));
  app.use((_req, res) => res.sendStatus(404));
  server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const checks = [], errors = [];
try {
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const reader = await noJs.newPage();
  const routes = ["/", "/jeux", ...games.map((game) => `/jeux/${game.id}`), "/faq", "/guide", "/conditions", "/mentions-legales", "/confidentialite", "/cookies", "/parents", ...catalog.notes.map((note) => `/patchnotes?version=${note.version}`)];
  for (const route of routes) {
    const response = await reader.goto(origin + route); assert.equal(response.status(), 200, route);
    assert.ok((await reader.title()).startsWith(`${settings.siteName} - `));
    assert.equal(await reader.locator('meta[name="robots"]').getAttribute("content"), "index, follow");
    assert.ok((await reader.locator("#root").innerText()).length > 120, route);
    assert.ok((await reader.locator('link[rel="canonical"]').getAttribute("href")).startsWith("https://www.ktga.me/"));
    checks.push({ route, withoutJavaScript: true });
  }
  await reader.goto(origin + "/jeux");
  assert.equal(await reader.locator(".public-game-entry").count(), games.length);
  assert.ok(await reader.locator('.playing-card strong').filter({ hasText: "A" }).count() > 0);
  assert.equal((await reader.goto(origin + "/missing-seo-page")).status(), 404);
  assert.equal((await reader.goto(origin + "/patchnotes?version=unpublished")).status(), 404);
  assert.equal((await reader.goto(origin + "/profil")).headers()["x-robots-tag"], "noindex, follow");
  await noJs.close();

  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Europe/Brussels" });
  await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
  const page = await context.newPage(); await blocker.enableBlockingInPage(page);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => { if (entry.type() === "error" && !/401|404|CORS|ERR_FAILED/.test(entry.text()) && !entry.text().startsWith("Access to fetch")) errors.push(entry.text()); });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/jeux", "/jeux/yahtzee", "/jeux/texas-holdem", "/faq", "/guide", "/patchnotes"]) {
      await page.goto(origin + route, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1600);
      const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, text: document.querySelector("main")?.innerText.length, broken: [...document.images].filter((image) => image.complete && !image.naturalWidth && image.getAttribute("src")).map((image) => image.getAttribute("src")) }));
      assert.equal(state.overflow, false, `${route} at ${viewport.width}`); assert.ok(state.text > 120, route); assert.deepEqual(state.broken, [], route);
      if (route === "/jeux") assert.equal(await page.locator(".public-game-entry").count(), games.length, "Content blocker removed game entries");
      await page.screenshot({ path: path.join(output, `${process.env.SEO_ORIGIN ? "live" : "local"}-${viewport.width}-${route.replaceAll("/", "-").slice(1)}.png`), fullPage: false });
    }
  }
  if (!process.env.SEO_ORIGIN) {
    await page.setViewportSize({ width: 1200, height: 630 }); await page.goto(origin + "/jeux"); await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(root, "client/public/ktga-preview.png"), fullPage: false });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors, screenshots: output }, null, 2));
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
