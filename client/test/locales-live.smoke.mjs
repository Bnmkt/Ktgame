import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRIVACY_VERSION } from "../src/privacy/consent.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules/playwright/index.mjs")));
const origin = process.env.KTGA_TEST_ORIGIN ?? "https://www.ktga.me";
const directory = path.join(root, "docs/previews/locales-20261012", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(directory, { recursive: true });
const errors = [], checks = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [name, viewport] of [["desktop", { width: 1920, height: 1080 }], ["mobile", { width: 390, height: 844 }]]) {
    for (const logged of [false, true]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((version) => {
        localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version, chosenAt: Date.now(), enabled: false }));
        localStorage.setItem("ktga-install-choice", "ignored");
      }, PRIVACY_VERSION);
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      // Read-only production asset check: no real account or private API is used.
      const publicPaths = new Set(["/api/config", "/api/games", "/api/shop", "/api/health", "/api/locales/fr", "/api/locales/en", "/api/community-events/carousel"]);
      await page.route("**/api/**", (route) => {
        const request = route.request(), key = new URL(request.url()).pathname;
        if (request.method() === "GET" && (publicPaths.has(key) || key.startsWith("/api/game-images/"))) return route.continue();
        let status = 200, data = [];
        if (key === "/api/me") {
          status = logged ? 200 : 401;
          data = logged ? { id: "locale-preview", pseudo: "Preview", tokens: 1000, profile: { locale: "en", favoriteGames: [] }, cosmetics: { equipped: {} } } : { error: "Anonymous" };
        } else if (key === "/api/friends") data = { friends: [] };
        else if (key === "/api/ranked") data = { games: [] };
        else if (key === "/api/tribunal/availability") data = { available: false };
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      });
      await page.route(/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com)\//, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
      await page.goto(origin);
      if (logged) {
        await page.getByRole("heading", { name: "Available games", exact: true }).waitFor();
        const flag = await page.locator(".locale-header").boundingBox();
        const header = await page.locator(".casino-header").boundingBox();
        assert.ok(header.x + header.width - flag.x - flag.width <= 20);
        if (name === "desktop") {
          const logout = await page.locator(".casino-logout").boundingBox();
          assert.ok(flag.x - logout.x - logout.width >= 40, "The language selector is separated from the account links");
        }
        assert.ok((await page.locator(".display-name-text").first().boundingBox()).height < 35);
      } else {
        await page.locator(".locale-visitor select").selectOption("en");
        await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).waitFor();
        await page.reload();
        await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).waitFor();
      }
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.waitForFunction(() => Array.from(document.querySelectorAll(".locale-picker img")).filter((image) => image.offsetParent).every((image) => image.naturalWidth > 0));
      await page.screenshot({ path: path.join(directory, `${name}-${logged ? "header" : "login"}-en.png`) });
      checks.push(`${name}: ${logged ? "production header, separated flag and nickname" : "production login and persistent FR/EN choice"}`);
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors, directory }));
} finally { await browser.close(); }
