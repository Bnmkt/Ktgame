import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_THEME, normalizeTheme, validateTheme } from "../src/features/theme/config.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/theme-effects-20261021/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const initial = { ...structuredClone(DEFAULT_THEME), id: "custom", name: "Casino", backgroundImage: `/api/media/${"a".repeat(64)}.png` };
let catalog = { version: 1, activeId: initial.id, themes: [initial], appearance: initial, revision: "initial" };
const writes = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on("pageerror", error => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:5197", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, PUT, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (endpoint.startsWith("/api/media/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><pattern id="p" width="50" height="50" patternUnits="userSpaceOnUse"><path fill="#e8c777" d="M0 0h50v50H0z"/><path fill="#5fb5ad" d="M0 0h25v25H0zM25 25h25v25H25z"/></pattern></defs><path fill="url(#p)" d="M0 0h600v600H0z"/></svg>', headers });
    if (endpoint === "/api/admin/themes") {
      if (request.method() === "PUT") {
        const draft = request.postDataJSON(); writes.push(draft);
        catalog = { ...catalog, themes: draft.themes.map(validateTheme), activeId: draft.activeId, revision: String(writes.length) };
        if (draft.apply) catalog.appearance = draft.activeId === DEFAULT_THEME.id ? DEFAULT_THEME : catalog.themes.find(row => row.id === draft.activeId);
      }
      return route.fulfill({ json: catalog, headers });
    }
    return route.fulfill({ json: { messages: {} }, headers });
  });
  await page.goto("http://127.0.0.1:5197/test/fixtures/theme-effects.html");
  await page.getByRole("heading", { name: "Thèmes du site" }).waitFor();
  const navigation = page.getByRole("navigation", { name: "Composants du thème" });
  await navigation.getByRole("button", { name: "Lisibilité", exact: true }).click();
  const opacity = page.getByRole("spinbutton", { name: "Opacité du voile", exact: true });
  await opacity.fill("60");
  await page.getByRole("spinbutton", { name: "Flou du décor intérieur" }).fill("8");
  await page.getByRole("checkbox", { name: "Aperçu sur cette page" }).check();
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--site-content-opacity")), "0.6");
  assert.equal(await page.locator("main").evaluate(element => getComputedStyle(element, "::before").backdropFilter), "blur(8px)");
  assert.equal(await page.locator("main").evaluate(element => getComputedStyle(element).filter), "none");
  assert.equal(await page.locator("main").evaluate(element => getComputedStyle(element).backdropFilter), "none", "Fixed dialogs must not be trapped by the page surface");
  await page.screenshot({ path: fileURLToPath(new URL("readability-desktop.png", output)), fullPage: true });
  await navigation.getByRole("button", { name: "Ombre du contenu", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Opacité de l'ombre" }).fill("55");
  await page.getByRole("spinbutton", { name: "Décalage horizontal" }).fill("-12");
  await page.locator(".theme-color-code").fill("#123456");
  await page.locator(".theme-color-code").blur();
  assert.match(await page.locator(".theme-sample-body").evaluate(element => getComputedStyle(element).boxShadow), /-12px 8px 32px/);
  await page.getByRole("button", { name: "Version en ligne", exact: true }).click();
  assert.equal(await page.locator(".theme-sample").evaluate(element => element.style.getPropertyValue("--site-content-opacity")), "0.94");
  await page.getByRole("button", { name: "Modifications", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("status").getByText("Thèmes enregistrés sans modifier l'apparence publiée.").waitFor();
  assert.equal(catalog.appearance.tokens.contentOpacity, .94);
  await page.getByRole("button", { name: "Appliquer au site", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.getByText("Thème appliqué au site.", { exact: true }).waitFor();
  assert.equal(catalog.appearance.tokens.contentOpacity, .6);
  assert.equal(catalog.appearance.tokens.contentShadowColor, "#123456");
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--site-content-opacity")), "0.6");
  await page.getByRole("button", { name: "Rétablir cette rubrique", exact: true }).click();
  assert.equal(await page.getByRole("spinbutton", { name: "Opacité de l'ombre" }).inputValue(), "0");
  await navigation.getByRole("button", { name: "Lisibilité", exact: true }).click();
  await page.getByRole("button", { name: "Rétablir : Opacité du voile", exact: true }).click();
  assert.equal(await opacity.inputValue(), "94");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: fileURLToPath(new URL("readability-mobile.png", output)), fullPage: true });
  const { backgroundLayout, ...legacy } = DEFAULT_THEME;
  await page.locator('input[type="file"]').setInputFiles({ name: "legacy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 1, theme: { ...legacy, tokens: { primary: "#e8c777" } } })) });
  await page.waitForFunction(() => document.querySelector('.theme-identity-row input')?.value === "KTGA original - copie");
  assert.equal(await opacity.inputValue(), "94");
  assert.deepEqual(normalizeTheme(catalog.appearance).tokens.contentBlur, 8);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), persistedAndApplied: true, legacyImport: true, desktopAndMobile: true, errors }));
} finally { await browser.close(); }
