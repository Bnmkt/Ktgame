import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules/playwright/index.mjs")));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const endpoints = [], deliveries = [], errors = [];
const pagePath = process.env.AUDIENCE_TEST_PAGE === "/" ? "/" : "/faq";
const safeLocation = `https://www.ktga.me${pagePath}`;
try {
  await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
  await context.route("**/api/me", (route) => route.fulfill({ status: 401, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "https://www.ktga.me", "Access-Control-Allow-Credentials": "true" }, body: '{"error":"Anonymous diagnostic fixture"}' }));
  await context.route(/https:\/\/[^/]*(google-analytics\.com|googletagmanager\.com|google\.com|doubleclick\.net)\//, async (route) => {
    const request = route.request(), url = new URL(request.url());
    endpoints.push(url.hostname + url.pathname);
    if (url.hostname === "www.googletagmanager.com" && ["/gtag/js", "/gtm.js"].includes(url.pathname)) { await route.continue(); return; }
    if (url.hostname.endsWith("google-analytics.com") && url.pathname.endsWith("/collect")) {
      const lines = (request.postData() || "").split("\n");
      for (const line of lines) {
        const fields = new URLSearchParams(url.search);
        for (const [key, value] of new URLSearchParams(line)) fields.set(key, value);
        assert.equal(fields.get("tid"), "G-YK0459SVPW");
        assert.equal(fields.get("dl"), safeLocation);
        assert.ok(!fields.get("dr"));
        assert.ok(!fields.get("uid"));
        assert.ok(!fields.toString().includes("PRIVATE_SENTINEL"));
        deliveries.push(fields.get("en"));
      }
      await route.fulfill({ status: 204 });
    } else await route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${safeLocation}?unused=PRIVATE_SENTINEL`);
  await page.waitForTimeout(1200);
  assert.deepEqual(endpoints, ["www.googletagmanager.com/gtm.js"]);
  await page.getByRole("button", { name: "Mes préférences", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mesure d’audience Google Analytics", { exact: false }).check();
  await dialog.getByLabel("J'ai au moins 13 ans", { exact: false }).check();
  await dialog.getByRole("button", { name: "Enregistrer mes choix", exact: true }).click();
  for (let attempt = 0; attempt < 30 && !deliveries.includes("page_view"); attempt++) await page.waitForTimeout(500);
  assert.ok(deliveries.includes("page_view"), "The real Google script must produce a safe page view");
  assert.ok(!endpoints.some((endpoint) => /doubleclick|google\.com\/ccm/.test(endpoint)), "No advertising endpoint");
  const cookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("_ga"));
  assert.ok(cookies.some((cookie) => cookie.name === "_ga"));
  for (const cookie of cookies) assert.ok(cookie.expires <= Date.now() / 1000 + 180 * 86400 + 30);
  await page.getByRole("button", { name: "Mes préférences", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tout refuser", exact: true }).click();
  await page.waitForTimeout(1000);
  const afterRefusal = endpoints.length;
  await page.waitForTimeout(5000);
  assert.equal(endpoints.length, afterRefusal);
  assert.equal(await page.evaluate(() => window["ga-disable-G-YK0459SVPW"]), true);
  assert.deepEqual((await context.cookies()).filter((cookie) => cookie.name.startsWith("_ga")), []);
  assert.deepEqual(errors, []);
  assert.equal(deliveries.filter((event) => event === "page_view").length, 1, "No duplicate Analytics view");
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  let frames = 0;
  try {
    await noJs.route("https://www.googletagmanager.com/ns.html?id=GTM-NV3T6P8X", async (route) => { frames++; await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Tag Manager fixture</title>" }); });
    const reader = await noJs.newPage();
    await reader.goto(safeLocation);
    assert.equal(frames, 1, "The noscript iframe must load under the deployed CSP");
    assert.equal(await reader.locator("noscript iframe").count(), 1);
  } finally { await noJs.close(); }
  console.log(JSON.stringify({ realTag: true, page: safeLocation, container: "GTM-NV3T6P8X", noscriptVerified: true, safePageViews: deliveries.filter((event) => event === "page_view").length, endpoints: [...new Set(endpoints)], cookiesRemoved: true, diagnosticsTransmitted: false, errors }, null, 2));
} finally { await context.close(); await browser.close(); }
