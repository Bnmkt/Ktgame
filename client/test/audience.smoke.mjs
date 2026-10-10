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
const snapshots = {};
for (const key of ["config", "games", "help", "patchnotes"]) {
  const response = await fetch(`https://api.ktga.me/api/${key}`);
  assert.equal(response.status, 200); snapshots[key] = await response.json();
}
const output = path.join(root, "docs/previews/audience-20261007");
fs.mkdirSync(output, { recursive: true });
const app = express();
await registerPublicPages({ app, clientDist: path.join(root, "client/dist"), settings: () => snapshots.config, games: () => snapshots.games, help: () => snapshots.help, catalog: () => snapshots.patchnotes, note: () => null });
app.use(express.static(path.join(root, "client/dist"), { index: false }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = process.env.AUDIENCE_ORIGIN || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const grant = { version: "2026-09-27", audienceVersion: "2026-10-07", chosenAt: Date.now(), ageConfirmed: true, enabled: false, audience: true };
const checks = [], errors = [];
async function fixture({ choice, minor = false, status = 401, blocked = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (choice) await context.addInitScript((value) => localStorage.setItem("ktga-privacy-choice", JSON.stringify(value)), choice);
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = url.pathname.replace(/^\/api\//, "");
    let code = 200, body = snapshots[key] || {};
    if (key === "me") { code = minor ? 200 : status; body = minor ? { id: "minor-fixture", username: "Private Child", minor: { restricted: true } } : { error: "Anonymous fixture" }; }
    if (["shop", "notifications", "me/notifications", "me/notifications/inbox", "me/favorites"].includes(key)) body = [];
    await route.fulfill({ status: code, contentType: "application/json", headers: { "Access-Control-Allow-Origin": new URL(origin).origin, "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify(body) });
  });
  // No testing data is transmitted to Google, even when testing the live site.
  const requests = [];
  await context.route(/https:\/\/[^/]*(google-analytics\.com|googletagmanager\.com)\//, async (route) => {
    if (new URL(route.request().url()).pathname === "/gtm.js") { await route.fulfill({ contentType: "text/javascript", body: "" }); return; }
    requests.push(route.request().url());
    if (route.request().url().includes("/gtag/js")) await route.fulfill({ contentType: "text/javascript", body: "window.__ktgaTagFixtureLoaded=true;" });
    else await route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  if (blocked) { const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch); await blocker.enableBlockingInPage(page); }
  return { context, page, requests };
}
async function commands(page) { return page.evaluate(() => (window.dataLayer || []).map((item) => Array.from(item))); }
async function settle(page, url) { await page.goto(origin + url); await page.waitForTimeout(700); }
try {
  const first = await fixture();
  await settle(first.page, "/faq");
  assert.equal(first.requests.length, 0);
  assert.equal(await first.page.locator(".privacy-choice-panel").count(), 1);
  for (const width of [1440, 390]) {
    await first.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    assert.equal(await first.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await first.page.screenshot({ path: path.join(output, `consent-${width}.png`) });
  }
  await first.page.getByRole("button", { name: "Tout refuser", exact: true }).click();
  assert.equal(first.requests.length, 0);
  await first.page.getByRole("button", { name: "Mes préférences", exact: true }).click();
  const dialog = first.page.getByRole("dialog");
  await dialog.getByLabel("Mesure d’audience Google Analytics", { exact: false }).check();
  await dialog.getByLabel("J'ai au moins 13 ans", { exact: false }).check();
  await dialog.getByRole("button", { name: "Enregistrer mes choix", exact: true }).click();
  await first.page.waitForFunction(() => window.__ktgaTagFixtureLoaded);
  assert.equal(first.requests.length, 1);
  let queue = await commands(first.page);
  assert.equal(queue.filter((item) => item[0] === "event").length, 1);
  assert.equal(queue.find((item) => item[0] === "event")[2].page_location, "https://www.ktga.me/faq");
  const saved = await first.page.evaluate(() => JSON.parse(localStorage.getItem("ktga-privacy-choice")));
  assert.equal(saved.enabled, false); assert.equal(saved.audience, true);
  await first.page.evaluate(() => { document.cookie = "_ga=fixture; Path=/; SameSite=Lax"; });
  await first.page.getByRole("button", { name: "Mes préférences", exact: true }).click();
  await first.page.getByRole("dialog").getByRole("button", { name: "Tout refuser", exact: true }).click();
  assert.equal(await first.page.evaluate(() => window["ga-disable-G-YK0459SVPW"]), true);
  assert.equal(await first.page.evaluate(() => document.cookie.includes("_ga=")), false);
  checks.push("Explicit independent consent, refusal, withdrawal, desktop/mobile layout");
  await first.context.close();

  for (const state of [
    { name: "Legacy navigation consent", choice: { ...grant, audience: undefined } },
    { name: "Restricted minor", choice: grant, minor: true },
    { name: "Identity service unavailable", choice: grant, status: 503 },
    { name: "Private profile", choice: grant, url: "/profil" },
    { name: "Private admin", choice: grant, url: "/admin" },
    { name: "Sensitive URL", choice: grant, url: "/faq?email=PRIVATE_SENTINEL" },
    { name: "Expired consent", choice: { ...grant, chosenAt: Date.now() - 181 * 86400000 } },
  ]) {
    const f = await fixture(state); await settle(f.page, state.url || "/faq");
    assert.equal(f.requests.length, 0, state.name); checks.push(state.name); await f.context.close();
  }
  const safe = await fixture({ choice: grant });
  await settle(safe.page, "/jeux/yahtzee?unused=PRIVATE_SENTINEL");
  queue = await commands(safe.page);
  assert.ok(!JSON.stringify(queue).includes("PRIVATE_SENTINEL"));
  assert.equal(queue.find((item) => item[0] === "event")[2].page_location, "https://www.ktga.me/jeux/yahtzee");
  checks.push("Curated page views omit URL parameters"); await safe.context.close();
  const blocked = await fixture({ blocked: true });
  await settle(blocked.page, "/faq");
  assert.equal(await blocked.page.locator(".privacy-choice-panel").isVisible(), true);
  await blocked.page.getByRole("button", { name: "Tout refuser", exact: true }).click();
  assert.equal(blocked.requests.length, 0); checks.push("Consent remains usable with Ghostery");
  await blocked.context.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ origin, checks, errors, screenshots: output }, null, 2));
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
