import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const note = await (await fetch("https://api.ktga.me/api/patchnotes/0.2.1")).json();
assert.equal(note.status, "published"); assert.match(note.publishedAt, /^2026-10-09T/);
assert.equal(note.blocks.length, 36);
assert.ok(note.blocks.some((block) => /500 joueurs simulés/.test(block.content)));
const previews = path.join(root, "docs/previews/patchnote-0.2.1-20261009");
fs.mkdirSync(previews, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const errors = [], checks = [];
try {
  for (const [name, viewport] of [["desktop", {width:1440,height:1000}], ["mobile", {width:390,height:844}]]) {
    const context = await browser.newContext({ viewport, timezoneId: "Europe/Brussels" });
    await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({version:"2026-09-27",chosenAt:Date.now(),enabled:false})));
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await blocker.enableBlockingInPage(page);
    const response = await page.goto("https://www.ktga.me/patchnotes/0.2.1", { waitUntil: "domcontentloaded", timeout: 90000 });
    assert.equal(response.status(), 200);
    await page.getByRole("heading", { name: note.title, exact:true }).waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(previews, `${name}.png`) });
    await page.getByRole("heading", { name:"Les insignes par division", exact:true }).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll(".patchnotes-release img")];
      return images.length === 26 && images.every((element) => element.complete && element.naturalWidth > 0);
    });
    const images = await page.locator(".patchnotes-release img").count(); assert.equal(images, 26);
    checks.push({ viewport:name, overflow:false, rankImages:images });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ published:true, version:note.version, date:note.publishedAt, checks, errors, previews }));
} finally { await browser.close(); }
