import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "../../server/node_modules/express/index.js";
import { PRIVACY_VERSION } from "../src/privacy/consent.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const previews = path.join(root, "docs/previews/pwa-20261010"); fs.mkdirSync(previews, { recursive: true });
const app = express();
app.use(express.static(path.join(root, "client/dist"), { index: false }));
app.use((_req, res) => res.sendFile(path.join(root, "client/dist/index.html")));
const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, installedContext, profile; const errors = [], checks = [];
async function installFixtures(target) {
  await target.route("**/api/**", (route) => {
    const key = new URL(route.request().url()).pathname;
    const status = key === "/api/me" ? 401 : 200;
    const data = key === "/api/config" ? { siteName: "KTGA.ME" } : key === "/api/me" ? { error: "Anonymous test" } : [];
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } });
  });
  await target.route(/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com)\//, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
}
async function context(options = {}, existing = null) {
  const context = existing ?? await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.addInitScript((version) => {
    if (!localStorage.getItem("ktga-privacy-choice")) localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version, chosenAt: Date.now(), enabled: false }));
  }, PRIVACY_VERSION);
  await installFixtures(context);
  return context;
}
async function offer(page, outcome = "dismissed") {
  await page.evaluate((result) => {
    window.__pwaPromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => { window.__pwaPromptCalls++; };
    event.userChoice = Promise.resolve({ outcome: result });
    window.dispatchEvent(event);
  }, outcome);
}
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const ctx = await context({ viewport }); const page = await ctx.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await blocker.enableBlockingInPage(page); await installFixtures(page); await page.goto(`${origin}/mentions-legales`);
    await page.getByRole("heading", { name: "Mentions légales", exact: true }).waitFor();
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
    await offer(page);
    const notice = page.getByRole("status", { name: "Installation de KTGA.ME" }); await notice.waitFor();
    if (name === "mobile") {
      assert.ok((await notice.boundingBox()).height < 180, "Mobile installation notice must stay compact");
      assert.ok((await notice.locator("p").boundingBox()).width > 260, "Mobile copy must not be squeezed by buttons");
    }
    assert.equal(await page.evaluate(() => window.__pwaPromptCalls), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(previews, `${name}.png`), fullPage: true });
    await notice.getByRole("button", { name: "Installer", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__pwaPromptCalls), 1);
    await notice.getByRole("button", { name: "Installer", exact: true }).click();
    await page.getByRole("dialog", { name: "Installer KTGA.ME", exact: true }).waitFor();
    await page.getByRole("button", { name: "Ignorer cette proposition", exact: true }).click();
    assert.equal(await notice.count(), 0);
    await page.reload(); await offer(page); assert.equal(await notice.count(), 0);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).filter((key) => key.startsWith("ktga-offline-")).map(async (key) => (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)))).flat());
    assert.equal(cached.length, 5); assert.ok(cached.every((url) => url === "/offline.html" || url.startsWith("/pwa/icon-")));
    const session = await ctx.newCDPSession(page);
    const manifest = await session.send("Page.getAppManifest"); assert.deepEqual(manifest.errors, []); assert.equal(JSON.parse(manifest.data).name, "KTGA.ME");
    const installability = await session.send("Page.getInstallabilityErrors"); assert.deepEqual(installability.installabilityErrors.filter((error) => error.errorId !== "in-incognito"), []);
    await ctx.setOffline(true); await page.goto(`${origin}/profil?never-cache=private`);
    await page.getByRole("heading", { name: "La connexion est interrompue", exact: true }).waitFor();
    await page.screenshot({ path: path.join(previews, `${name}-offline.png`) });
    await ctx.setOffline(false); await page.getByRole("link", { name: "Revenir au casino", exact: true }).click();
    try { await page.getByRole("button", { name: "Connexion", exact: true }).waitFor({ timeout: 8000 }); }
    catch (error) { await page.screenshot({ path: path.join(previews, `${name}-recovery-error.png`) }); console.error(JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 700), errors })); throw error; }
    checks.push(`${name}: blocker, install click, ignore across reloads, manifest, static-only cache, offline and recovery`); await ctx.close();
  }
  const ctx = await context(); const page = await ctx.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/mentions-legales`); await page.getByRole("heading", { name: "Mentions légales", exact: true }).waitFor();
  await offer(page, "accepted"); await page.getByRole("button", { name: "Installer", exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem("ktga-install-choice") === "installed");
  assert.equal(await page.locator(".install-notice").count(), 0); await page.reload(); await offer(page); assert.equal(await page.locator(".install-notice").count(), 0); await ctx.close();
  checks.push("Accepted installation persists without any push permission request");
  const ios = await context({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
  const iosPage = await ios.newPage(); iosPage.on("pageerror", (error) => errors.push(error.message));
  await iosPage.goto(`${origin}/mentions-legales`); await iosPage.getByRole("button", { name: "Installer", exact: true }).click();
  await iosPage.getByRole("dialog", { name: "Installer KTGA.ME", exact: true }).waitFor();
  await iosPage.screenshot({ path: path.join(previews, "ios-instructions.png") });
  await iosPage.getByRole("button", { name: "C’est installé", exact: true }).click();
  assert.equal(await iosPage.locator(".install-notice").count(), 0); await ios.close();
  checks.push("iOS manual installation instructions and completion acknowledgement (emulated UA)");
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-pwa-install-"));
  installedContext = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true });
  await context({}, installedContext);
  const installPage = await installedContext.newPage(); installPage.on("pageerror", (error) => errors.push(error.message));
  await installPage.goto(`${origin}/mentions-legales`);
  await installPage.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
  const installSession = await installedContext.newCDPSession(installPage);
  assert.deepEqual((await installSession.send("Page.getInstallabilityErrors")).installabilityErrors, []);
  checks.push("Chromium installation criteria pass in a non-private browser profile");
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, errors, previews }; fs.writeFileSync(path.join(previews, "results.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally {
  await installedContext?.close(); await browser?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  if (profile) { assert.equal(path.dirname(profile), os.tmpdir()); assert.match(path.basename(profile), /^ktga-pwa-install-/); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
