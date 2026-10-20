import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { registerMediaRoutes } from "../../server/src/services/media-library.js";
const require = createRequire(new URL("../../server/package.json", import.meta.url)), express = require("express");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-media-browser-"));
const rows = [[1672, 941], [1086, 1448], [1024, 1024], [941, 1672], [400, 1200], [512, 512], [1600, 300], [941, 1672]].map(([width, height], index) => {
  const id = `${(index + 1).toString(16).repeat(64)}.png`;
  return { id, image: `/api/media/${id}`, width, height, mime: "image/png", name: index === 1 ? "Portrait de jeu avec un titre long pour tester les retours à la ligne" : `Image ${index + 1}`, alt: "", bytes: 100, archived: false };
});
await fs.writeFile(path.join(directory, "catalog.json"), JSON.stringify(rows));
const app = express(); app.use(express.json());
const store = await registerMediaRoutes({ app, directory, auth: (req, _res, next) => { req.auth = { id: "test" }; req.backOfficeUser = { admin: true }; next(); }, requireBackOffice: (_req, _res, next) => next() });
app.get("/api/locales/:locale", (_req, res) => res.json({ messages: {} }));
const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = new URL(`../../docs/previews/media-library-20261020/${Date.now()}/`, import.meta.url); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) { const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href); await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page); }
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/media/")) {
      const index = rows.findIndex(row => url.pathname === row.image), row = rows[index];
      if (!row || index === 7) return route.fulfill({ status: 404 });
      return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${row.width}" height="${row.height}" viewBox="0 0 ${row.width} ${row.height}"><rect width="100%" height="100%" fill="#4e325b"/><rect x="10%" y="10%" width="80%" height="80%" rx="18" fill="none" stroke="#e8c777" stroke-width="20"/></svg>` });
    }
    const headers = { "Access-Control-Allow-Origin": request.headers().origin || "http://127.0.0.1:5197", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const response = await fetch(origin + url.pathname + url.search, { method: request.method(), headers: { "Content-Type": "application/json" }, ...(request.postData() ? { body: request.postData() } : {}) });
    return route.fulfill({ status: response.status, body: await response.text(), contentType: response.headers.get("Content-Type") || "application/json", headers });
  });
  await page.goto("http://127.0.0.1:5197/test/fixtures/media-library.html");
  await page.locator(".media-library-item").nth(7).waitFor();
  async function geometry() {
    const cards = await page.locator(".media-library-grid .media-library-item").evaluateAll(items => items.map(item => {
      const frame = item.querySelector(".media-thumbnail").getBoundingClientRect(), image = item.querySelector("img")?.getBoundingClientRect(), label = item.querySelector("strong").getBoundingClientRect(), card = item.getBoundingClientRect();
      return { height: frame.height, fills: Math.abs(frame.width - item.querySelector("button").getBoundingClientRect().width) < 1, inside: !image || image.top >= frame.top - 1 && image.bottom <= frame.bottom + 1 && image.left >= frame.left - 1 && image.right <= frame.right + 1, labelBelow: label.top >= frame.bottom, contained: frame.bottom <= card.bottom };
    }));
    for (const card of cards) { assert.equal(card.height, 120); assert.ok(card.fills && card.inside && card.labelBelow && card.contained); }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await geometry();
  await page.screenshot({ path: fileURLToPath(new URL("grid-desktop.png", output)), fullPage: true });
  await page.getByRole("button", { name: "Image 1", exact: false }).first().click();
  await page.getByLabel("Tags séparés par des virgules").fill("Collection spéciale, mascottes");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText("Enregistré", { exact: true }).waitFor();
  assert.deepEqual(store.get(rows[0].id).tags, ["collection spéciale", "mascottes"]);
  await page.getByRole("button", { name: "Fermer les détails" }).click();
  await page.getByRole("combobox", { name: "Filtrer par tag" }).selectOption("tag:collection spéciale");
  assert.equal(await page.locator(".media-library-item").count(), 1);
  await page.getByRole("combobox", { name: "Filtrer par tag" }).selectOption("all");
  await page.getByRole("button", { name: "Sélectionner", exact: true }).click();
  await page.getByLabel("Sélectionner cette page", { exact: true }).check();
  await page.getByLabel("Tags à appliquer").fill("campagne 2026");
  await page.getByRole("button", { name: "Appliquer les tags" }).click();
  await page.getByText("Tags mis à jour sur 8 image(s).", { exact: true }).waitFor();
  assert.ok(store.list().every(row => row.tags.includes("campagne 2026")));
  await page.getByRole("combobox", { name: "Filtrer par tag" }).selectOption("tag:campagne 2026");
  await page.getByLabel("Action sur les tags").selectOption("remove");
  await page.getByRole("button", { name: "Appliquer les tags" }).click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Filtrer par tag"]').value === "all");
  assert.ok(store.list().every(row => !row.tags.includes("campagne 2026")));
  assert.ok(store.get(rows[0].id).tags.includes("mascottes"));
  await page.setViewportSize({ width: 390, height: 844 });
  await geometry();
  await page.screenshot({ path: fileURLToPath(new URL("tags-mobile.png", output)), fullPage: true });
  await page.getByRole("button", { name: "Ouvrir le sélecteur" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator(".media-library-item").nth(7).waitFor();
  await geometry();
  await dialog.locator(".media-library-open").first().click();
  await dialog.getByRole("button", { name: "Choisir", exact: true }).click();
  assert.equal(await page.evaluate(() => window.selectedMedia), rows[0].id);
  assert.deepEqual(errors, []);
  console.log("Media previews, individual and bulk tags, filtering and mobile picker passed", fileURLToPath(output));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
