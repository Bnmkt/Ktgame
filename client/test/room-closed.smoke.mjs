import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/room-inactivity-20261021/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", route => route.fulfill({ json: { messages: {} } }));
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/room-closed.html`);
    await page.getByRole("dialog", { name: "Table fermée pour inactivité" }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
    await page.getByRole("button", { name: "J’ai compris", exact: true }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), dismissal: true, errors }));
} finally { await browser.close(); }
