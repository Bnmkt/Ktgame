import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tooling = path.join(tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(tooling, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(tooling, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const origin = process.env.PATCHNOTE_PREVIEW_ORIGIN || "https://127.0.0.1:4000";
const frontend = process.env.PATCHNOTE_PREVIEW_FRONTEND || "http://127.0.0.1:5175";
const base = "/ktga";
const directory = path.join(root, "docs/previews/patchnote-0.2.1-20261006", String(Date.now()));
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(path.join(root, "server/data/patchnotes.sqlite"), { readOnly: true });
let note, currentVersion;
try {
  const row = db.prepare("SELECT * FROM patchnotes WHERE version=?").get("0.2.1");
  assert.equal(row.status, "draft");
  note = { id: row.id, version: row.version, versionGroup: row.version_group, title: row.title, summary: row.summary, status: row.status, publishedAt: row.published_at,
    blocks: db.prepare("SELECT * FROM patchnote_blocks WHERE patchnote_id=? ORDER BY position").all(row.id).map((block) => ({ id: block.id, type: block.type, category: block.category, title: block.title, content: block.content, metadata: JSON.parse(block.metadata) })) };
  currentVersion = db.prepare("SELECT value FROM patchnote_settings WHERE key='current_version'").get().value;
} finally { db.close(); }

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const failures = [];
let page;
let role = "editor", privateRequests = 0, delayedDraft = false, draftRequested, releaseDraft;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Europe/Brussels", ignoreHTTPSErrors: true });
  const catalog = await (await context.request.get(`${origin}${base}/api/patchnotes`)).json();
  assert.ok(!catalog.notes.some((entry) => entry.version === "0.2.1"), "Le vrai brouillon ne doit pas être public.");
  assert.equal(catalog.currentVersion, currentVersion);
  assert.equal((await context.request.get(`${origin}${base}/api/patchnotes/0.2.1`)).status(), 404);
  await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
  page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  await blocker.enableBlockingInPage(page);
  // Fixture identities and private read responses only; never authenticate as a real account.
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const apiPath = pathname.startsWith(`${base}/api/`) ? pathname.slice(base.length) : pathname;
    const headers = { "Access-Control-Allow-Origin": frontend, "Access-Control-Allow-Credentials": "true" };
    if (apiPath === "/api/me" && role) return route.fulfill({ headers, json: { id: "preview-reader", pseudo: "Lecteur", tokens: 0, admin: role === "admin", editor: role === "editor", profile: {}, cosmetics: {} } });
    if (apiPath === "/api/me/privacy" && role) return route.fulfill({ headers, json: { ok: true } });
    if (apiPath === "/api/patchnotes") return route.fulfill({ headers, json: catalog });
    if (apiPath === "/api/patchnotes/0.2.1") return route.fulfill({ status: 404, headers, json: { error: "Patchnote introuvable." } });
    if (apiPath.startsWith("/api/admin/patchnotes")) {
      privateRequests++;
      if (!["admin", "editor"].includes(role)) return route.fulfill({ status: role ? 403 : 401, headers, json: { error: "Accès privé." } });
      if (apiPath === "/api/admin/patchnotes") return route.fulfill({ headers, json: { currentVersion, notes: [note, ...catalog.notes] } });
      if (apiPath === `/api/admin/patchnotes/${note.id}`) {
        if (delayedDraft) {
          draftRequested?.();
          await new Promise((resolve) => { releaseDraft = resolve; });
        }
        return route.fulfill({ headers, json: note });
      }
      const published = catalog.notes.find((entry) => apiPath.endsWith(`/${entry.id}`));
      if (published) {
        const response = await route.fetch({ url: `${origin}${base}/api/patchnotes/${published.version}` });
        return route.fulfill({ response, headers: { ...response.headers(), ...headers } });
      }
    }
    const response = await route.fetch({ url: `${origin}${base}${apiPath}${new URL(route.request().url()).search}` });
    return route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  await page.goto(`${frontend}${base}/patchnotes?version=0.2.1`);
  const toggle = page.getByRole("switch", { name: "Mode admin / éditeur" });
  await toggle.waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".patchnotes-version-nav a").length > 0);
  assert.equal(await page.locator(".patchnotes-version-nav a").filter({ hasText: "0.2.1" }).count(), 0);
  await toggle.check();
  const draftButton = page.locator(".patchnotes-version-nav a").filter({ hasText: "0.2.1" });
  await draftButton.click();
  await page.getByRole("heading", { name: note.title, exact: true }).waitFor();
  await page.getByText(/Date prévue 8 octobre 2026.*16:00/).waitFor();
  assert.equal(await page.locator(".patchnote-reactions").count(), 0);
  assert.ok(await page.locator(".patchnotes-private-notice").isVisible());
  const images = page.locator(".patchnote-document td img");
  assert.equal(await images.count(), 26);
  await page.waitForFunction(() => [...document.querySelectorAll(".patchnote-document td img")].every((img) => img.complete && img.naturalWidth > 0));
  assert.ok(!(await page.locator(".patchnotes-release").innerText()).match(/\belo\b/i));
  const gallery = page.locator(".patchnote-change").filter({ has: page.getByRole("heading", { name: "Les insignes par division", exact: true }) });
  async function capture(name) {
    assert.ok(await page.locator(".patchnotes-page-panel").isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const boxes = await images.evaluateAll((list) => list.map((img) => ({ width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height })));
    assert.ok(boxes.every((box) => box.width === 56 && box.height === 56));
    await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
  }
  await capture("desktop-complete");
  await gallery.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(directory, "desktop-ranks.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("mobile-complete");
  await gallery.evaluate((element) => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 95));
  await page.waitForTimeout(200);
  assert.ok(await gallery.locator("td").first().evaluate((cell) => cell.getBoundingClientRect().width > 70));
  assert.ok(await gallery.locator("table").evaluate((table) => table.scrollWidth > table.clientWidth));
  await page.screenshot({ path: path.join(directory, "mobile-ranks.png") });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(directory, "mobile-preview-mode.png") });
  await toggle.uncheck();
  await page.waitForFunction(() => !document.querySelector(".patchnotes-private-notice") && document.querySelector(".patchnote-reactions"));
  assert.equal(await draftButton.count(), 0);
  assert.equal(await page.getByRole("heading", { name: note.title, exact: true }).count(), 0);

  // A late private response must never reappear after switching to the public view.
  delayedDraft = true;
  const requested = new Promise((resolve) => { draftRequested = resolve; });
  await toggle.check();
  await draftButton.click();
  await requested;
  await toggle.uncheck();
  releaseDraft();
  await page.waitForFunction(() => document.querySelector(".patchnote-reactions") && !document.querySelector(".patchnotes-private-notice"));
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole("heading", { name: note.title, exact: true }).count(), 0);
  delayedDraft = false;

  role = "admin";
  await page.reload();
  await toggle.check();
  await draftButton.click();
  await page.getByRole("heading", { name: note.title, exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(directory, "desktop-preview-mode.png") });
  for (const identity of ["player", null]) {
    role = identity;
    const countBefore = privateRequests;
    await page.reload();
    await page.locator(".patchnote-reactions").waitFor();
    assert.equal(await toggle.count(), 0);
    assert.equal(await draftButton.count(), 0);
    assert.equal(privateRequests, countBefore);
  }
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ status: "ok", images: 26, roles: ["editor", "admin", "player", "anonymous"], latePrivateResponseHidden: true, contentBlocker: true, draftStillPrivate: true, directory }));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(directory, "failure.png") });
    console.error((await page.locator("body").innerText()).slice(0, 1500));
  }
  throw error;
} finally { await browser.close(); }
