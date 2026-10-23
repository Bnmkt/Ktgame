import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/card-solid-20261023/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", (route) => route.fulfill({ json: { messages: {} } }));
  await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/card-solid.html`);
  const ace = page.getByRole("button", { name: "Jouer l'as" });
  await ace.waitFor();
  await page.waitForTimeout(700);
  const card = ace.locator(".playing-card");
  const geometry = await card.evaluate((node) => {
    const style = getComputedStyle(node), edge = node.querySelector('[data-card-edge="right"]');
    return { rotate: style.rotate, isolation: style.isolation, transformStyle: style.transformStyle, edge: getComputedStyle(edge).transform, width: node.offsetWidth, height: node.offsetHeight };
  });
  assert.notEqual(geometry.rotate, "none");
  assert.equal(geometry.transformStyle, "preserve-3d");
  assert.equal(geometry.isolation, "auto");
  assert.ok(geometry.edge.startsWith("matrix3d("));
  assert.equal(await card.locator(".card-solid-edge").count(), 4);
  for (const skin of ["premium-notched", "premium-starlight"]) {
    assert.equal(await page.locator(`[data-card-case="${skin}"] .card-solid-depth`).first().evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)", "clipped or filtered skins must not be obscured when CSS flattens their depth");
  }
  assert.ok(!(await page.locator('[data-card-case="private"]').innerHTML()).includes("PRIVATE_"), "hidden cards must never carry private values");
  assert.equal(await page.locator('[data-card-case="inline"] .card-solid-depth').count(), 0);
  assert.equal(await page.locator("canvas").count(), 0, "cards must not allocate WebGL canvases");
  await ace.hover();
  await page.waitForTimeout(250);
  assert.notEqual(await card.evaluate((node) => getComputedStyle(node).rotate), geometry.rotate);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const screenshot = await card.screenshot();
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    let light = 0, dark = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] > 210 && data[i + 1] > 200 && data[i + 2] > 180) light++; if (data[i] < 70 && data[i + 1] < 70 && data[i + 2] < 70) dark++; }
    return { light, dark };
  }, screenshot.toString("base64"));
  assert.ok(pixels.light > 2000 && pixels.dark > 30, "the face and printed value must be visible");
  const flight = page.waitForFunction(() => document.querySelector('[data-card-flight] .card-solid-depth'));
  await ace.click();
  await flight;
  await page.waitForTimeout(650);
  assert.equal(await page.locator("[data-card-flight]").count(), 0);
  assert.equal(await page.locator('[data-card-case="destination"] [data-card-track="ace"]').count(), 1);
  assert.equal(await page.locator('[data-card-case="destination"] [data-card-track="ace"]').evaluate((node) => node.style.visibility), "");
  const custom = page.locator('[data-card-case="fixture-inlay"] .playing-card').first();
  assert.equal(await custom.evaluate((node) => getComputedStyle(node).borderTopStyle), "double");
  await page.evaluate(() => { const style = document.createElement("style"); style.textContent = ".card-skin-fixture-inlay { border-color: rgb(0,255,60) !important; }"; document.body.append(style); });
  assert.equal(await custom.evaluate((node) => getComputedStyle(node).borderTopColor), "rgb(0, 255, 60)");
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["small-mobile", { width: 320, height: 740 }]]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.ok(await custom.evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration) <= .001));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), geometry, pixels, hiddenPrivacy: true, cardFlight: true, skins: true, errors }));
} finally { await browser.close(); }
