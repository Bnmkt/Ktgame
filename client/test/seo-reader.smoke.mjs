import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/seo-reader-20261022/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const notes = [
  { id: "one", version: "0.2.1", versionGroup: "0.2", title: "Les nouveautes du casino", summary: "Les parties classees et les niveaux.", status: "published", publishedAt: "2026-10-08T14:00:00Z", blocks: [{ id: "text", type: "paragraph", content: "Le detail de la version publique." }] },
  { id: "two", version: "0.2.0", versionGroup: "0.2", title: "La progression des joueurs", summary: "Des **profils** personnalises.", status: "published", publishedAt: "2026-10-01T14:00:00Z", blocks: [] },
  { id: "private", version: "0.3.0", versionGroup: "0.3", title: "Version privee", summary: "Brouillon reserve", status: "draft", blocks: [] }
];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/patchnotes" || path === "/api/admin/patchnotes") return route.fulfill({ json: { currentVersion: "0.2.1", notes: notes.filter((note) => path.startsWith("/api/admin/") || note.status === "published") } });
    if (path.startsWith("/api/patchnotes/") || path.startsWith("/api/admin/patchnotes/")) return route.fulfill({ json: notes.find((note) => path.endsWith(note.version) || path.endsWith(note.id)) });
    return route.fulfill({ json: { messages: {} } });
  });
  const fixture = `${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/seo-reader.html`;
  await page.goto(fixture);
  await page.getByRole("heading", { name: "Patchnotes et mises à jour", exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).search, "");
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://www.ktga.me/patchnotes");
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator(".public-casino-info").isVisible(), true);
  assert.equal(await page.locator('.public-casino-info a[href="/jeux/yahtzee"]').count(), 1);
  assert.equal(await page.locator('.public-casino-info a[href="/jeux/hidden"]').count(), 0);
  await page.locator(".patchnotes-archive").getByRole("link", { name: /0.2.1/ }).click();
  await page.getByText("Le detail de la version publique.", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).search, "?version=0.2.1");
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://www.ktga.me/patchnotes?version=0.2.1");
  assert.equal(await page.locator("h1").count(), 1);
  await page.getByRole("switch").check();
  await page.locator(".patchnotes-version-nav a").filter({ hasText: "0.3.0" }).click();
  await page.getByRole("heading", { name: "Version privee", exact: true }).waitFor();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, follow");
  await page.getByRole("switch").uncheck();
  await page.getByRole("heading", { name: "Patchnotes et mises à jour", exact: true }).waitFor();
  assert.equal(await page.getByText("Brouillon reserve", { exact: true }).count(), 0);
  await page.goto(fixture);
  await page.getByRole("heading", { name: "Patchnotes et mises à jour", exact: true }).waitFor();
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ archiveStable: true, releaseNavigation: true, privatePreview: true, blocker: Boolean(process.env.BLOCKER_MODULE), screenshots: fileURLToPath(output), errors }));
} finally { await browser.close(); }
