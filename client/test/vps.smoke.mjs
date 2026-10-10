import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { parse } from "../../server/node_modules/dotenv/lib/main.js";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";

assert.equal(process.env.ALLOW_DEPLOYMENT_SESSION, "1", "Run explicitly with ALLOW_DEPLOYMENT_SESSION=1 after migration. This opens a five-minute diagnostic session using local deployment credentials.");
const root = fileURLToPath(new URL("../../", import.meta.url));
const tools = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(tools, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(tools, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const environment = parse(fs.readFileSync(path.join(root, "server/.env")));
const filename = path.resolve(root, "server", environment.SQLITE_PATH || "data/ktga.sqlite");
const db = new DatabaseSync(filename, { readOnly: true });
let user;
try { user = db.prepare("SELECT data FROM users WHERE guest=0").all().map((row) => JSON.parse(row.data)).find((entry) => entry.admin && entry.active !== false && !entry.moderation?.hardBan?.active); }
finally { db.close(); }
assert.ok(user, "An active administrator must exist in the migrated source database.");
const token = jwt.sign({ id: user.id, guest: false, sessionVersion: Number(user.sessionVersion) || 0 }, environment.JWT_SECRET, { expiresIn: "5m" });
const origin = "https://www.ktga.me", apiOrigin = "https://api.ktga.me";
const previews = path.join(root, "docs/previews/vps-debian-20261007", String(Date.now()));
fs.mkdirSync(previews, { recursive: true });
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const checks = [], errors = [], consoleErrors = [], websockets = [];
let previewingDraft = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Europe/Brussels" });
  await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => { if (entry.type() === "error" && !/401/.test(entry.text()) && !(previewingDraft && /404/.test(entry.text()))) consoleErrors.push(entry.text()); });
  page.on("websocket", (socket) => { socket.on("framereceived", () => { if (!websockets.includes(socket.url().split("?")[0])) websockets.push(socket.url().split("?")[0]); }); });
  await blocker.enableBlockingInPage(page);
  async function visit(route, name, viewport) {
    if (viewport) await page.setViewportSize(viewport);
    const response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    assert.equal(response.status(), 200);
    await page.locator("#root").waitFor();
    await page.waitForTimeout(1800);
    const state = await page.evaluate(() => ({ text: document.querySelector("#root").innerText.length, overflow: document.documentElement.scrollWidth > innerWidth + 1, broken: [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && image.getAttribute("src")).map((image) => ({ source: image.currentSrc.startsWith("data:") ? "data URI" : image.currentSrc.split("?")[0].slice(0, 180), className: image.className })) }));
    assert.ok(state.text > 100, name);
    assert.equal(state.overflow, false, name);
    assert.deepEqual(state.broken, [], name);
    await page.screenshot({ path: path.join(previews, `${name}.png`), fullPage: false });
    checks.push({ name, ...state });
  }
  await visit("/", "desktop-login");
  await visit("/faq", "desktop-faq");
  await visit("/status", "desktop-status");
  await context.addCookies([{ name: "ktga_session", value: token, url: apiOrigin, httpOnly: true, secure: true, sameSite: "Lax" }]);
  await visit("/", "desktop-lobby");
  assert.ok(await page.getByRole("link", { name: "Administration", exact: true }).isVisible());
  await visit("/shop", "desktop-shop");
  await visit("/admin", "desktop-admin");
  const releaseCatalog = await (await context.request.get(`${apiOrigin}/api/admin/patchnotes`, { headers: { Origin: origin } })).json();
  const draft = releaseCatalog.notes.find((entry) => entry.status === "draft");
  if (draft) {
    previewingDraft = true;
    const response = await page.goto(`${origin}/patchnotes?version=${encodeURIComponent(draft.version)}`, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 404, "Draft documents remain unavailable to public crawlers.");
    const toggle = page.getByRole("switch", { name: "Mode admin / éditeur" });
    await toggle.check();
    await page.locator(".patchnotes-version-nav a").filter({ hasText: draft.version }).first().click();
    await page.getByRole("heading", { name: draft.title, exact: true }).waitFor();
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, follow");
    await page.screenshot({ path: path.join(previews, "desktop-private-preview.png") });
    checks.push({ name: "admin-draft-preview", publicStatus: 404, privatePreview: true });
    previewingDraft = false;
  }
  await visit("/admin", "desktop-execution-health");
  await page.getByRole("button", { name: "Supervision", exact: true }).click();
  await page.getByRole("button", { name: "Workers et caches", exact: true }).click();
  await page.getByRole("heading", { name: "Caches applicatifs", exact: true }).waitFor();
  assert.equal(await page.locator(".health-cache-table").first().locator("tbody tr").count(), 3);
  assert.equal(await page.locator(".health-service-table tbody tr").count(), 9);
  assert.equal(await page.locator(".health-execution .health-kpi").count(), 4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: path.join(previews, "desktop-execution-health.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".health-cache-table").first().locator("tbody tr").count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: path.join(previews, "mobile-execution-health.png"), fullPage: true });
  for (const route of ["/api/history?paged=1&limit=5", "/api/transactions?paged=1&limit=5", "/api/me/statistics"]) {
    const response = await context.request.get(`${apiOrigin}${route}`, { headers: { Origin: origin } });
    assert.equal(response.status(), 200);
  }
  const executionHealth = await (await context.request.get(`${apiOrigin}/api/admin/health`, { headers: { Origin: origin } })).json();
  assert.ok(executionHealth.workers.password.capacity >= 1);
  assert.equal(executionHealth.workers.password.queueCapacity, 128);
  assert.equal(executionHealth.workers.reading.capacity, 1);
  assert.equal(executionHealth.workers.reading.started, 1);
  assert.ok(executionHealth.services.history.completed >= 1);
  assert.ok(executionHealth.services.transactions.completed >= 1);
  assert.ok(executionHealth.services.statistics.completed >= 1);
  assert.equal(executionHealth.services.history.mode, "read-worker");
  assert.equal(executionHealth.executionHistory.retentionDays, 30);
  assert.deepEqual(Object.keys(executionHealth.caches), ["configuration", "statistics", "achievements"]);
  checks.push({ name: "worker-cache-supervision", desktop: true, mobile: true, caches: 3 });
  await page.locator(".admin-mobile-nav select").selectOption("tests");
  await page.getByRole("heading", { name: "Debug / Tests", exact: true }).waitFor();
  await page.locator(".capacity-games label").first().waitFor();
  assert.equal(await page.locator(".capacity-games label").count(), 15);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: path.join(previews, "mobile-capacity-tests.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: path.join(previews, "desktop-capacity-tests.png"), fullPage: true });
  const tests = await context.request.get(`${apiOrigin}/api/admin/tests`, { headers: { Origin: origin } });
  assert.equal(tests.status(), 200); assert.equal((await tests.json()).games.length, 15);
  checks.push({ name: "admin-capacity-tool", desktop: true, mobile: true, games: 15, readOnlyCheck: true });
  if (process.env.ALLOW_CAPACITY_SMOKE === "1") {
    const metadata = await tests.json();
    assert.equal(metadata.activeId, null); assert.equal(metadata.safety.rooms, 0, "Never launch while real tables exist.");
    const started = await context.request.post(`${apiOrigin}/api/admin/tests`, { headers: { Origin: origin }, data: { confirm: true, config: { clients: 4, seconds: 10, games: ["yahtzee"], chat: false, events: false, actionMs: 500 } } });
    assert.equal(started.status(), 202);
    const job = await started.json();
    let completed;
    try {
      const deadline = Date.now() + 90000;
      do {
        await page.waitForTimeout(1000);
        completed = await (await context.request.get(`${apiOrigin}/api/admin/tests/${job.id}`, { headers: { Origin: origin } })).json();
      } while (["starting", "running", "stopping"].includes(completed.state) && Date.now() < deadline);
      assert.equal(completed.state, "passed", JSON.stringify(completed.report));
      assert.equal(completed.report.integrity.passed, true); assert.equal(completed.report.counters.errors, 0);
      const exported = await (await context.request.get(`${apiOrigin}/api/admin/tests/${job.id}/export`, { headers: { Origin: origin } })).json();
      fs.writeFileSync(path.join(previews, "vps-capacity-report.json"), JSON.stringify(exported, null, 2));
      await page.getByRole("button", { name: /^Historique/ }).click();
      await page.getByRole("button", { name: "Résultats", exact: true }).last().click();
      await page.getByText("Validé", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(previews, "desktop-capacity-result.png"), fullPage: true });
      checks.push({ name: "systemd-isolated-test", clients: 4, seconds: 10, actions: completed.report.counters.actions, errors: 0, integrity: true });
    } finally {
      if (!completed || ["starting", "running", "stopping"].includes(completed.state)) await context.request.post(`${apiOrigin}/api/admin/tests/${job.id}/stop`, { headers: { Origin: origin }, data: {} });
    }
  }
  await visit("/", "mobile-lobby", { width: 390, height: 844 });
  await visit("/status", "mobile-status");
  assert.ok(websockets.some((url) => url === "wss://api.ktga.me/socket.io/"), "No real production WebSocket frames received.");
  const privateApi = await context.request.get(`${apiOrigin}/api/me`, { headers: { Origin: origin } });
  assert.equal(privateApi.status(), 200);
  for (const route of ["/api/admin", "/api/leaderboards", "/api/help", "/api/patchnotes", "/api/status"]) {
    assert.equal((await context.request.get(`${apiOrigin}${route}`, { headers: { Origin: origin } })).status(), 200, route);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ checks, errors, consoleErrors, websockets, previews }, null, 2));
} finally { await browser.close(); }
