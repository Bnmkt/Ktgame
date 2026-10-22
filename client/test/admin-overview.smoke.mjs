import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { overviewData } from "./fixtures/admin-overview-data.js";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/admin-overview-20261022/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], requested = [];
  let fail = false;
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/overview") {
      const days = Number(url.searchParams.get("days")); requested.push(days);
      if (fail) return route.fulfill({ status: 503, json: { error: "Actualisation indisponible" } });
      return route.fulfill({ json: overviewData(days) });
    }
    return route.fulfill({ json: { messages: {} } });
  });
  await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/admin-overview.html`);
  await page.locator('.overview-console[aria-busy="false"]').waitFor();
  await page.getByRole("heading", { name: "Vue d’ensemble", exact: true }).waitFor();
  assert.equal(await page.locator(".overview-metrics .overview-metric").count(), 4);
  assert.equal(await page.locator(".overview-action-list > button").count(), 8);
  assert.equal(await page.locator(".overview-chart-day").count(), 7);
  assert.equal(await page.locator(".overview-metric").filter({ hasText: "Nouvelles inscriptions" }).locator("strong").textContent(), "0");
  await page.getByText("4 date(s) d’inscription inconnue(s), exclue(s) des périodes.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "30 jours", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".overview-chart-day").length === 30);
  await page.getByText("Du 23 sept. au 22 oct. inclus · Europe/Brussels", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".overview-chart-day").length === 1);
  await page.getByRole("button", { name: "7 jours", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".overview-chart-day").length === 7);
  await page.getByRole("button", { name: "Toutes les tables", exact: true }).click();
  assert.equal(await page.getByRole("status").textContent(), "rooms");
  await page.getByRole("button", { name: /3 bug\(s\) à suivre/ }).click();
  assert.equal(await page.getByRole("status").textContent(), "bugs");
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} must not overflow`);
    assert.equal(await page.locator(".overview-live").isVisible(), true);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
  }
  fail = true;
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".overview-chart-day").count(), 7);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), requested, allActionsVisible: true, retainedOnError: true, blocker: Boolean(process.env.BLOCKER_MODULE), errors }));
} finally { await browser.close(); }
