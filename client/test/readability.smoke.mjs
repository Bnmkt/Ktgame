import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const directory = new URL(`../../docs/previews/readability-20261021/${Date.now()}/`, import.meta.url);
await fs.mkdir(directory, { recursive: true });
const whiteImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7a0AAAAASUVORK5CYII=";
const failures = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => failures.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/**", async route => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint.startsWith("/api/media/")) return route.continue();
    const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:5197", "Access-Control-Allow-Credentials": "true" };
    if (endpoint.startsWith("/api/game-images/")) return route.fulfill({ body: Buffer.from(whiteImage.split(",")[1], "base64"), contentType: "image/png", headers });
    const data = endpoint === "/api/games" ? [
      { id: "yahtzee", name: "Yahtzee", description: "Marque le plus de points apres 13 categories.", type: "dice", category: "score", minPlayers: 1, maxPlayers: 6, descriptiveImage: "/api/game-images/white.png", coverImage: "/api/game-images/white.png" },
      { id: "belote", name: "Belote", type: "cards", category: "score", minPlayers: 4, maxPlayers: 4 }
    ] : endpoint === "/api/friends" ? { friends: [] }
      : endpoint === "/api/community-events/carousel" ? { events: [] }
      : endpoint.startsWith("/api/locales/") ? { messages: {} } : [];
    await route.fulfill({ json: data, headers });
  });
  const origin = process.env.READABILITY_ORIGIN || "http://127.0.0.1:5197";
  await page.goto(`${origin}/test/fixtures/mascot-interface.html?view=lobby`);
  await page.locator(".game-card").first().waitFor();
  // White is the worst-case wallpaper for light text. Include bright card imagery too.
  await page.evaluate(image => {
    document.documentElement.dataset.siteWallpaper = "true";
    document.documentElement.style.setProperty("--site-image", `url("${image}")`);
  }, whiteImage);
  const ratios = [];
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await page.evaluate(() => {
      const rgb = color => {
        const values = color.match(/[\d.]+/g).map(Number);
        return color.startsWith("color(srgb ") ? values.map((value, i) => i < 3 ? value * 255 : value) : values;
      };
      const composite = (foreground, background, opacity = foreground[3] ?? 1) => foreground.slice(0, 3).map((value, i) => value * opacity + background[i] * (1 - opacity));
      const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
      const surface = composite(rgb(getComputedStyle(document.querySelector(".app-shell")).backgroundColor), [255, 255, 255]);
      const selectors = [".lounge-heading h1", ".lounge-heading .eyebrow", ".lounge-mode-label > span:last-child", ".section-title h2", ".section-title .muted", ".lobby-join-action button", ".lounge-categories .secondary"];
      const checks = selectors.map(selector => {
        const style = getComputedStyle(document.querySelector(selector));
        return { selector, ratio: contrast(rgb(style.color), composite(rgb(style.backgroundColor), surface)) };
      });
      const card = document.querySelector(".game-card");
      let cardSurface = rgb(getComputedStyle(card).backgroundColor);
      // Conservative bound: both decorative layers are entirely white at the text position.
      for (const selector of [".game-artwork-backdrop", ".game-artwork-glow"]) cardSurface = composite([255, 255, 255], cardSurface, Number(getComputedStyle(card.querySelector(selector)).opacity));
      checks.push({ selector: ".game-card p (white imagery)", ratio: contrast(rgb(getComputedStyle(card.querySelector("p")).color), cardSurface) });
      return { checks, overflow: document.documentElement.scrollWidth > innerWidth, bodyBackground: getComputedStyle(document.body).backgroundColor };
    });
    for (const check of result.checks) assert.ok(check.ratio >= 4.5, `${width}px ${check.selector}: ${check.ratio}`);
    assert.equal(result.overflow, false);
    assert.equal(result.bodyBackground, "rgba(0, 0, 0, 0)", "The body must not obscure the wallpaper");
    ratios.push({ width, ...result });
    await page.screenshot({ path: fileURLToPath(new URL(`white-${width}.png`, directory)), fullPage: true });
  }
  await page.getByRole("button", { name: "Jeux de cartes", exact: true }).click();
  await page.getByRole("heading", { name: "Belote", exact: true }).waitFor();
  assert.equal(await page.locator(".game-card").count(), 1);
  await page.getByRole("button", { name: "Tous les jeux", exact: true }).click();
  if (process.env.READABILITY_WALLPAPER) {
    await page.evaluate(source => document.documentElement.style.setProperty("--site-image", `url("${source}")`), process.env.READABILITY_WALLPAPER);
    await page.evaluate(async () => { const image = new Image(); image.src = getComputedStyle(document.documentElement).getPropertyValue("--site-image").slice(5, -2); await image.decode(); });
    for (const width of [1536, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: fileURLToPath(new URL(`casino-${width}.png`, directory)), fullPage: true });
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.siteWallpaper = "false"; });
  assert.equal(await page.locator(".app-shell").evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.evaluate(() => {
    document.documentElement.dataset.siteWallpaper = "true";
    document.querySelector(".app-shell").classList.add("room-app-shell", "table-fullscreen");
  });
  assert.equal(await page.locator(".app-shell").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(7, 8, 10)", "Fullscreen keeps its opaque game background");
  await page.goto(`${origin}/test/fixtures/mascot-interface.html`);
  await page.getByRole("button", { name: "Se connecter", exact: true }).waitFor();
  assert.equal(await page.locator(".entry-scene").evaluate(element => getComputedStyle(element, "::after").backgroundColor), "rgba(5, 17, 14, 0.86)");
  await page.screenshot({ path: fileURLToPath(new URL("login-mobile.png", directory)), fullPage: true });
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ directory: fileURLToPath(directory), ratios, filters: true, withoutWallpaperUnchanged: true, errors: failures }));
} finally { await browser.close(); }
