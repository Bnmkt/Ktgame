import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/one-face-image-20261023/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  const imagePath = `/api/media/${"b".repeat(64)}.png`;
  let image, uploads = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": request.headers().origin || "http://localhost:5197", "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/api/admin/media/limits") return route.fulfill({ json: { maxMb: 5 }, headers });
    if (path === "/api/admin/media" && request.method() === "POST") { uploads++; image = request.postDataBuffer(); return route.fulfill({ json: { image: imagePath }, headers }); }
    if (path === imagePath) return route.fulfill({ contentType: "image/png", body: image, headers });
    return route.fulfill({ json: { messages: {} }, headers });
  });
  await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/one-face-studio.html`, { waitUntil: "domcontentloaded" });
  const section = page.locator(".designer-section").filter({ has: page.getByRole("heading", { name: "Face 1 personnalisée", exact: true }) });
  await section.getByRole("checkbox", { name: "Personnaliser la face 1", exact: true }).check();
  assert.equal(await section.getByRole("button", { name: "Importer une image", exact: true }).count(), 1, "the image controls must live inside the first-face section");
  await section.getByRole("button", { name: "Importer une image", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Image de la face 1 · Mon de", exact: true });
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelector('.game-art-file')?.disabled === false);
  const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256; const context = canvas.getContext("2d"); context.fillStyle = "#15f040"; context.fillRect(0, 0, 256, 256); return canvas.toDataURL().split(",")[1]; });
  await dialog.locator('input[type="file"]').setInputFiles({ name: "face-one.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await dialog.getByRole("button", { name: "Appliquer le recadrage", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(uploads, 1);
  const item = await page.evaluate(() => window.oneFaceItem());
  assert.equal(item.design.oneImage, imagePath);
  assert.equal(item.css, "background-color: #fff2a9;", "uploading the first face must preserve the base skin CSS");
  assert.equal(item.design.surfaceImage, "");
  assert.equal(await section.getByRole("img", { name: "Image de la face 1", exact: true }).count(), 1);
  const result = page.locator('[data-one-case="result"]');
  await result.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const green = await result.locator("canvas").first().evaluate((node) => {
    const data = node.getContext("2d").getImageData(0, 0, node.width, node.height).data;
    let green = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 100 && data[i + 1] > 100 && data[i + 1] > data[i] * 1.15 && data[i + 1] > data[i + 2] * 1.2) green++;
    return green;
  });
  assert.ok(green > 1000, "the uploaded image must be painted on the real first face");
  assert.equal(await page.locator('.dice-solid-palette:not([data-die-face])').first().evaluate((node) => getComputedStyle(node).backgroundImage), "none");
  await section.getByRole("button", { name: "Recadrer · Image de la face 1", exact: true }).click();
  await dialog.getByRole("group", { name: "Zone de recadrage", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    await section.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await section.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
  }
  await section.getByRole("button", { name: "Retirer l’image · Image de la face 1", exact: true }).click();
  assert.equal((await page.evaluate(() => window.oneFaceItem())).design.oneImage, "");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), uploads, green, cropped: true, baseSkinPreserved: true, errors }));
} finally { await browser.close(); }
