import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/admin-personalization-20261020/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", route => route.fulfill({ json: { messages: {} }, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5197", "Access-Control-Allow-Credentials": "true" } }));
  await page.goto("http://127.0.0.1:5197/test/fixtures/admin-personalization.html");
  await page.getByRole("heading", { name: "Paramètres du casino" }).waitFor();
  await page.locator(".settings-directory nav").getByRole("button", { name: "Médiathèque", exact: true }).click();
  const weight = page.getByRole("spinbutton", { name: "Poids maximal par image (Mo)" });
  assert.equal(await weight.inputValue(), "3");
  await weight.fill("12");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  assert.equal(await page.evaluate(() => window.savedSettings.mediaUploadMaxMb), 12);
  await page.screenshot({ path: new URL("media-desktop.png", output).pathname.replace(/^\/(?=[A-Za-z]:)/, ""), fullPage: true });
  await page.locator(".settings-directory nav").getByRole("button", { name: "Future rubrique" }).click();
  await page.getByRole("heading", { name: "Future rubrique" }).waitFor();
  await page.locator(".settings-directory nav").getByRole("button", { name: "Logos et application" }).click();
  await page.getByRole("checkbox", { name: "Afficher un cercle autour du logo" }).uncheck();
  assert.equal(await page.locator(".branding-logo-frame .cosmetic-icon-unframed").count(), 1);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  assert.equal(await page.evaluate(() => window.savedSettings.siteIconFramed), false);
  const shape = await page.locator('section[aria-label="Icônes"] .cosmetic-icon').evaluateAll(icons => icons.map(icon => { const css = getComputedStyle(icon); return { radius: css.borderRadius, border: css.borderTopWidth, background: css.backgroundColor, width: icon.getBoundingClientRect().width }; }));
  assert.notEqual(shape[0].border, "0px");
  for (const icon of shape.slice(1)) { assert.equal(icon.radius, "0px"); assert.equal(icon.border, "0px"); assert.equal(icon.background, "rgba(0, 0, 0, 0)"); assert.equal(icon.width, shape[0].width); }
  await page.screenshot({ path: new URL("icons-desktop.png", output).pathname.replace(/^\/(?=[A-Za-z]:)/, ""), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Rubrique des paramètres" }).selectOption("media");
  assert.equal(await weight.inputValue(), "12");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: new URL("media-mobile.png", output).pathname.replace(/^\/(?=[A-Za-z]:)/, ""), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Settings navigation, live upload limit, framed icons and mobile layout passed", output.pathname);
} finally { await browser.close(); }
