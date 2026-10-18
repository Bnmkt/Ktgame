import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const previews = new URL(`../../docs/previews/mascots-20261018/${Date.now()}/`, import.meta.url);
await fs.mkdir(previews, { recursive: true });
const errors = [], requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
    await blocker.enableBlockingInPage(page);
  }
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/**", async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    const headers = { "Access-Control-Allow-Origin": request.headers().origin || "http://127.0.0.1:5197", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (endpoint === "/api/branding/site") return route.fulfill({ body: await fs.readFile(new URL("../public/favicon.svg", import.meta.url)), contentType: "image/svg+xml", headers });
    if (endpoint === "/api/auth/login") {
      requests.push(request.postDataJSON());
      return route.fulfill({ json: { mfaRequired: true, methods: ["totp"], challenge: "fixture" }, headers });
    }
    const data = endpoint === "/api/games" ? [{ id: "yahtzee", name: "Yahtzee", type: "dice", category: "score", minPlayers: 1, maxPlayers: 6 }]
      : endpoint === "/api/friends" ? { friends: [] }
      : endpoint === "/api/community-events/carousel" ? { events: [] }
      : endpoint.startsWith("/api/locales/") ? { messages: {} }
      : endpoint === "/api/health" ? { ok: true } : [];
    return route.fulfill({ json: data, headers });
  });
  const origin = process.env.MASCOT_ORIGIN || "http://127.0.0.1:5197";
  const url = `${origin}/test/fixtures/mascot-interface.html`;
  async function screenshot(name) {
    await page.evaluate(async () => { await Promise.all([...document.images].filter(image => image.getBoundingClientRect().width).map(image => image.decode().catch(() => {}))); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(await page.locator('.ktga-mascot:visible').count());
    const broken = await page.locator(".ktga-mascot:visible img").evaluateAll(images => images.filter(image => !image.naturalWidth).length);
    assert.equal(broken, 0);
    await page.screenshot({ path: fileURLToPath(new URL(name, previews)), fullPage: true, animations: "disabled" });
  }
  await page.goto(url);
  await page.getByRole("button", { name: "Se connecter", exact: true }).waitFor();
  await screenshot("login-desktop.png");
  assert.equal(await page.locator(".entry-companion-left img").getAttribute("alt"), "");
  await page.getByRole("button", { name: "Inscription", exact: true }).click();
  await screenshot("register-desktop.png");
  assert.match(await page.locator(".entry-companion-left img").getAttribute("src"), /nixie-welcome/);
  const password = page.locator('input[autocomplete="new-password"]').first();
  await password.fill("ValidSecret123!");
  assert.match(await page.locator(".entry-companion-left img").getAttribute("src"), /nixie-victory/);
  await page.locator('input[type="date"]').fill("2020-01-01");
  await page.getByText("Accord d’un responsable légal requis", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("register-mobile.png");
  await page.getByRole("button", { name: "Connexion", exact: true }).click();
  await screenshot("login-mobile.png");
  await page.locator('input[autocomplete="username"]').fill("person@example.com");
  await page.locator('input[autocomplete="current-password"]').fill("ValidSecret123!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByRole("heading", { name: "Deuxième étape", exact: true }).waitFor();
  assert.deepEqual(requests[0], { login: "person@example.com", password: "ValidSecret123!" });
  await screenshot("mfa-mobile.png");
  await page.goto(`${url}?view=contexts`);
  await screenshot("contexts-mobile.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot("contexts-desktop.png");
  await page.goto(`${url}?view=lobby`);
  await screenshot("lobby-desktop.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("lobby-mobile.png");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await page.getByRole("button", { name: "Se connecter", exact: true }).waitFor();
  assert.equal(await page.locator(".entry-companion-left .ktga-mascot").evaluate(element => getComputedStyle(element).animationName), "none");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(previews), authenticationUnchanged: true, parentalForm: true, reducedMotion: true, errors }));
} finally { await browser.close(); }
