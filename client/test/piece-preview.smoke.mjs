import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/piece-preview-20261023/${Date.now()}/`, import.meta.url);
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
  const base = process.env.UI_URL || "http://localhost:5197";
  await page.goto(`${base}/test/fixtures/piece-preview.html`);
  await page.waitForFunction(() => document.querySelectorAll('[data-dice-solid="ready"]').length === 3);
  const turn = page.locator(".piece-preview-card-turn");
  const die = page.locator('.piece-preview .dice-solid-scene');
  const tableDie = page.locator('[data-piece-case="table"] .dice-solid-scene').first();
  const before = { card: await turn.evaluate((node) => getComputedStyle(node).transform), die: await die.getAttribute("data-dice-pose"), table: await tableDie.getAttribute("data-dice-pose") };
  await page.waitForTimeout(500);
  assert.notEqual(await turn.evaluate((node) => getComputedStyle(node).transform), before.card);
  assert.notEqual(await die.getAttribute("data-dice-pose"), before.die);
  assert.equal(await tableDie.getAttribute("data-dice-pose"), before.table, "game dice must remain still");
  assert.equal(await turn.count(), 1, "one card, with two sides, not two separate cards");
  assert.deepEqual(await page.locator(".piece-preview-card-face").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backfaceVisibility)), ["hidden", "hidden"]);
  assert.deepEqual(await page.locator(".piece-preview-card-face").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transformStyle)), ["flat", "flat"]);
  assert.equal(await turn.locator('.card-solid-depth, .card-solid-edge').count(), 0, "the rotating specimen must not contain a second pair of extruded cards");
  const pixels = (node) => {
    const data = node.getContext("2d").getImageData(0, 0, node.width, node.height).data;
    let red = 0, dark = 0, filled = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 100) continue; filled++; if (data[i] > 85 && data[i] > data[i + 1] * 1.8 && data[i] > data[i + 2] * 1.5) red++; if (Math.max(data[i], data[i + 1], data[i + 2]) < 70) dark++; }
    return { red, dark, filled };
  };
  assert.ok((await die.locator("canvas").evaluate(pixels)).filled > 2000);
  const oneCanvas = tableDie.locator("canvas");
  await page.getByRole("checkbox", { name: "Personnaliser la face 1", exact: true }).check();
  await page.getByRole("checkbox", { name: "Afficher le point de la face 1", exact: true }).uncheck();
  await tableDie.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const hidden = await oneCanvas.evaluate(pixels);
  assert.ok(hidden.red > 1000, "the first face must actually be red on the WebGL texture");
  const six = page.locator('[data-piece-case="table"] .die').nth(1);
  assert.equal(await six.evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
  const fallback = await page.locator('.dice-solid-palette[data-die-face="1"] .pip').first().evaluate((node) => getComputedStyle(node).display);
  assert.equal(fallback, "none");
  await page.getByRole("checkbox", { name: "Afficher le point de la face 1", exact: true }).check();
  await tableDie.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const shown = await oneCanvas.evaluate(pixels);
  assert.ok(shown.red < hidden.red, "showing the light pip must replace red pixels in the face");
  await page.getByRole("checkbox", { name: "Personnaliser la face 1", exact: true }).uncheck();
  await tableDie.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  assert.equal((await oneCanvas.evaluate(pixels)).red, 0, "disabling the customization restores the original first face");
  await page.locator(".piece-check-gallery").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  for (const [name, viewport] of [["desktop", { width: 1280, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["small-mobile", { width: 320, height: 740 }]]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no overflow`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator(".piece-check-gallery").scrollIntoViewIfNeeded();
  await turn.evaluate((node) => { node.getAnimations()[0].pause(); node.getAnimations()[0].currentTime = 6000; });
  await page.locator(".piece-check-gallery").screenshot({ path: fileURLToPath(new URL("card-reverse.png", output)) });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  const paused = await die.getAttribute("data-dice-pose");
  const frames = await page.evaluate(() => window.piecePreviewStats().renderedFrames);
  await page.waitForTimeout(250);
  assert.equal(await die.getAttribute("data-dice-pose"), paused);
  assert.equal((await page.evaluate(() => window.piecePreviewStats())).renderedFrames, frames);
  assert.equal(await turn.evaluate((node) => node.getAnimations()[0].playState), "paused");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => { const spacer = document.createElement("div"); spacer.style.height = "2500px"; document.body.append(spacer); window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(250);
  const offscreenFrames = await page.evaluate(() => window.piecePreviewStats().renderedFrames);
  await page.waitForTimeout(250);
  assert.equal((await page.evaluate(() => window.piecePreviewStats())).renderedFrames, offscreenFrames);
  assert.equal(await turn.evaluate((node) => node.getAnimations()[0].playState), "paused");
  await page.goto(`${base}/test/fixtures/shop-interface.html`);
  await page.locator('.catalog-visual-diceSkins [data-dice-solid="ready"]').waitFor();
  assert.ok(await page.locator('.catalog-visual-diceSkins .die').evaluate((node) => node.offsetWidth >= 110));
  assert.equal(await page.locator(".catalog-visual-cardSkins .piece-preview-card-turn").count(), 1);
  await page.getByRole("button", { name: "Aperçu : Cartes rubis", exact: true }).click();
  await page.getByRole("button", { name: "Profil public · Cartes rubis", exact: true }).click();
  const profile = page.locator(".public-profile-modal");
  await profile.waitFor();
  assert.equal(await profile.locator(".piece-preview-card-turn").count(), 1);
  await profile.locator('[data-dice-solid="ready"]').waitFor();
  const specimen = profile.locator('.piece-preview-card-turn');
  const specimenStage = profile.locator('[data-piece-preview="cardSkins"]');
  await specimenStage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  for (const angle of [0, 45, 180, 225]) {
    await specimen.evaluate((node, degrees) => { const spin = node.getAnimations()[0]; spin.pause(); spin.currentTime = degrees / 360 * 12000; }, angle);
    await page.waitForTimeout(50);
    const surfaces = await specimen.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [...new Set(document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2).map(element => element.closest('.playing-card')).filter(element => element && node.contains(element)))].map(element => element.classList.contains('card-back'));
    });
    assert.deepEqual(surfaces, [angle >= 180], `profile at ${angle}deg must expose only the intended side`);
    await specimenStage.screenshot({ path: fileURLToPath(new URL(`single-card-${angle}.png`, output)) });
  }
  await page.screenshot({ path: fileURLToPath(new URL("public-profile.png", output)), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const fits = await profile.locator(".piece-preview").evaluateAll((nodes) => nodes.every((node) => {
      const stage = node.getBoundingClientRect(), piece = node.firstElementChild.getBoundingClientRect();
      return piece.left >= stage.left - 4 && piece.right <= stage.right + 4;
    }));
    assert.ok(fits, `public profile/${width}: pieces must fit their tiles`);
    await page.screenshot({ path: fileURLToPath(new URL(`public-profile-${width}.png`, output)), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), hidden, shown, rotation: true, offscreenPaused: true, reducedMotion: true, errors }));
} finally { await browser.close(); }
