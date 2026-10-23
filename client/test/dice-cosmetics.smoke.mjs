import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/dice-cosmetics-20261023/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", (route) => route.fulfill({ json: { messages: {} } }));
  await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/dice-solid.html?cosmetics`);
  await page.waitForFunction(() => document.querySelectorAll('[data-dice-solid="ready"]').length === 11, null, { timeout: 10000 });
  const motion = page.locator('[data-dice-case="fixture-inlay"]');
  const flow = page.locator('[data-dice-case="fixture-river"]');
  const canvas = motion.locator("canvas").first();
  const pixels = (node) => {
    const data = node.getContext("2d").getImageData(0, 0, node.width, node.height).data;
    let red = 0, green = 0, filled = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 100) continue;
      filled += 1;
      if (data[i] > 140 && data[i + 1] < 120 && data[i + 2] < 150) red += 1;
      if (data[i] < 140 && data[i + 1] > 150 && data[i + 2] < 140) green += 1;
    }
    return { red, green, filled };
  };
  const border = await canvas.evaluate(pixels);
  assert.ok(border.red > 30, "the cosmetic border must exist on the 3D texture itself");
  assert.ok((await motion.locator(".dice-solid-scene").first().evaluate((node) => getComputedStyle(node).filter)).includes("drop-shadow"));
  assert.ok(await canvas.evaluate((node) => node.getAnimations().length > 0), "the actual studio motion must survive the room render budget");
  const bitmap = await canvas.evaluate((node) => node.toDataURL());
  const transform = await canvas.evaluate((node) => getComputedStyle(node).transform);
  await page.waitForTimeout(350);
  assert.notEqual(await canvas.evaluate((node) => getComputedStyle(node).transform), transform);
  assert.equal(await canvas.evaluate((node) => node.toDataURL()), bitmap, "CSS motion must not repaint the WebGL texture");
  const flowCanvas = flow.locator("canvas").first();
  const before = await flowCanvas.evaluate((node) => node.toDataURL());
  await page.waitForTimeout(350);
  assert.notEqual(await flowCanvas.evaluate((node) => node.toDataURL()), before, "animated gradients must move on the 3D face");
  for (const [name, viewport] of [["desktop", { width: 1280, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["small-mobile", { width: 320, height: 740 }]]) {
    await page.setViewportSize(viewport);
    await motion.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);
    const width = await motion.locator(".dice-solid-control").first().evaluate((node) => node.offsetWidth);
    assert.ok(width >= (viewport.width > 760 ? 96 : viewport.width > 320 ? 76 : 58), `${name}: dice must be larger (${width})`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
  }
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = ".die-skin-fixture-inlay { border-color: rgb(0,255,60); }";
    document.body.append(style);
  });
  await page.waitForTimeout(250);
  assert.ok((await canvas.evaluate(pixels)).green > 30, "editing a studio CSS block must refresh existing dice");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(250);
  assert.ok(await canvas.evaluate((node) => node.getAnimations().every((animation) => animation.playState !== "running")));
  const reduced = await flowCanvas.evaluate((node) => node.toDataURL());
  const stats = await page.evaluate(() => window.diceFixtureStats());
  await page.waitForTimeout(250);
  assert.equal(await flowCanvas.evaluate((node) => node.toDataURL()), reduced);
  assert.equal((await page.evaluate(() => window.diceFixtureStats())).renderedFrames, stats.renderedFrames);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(200);
  assert.ok(await canvas.evaluate((node) => node.getAnimations().some((animation) => animation.playState === "running")));
  await page.evaluate(() => { const spacer = document.createElement("div"); spacer.style.height = "2500px"; document.body.append(spacer); window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(250);
  const paused = await page.evaluate(() => window.diceFixtureStats());
  await page.waitForTimeout(250);
  assert.equal((await page.evaluate(() => window.diceFixtureStats())).renderedFrames, paused.renderedFrames, "offscreen dice must stop rendering");
  assert.ok(await canvas.evaluate((node) => node.getAnimations().every((animation) => animation.playState !== "running")));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), border, nativeMotion: true, gradientMotion: true, liveCss: true, reducedMotion: true, offscreenPaused: true, errors }));
} finally { await browser.close(); }
