import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mascotGiftPacks, mascotEquippedKeys } from "../src/features/shop/mascot-gift.js";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/mascot-gift-20261023/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const catalog = JSON.parse(await fs.readFile(`${process.env.TEMP}/ktga-shop-public.json`, "utf8").catch(async () => JSON.stringify(await (await fetch("https://api.ktga.me/api/shop")).json())));
const packs = mascotGiftPacks(catalog);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript((items) => { window.giftFixtureCatalog = items; }, catalog);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  let claim = null, posts = 0;
  const images = new Map();
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": request.headers().origin || "http://localhost:5197", "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/api/me/mascot-gift") {
      if (request.method() === "GET") return route.fulfill({ json: { claim, packs: claim ? [] : packs }, headers });
      const { packId } = request.postDataJSON(); posts++;
      const pack = packs.find((pack) => pack.id === packId);
      assert.ok(pack);
      claim = { packId, claimedAt: new Date().toISOString() };
      const user = await page.evaluate(() => window.giftFixtureUser());
      for (const type of Object.keys(mascotEquippedKeys)) user.cosmetics[type] = [];
      for (const item of pack.items) user.cosmetics[item.type].push(item.value);
      return route.fulfill({ json: { claim, user }, headers });
    }
    if (path.startsWith("/api/media/")) {
      if (!images.has(path)) images.set(path, fetch(`https://api.ktga.me${path}`).then(async (response) => ({ contentType: response.headers.get("content-type"), body: Buffer.from(await response.arrayBuffer()) })));
      return route.fulfill({ ...await images.get(path), headers });
    }
    return route.fulfill({ json: { messages: {} }, headers });
  });
  const url = `${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/mascot-gift.html`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: "Choisis ton pack de mascotte offert", exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.locator(".mascot-gift-choices > button").count(), packs.length);
  await dialog.getByRole("button", { name: /^Lucky/ }).click();
  assert.equal(posts, 0);
  await dialog.getByRole("button", { name: "Aperçu du profil", exact: true }).click();
  const profile = page.locator(".public-profile-modal"); await profile.waitFor();
  assert.equal(posts, 0, "previews must never claim the pack");
  await profile.getByRole("button", { name: "Fermer le profil", exact: true }).click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Plus tard", exact: true }).click();
  await page.locator('.mascot-gift-recall').waitFor();
  assert.equal(await page.locator("[data-gift-pending]").getAttribute("data-gift-pending"), "false");
  await page.getByRole("button", { name: "Choisir mon pack", exact: true }).click();
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["small-mobile", { width: 320, height: 740 }]]) {
    await page.setViewportSize(viewport);
    await dialog.getByRole("button", { name: /^Midnight/ }).click();
    await Promise.all([...images.values()]);
    await page.waitForTimeout(300);
    const cover = packs.find((pack) => pack.id === "midnight").items.find((item) => item.type === "profileBanners")?.design?.surfaceImage;
    if (cover) assert.ok(await dialog.locator(".profile-cosmetic-preview").evaluate((node, path) => getComputedStyle(node).backgroundImage.includes(path), cover));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no page overflow`);
    assert.ok(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 2), `${name}: no modal overflow`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
  }
  await dialog.getByRole("button", { name: "Recevoir le pack Midnight", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(posts, 1);
  const user = await page.evaluate(() => window.giftFixtureUser());
  assert.equal(user.tokens, 1500);
  for (const item of packs.find((pack) => pack.id === "midnight").items) assert.ok(user.cosmetics[item.type].includes(item.value));
  assert.equal(user.cosmetics.equipped.icon, "chip", "the real equipment must remain unchanged");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('[data-gift-pending="false"]'));
  assert.equal(await page.locator(".mascot-gift-dialog, .mascot-gift-recall").count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), packs: packs.map((pack) => pack.id), previews: true, deferred: true, posts, equipmentPreserved: true, errors }));
} finally { await browser.close(); }
