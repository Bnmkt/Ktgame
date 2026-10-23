import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/dice-solid-20261023/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", (route) => route.fulfill({ json: { messages: {} } }));
  await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/dice-solid.html`);
  const settled = async (count) => {
    await page.locator(".dice-throw-tray").scrollIntoViewIfNeeded();
    await page.waitForFunction((n) => document.querySelectorAll('.dice-solid-scene[data-dice-motion="settled"]').length === n, count, { timeout: 10000 });
  };
  await settled(6);
  assert.equal(await page.locator(".dice-solid-scene > canvas").count(), 6);
  const results = await page.locator(".dice-solid-scene").evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.diceResult)));
  assert.deepEqual(results, [1, 2, 3, 4, 5, 6]);
  // Check the rendered pixels, rather than just the existence of scene nodes.
  const image = await page.locator(".dice-throw-surface").screenshot();
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ivory = 0, dark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 160 && pixels[i + 1] > 150 && pixels[i + 2] > 120) ivory += 1;
      if (pixels[i] < 40 && pixels[i + 1] < 40 && pixels[i + 2] < 40) dark += 1;
    }
    return { ivory, dark, width: canvas.width, height: canvas.height };
  }, image.toString("base64"));
  assert.ok(pixels.ivory > 300, "dice must really render, not just have DOM nodes");
  assert.ok(pixels.dark > 100, "pips and edges must render");
  const first = page.locator(".dice-solid-scene").first();
  const settledTransform = await first.getAttribute("data-dice-pose");
  await page.getByRole("button", { name: "Relancer les six faces" }).click();
  await page.waitForFunction(() => document.querySelector('.dice-solid-scene[data-dice-motion="rolling"]'));
  await page.waitForTimeout(120);
  assert.notEqual(await first.getAttribute("data-dice-pose"), settledTransform);
  await settled(6);
  assert.notEqual(await first.getAttribute("data-dice-pose"), settledTransform, "the resting orientation must change even when the rolled value is unchanged");
  // Selecting a die must not trigger a new throw.
  await page.getByRole("button", { name: "Die: 1", exact: true }).or(page.getByRole("button", { name: "Dé : 1", exact: true })).click();
  assert.equal(await first.getAttribute("data-dice-motion"), "settled");
  assert.equal(await page.locator('.die[aria-pressed="true"]').count(), 1);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["small-mobile", { width: 320, height: 740 }]]) {
    await page.setViewportSize(viewport);
    for (const game of ["farkle", "421", "cul-de-chouette"]) {
      await page.getByRole("combobox", { name: "Jeu", exact: true }).selectOption(game);
      await settled(game === "farkle" ? 6 : 3);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}/${game} must not overflow`);
      assert.equal(await page.locator(".dice-scoreboard li").count(), 6);
      assert.ok(await page.locator(".dice-score-self").isVisible());
      const scoreBox = await page.locator(".dice-scoreboard").boundingBox();
      const trayBox = await page.locator(".dice-throw-tray").boundingBox();
      assert.ok(scoreBox.y + scoreBox.height <= trayBox.y, "scores must not overlap dice");
      if (game === "farkle" && viewport.width < 761) {
        assert.equal(await page.locator(".farkle-combo-guide").getAttribute("open"), null);
        await page.locator(".farkle-combo-guide summary").click();
        assert.equal(await page.locator(".farkle-combo-guide").getAttribute("open"), "");
        await page.locator(".farkle-combo-guide summary").click();
      }
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-${game}.png`, output)), fullPage: true });
    }
  }
  await page.getByRole("combobox", { name: "Jeu", exact: true }).selectOption("421");
  await settled(3);
  await page.getByRole("button", { name: "Dé : 4", exact: true }).click();
  const heldPose = await first.getAttribute("data-dice-pose");
  const heldCanvas = await first.locator("canvas").elementHandle();
  await page.getByRole("button", { name: "Relancer les autres", exact: true }).click();
  await settled(3);
  assert.equal(await first.getAttribute("data-dice-pose"), heldPose, "held dice keep their resting orientation");
  assert.ok(await heldCanvas.evaluate((canvas) => canvas.isConnected), "a kept die must not be remounted");
  await page.getByRole("combobox", { name: "Apparence" }).selectOption("classic-charcoal");
  assert.ok(await page.locator(".dice-solid-palette.die-skin-classic-charcoal").count());
  const skinColors = await page.locator(".dice-solid-palette").first().evaluate((node) => ({ body: getComputedStyle(node).backgroundImage, pip: getComputedStyle(node.querySelector(".pip")).backgroundColor }));
  assert.ok(skinColors.body.includes("51, 56, 61"));
  assert.equal(skinColors.pip, "rgb(246, 234, 208)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Relancer les six faces" }).click();
  await settled(3);
  const transform = await first.getAttribute("data-dice-pose");
  await page.waitForTimeout(200);
  assert.equal(await first.getAttribute("data-dice-pose"), transform);
  const stats = await page.evaluate(() => window.diceFixtureStats());
  assert.equal(stats.contexts, 1, "all dice must share one WebGL context");
  assert.equal(stats.scheduled, false, "the renderer must stop after the throw");
  await page.waitForTimeout(250);
  const idleStats = await page.evaluate(() => window.diceFixtureStats());
  assert.equal(idleStats.renderedFrames, stats.renderedFrames, "idle dice must not keep rendering");
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/dice-solid.html?themes`);
  await page.locator('.dice-solid-scene[data-dice-result="6"]').first().waitFor();
  for (const tray of await page.locator(".dice-throw-tray").all()) {
    await tray.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const label = await tray.locator("strong").first().textContent();
    assert.equal(await tray.locator('[data-dice-solid="ready"]').count(), 6);
    const nonblank = await tray.locator(".dice-solid-scene > canvas").evaluateAll((nodes) => nodes.every((canvas) => {
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      let filled = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 100) filled += 1;
      let edgePixels = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[x * 4 + 3] > 20) edgePixels += 1;
        if (data[((canvas.height - 1) * canvas.width + x) * 4 + 3] > 20) edgePixels += 1;
      }
      return filled > canvas.width * canvas.height * .2 && edgePixels === 0;
    }));
    assert.ok(nonblank, `${label}: every themed die must have visible pixels`);
    await tray.screenshot({ path: fileURLToPath(new URL(`theme-${label}.png`, output)) });
  }
  await page.screenshot({ path: fileURLToPath(new URL("themes.png", output)), fullPage: true });
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === "webgl2" || type === "webgl") return null;
      return original.call(this, type, ...args);
    };
  });
  await fallback.route("**/api/**", (route) => route.fulfill({ json: { messages: {} } }));
  await fallback.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/dice-solid.html`);
  await fallback.waitForTimeout(1000);
  assert.equal(await fallback.locator('[data-dice-solid="ready"]').count(), 0);
  assert.ok(await fallback.locator(".die > .pip").first().isVisible(), "a device without WebGL must keep readable dice");
  await fallback.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), results, pixels, skinColors, blocker: Boolean(process.env.BLOCKER_MODULE), errors }));
} finally { await browser.close(); }
