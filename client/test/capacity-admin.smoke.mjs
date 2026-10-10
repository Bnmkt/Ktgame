import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";
import { isolatedEnvironment } from "../../server/scripts/capacity/common.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-capacity-"));
const runId = `capacity-${randomBytes(6).toString("hex")}`, secret = randomBytes(32).toString("hex");
const port = 4106, api = `http://127.0.0.1:${port}`, origin = "http://127.0.0.1:4251";
const environment = isolatedEnvironment(directory, port, runId, secret);
const db = new DatabaseSync(environment.SQLITE_PATH);
db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
const user = { id: "admin", pseudo: "AdminTest", email: "admin@loadtest.invalid", admin: true, active: true, emailVerifiedAt: new Date().toISOString(), passwordHash: "unused", passwordPolicyVersion: 1, sessionVersion: 0, tokens: 1000000, profile: { birthDate: "1990-01-01" }, createdAt: new Date().toISOString() };
db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(user.id, JSON.stringify(user), user.pseudo, user.email);
db.close();
const tools = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(tools, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(tools, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const previews = path.join(root, "docs/previews/capacity-admin"); fs.mkdirSync(previews, { recursive: true });
const processes = [], errors = [];
let browser;
function start(cwd, args, env) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", () => {}); child.stderr.on("data", () => {}); processes.push(child); return child;
}
async function ready(url, child) {
  for (let i = 0; i < 150; i++) { if (child.exitCode !== null) throw new Error("Test process exited"); try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error("Readiness timed out");
}
try {
  const server = start(path.join(root, "server"), ["src/index.js"], environment); await ready(`${api}/api/health`, server);
  const vite = start(path.join(root, "client"), ["node_modules/vite/bin/vite.js", "--config", "test/capacity.vite.config.mjs"], { ...process.env, CAPACITY_API_TARGET: api, CAPACITY_SERVER_ORIGIN: api, VITE_API_URL: origin, VITE_SOCKET_URL: origin, VITE_SOCKET_PATH: "/socket.io", VITE_BASE_PATH: "/", VITE_AUDIENCE_READY: "false" });
  await ready(origin, vite);
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const token = jwt.sign({ id: "admin", sessionVersion: 0 }, secret, { expiresIn: "10m" });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, timezoneId: "Europe/Brussels", acceptDownloads: true });
    await context.addCookies([{ name: "ktga_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
    await context.route(/https:\/\/[^/]*(?:google|doubleclick)[^/]*\//, (route) => route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(60000); page.on("pageerror", (error) => errors.push(error.message));
    await blocker.enableBlockingInPage(page); await page.goto(`${origin}/admin`);
    if (name === "mobile") await page.locator(".admin-mobile-nav select").selectOption("tests");
    else await page.getByRole("button", { name: "Debug / Tests", exact: true }).click();
    await page.getByRole("heading", { name: "Debug / Tests", exact: true }).waitFor();
    await page.getByRole("button", { name: "Configuration", exact: true }).click();
    assert.equal(await page.locator(".capacity-games label").count(), 15);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(previews, `${name}-configuration.png`), fullPage: true });
    if (name === "desktop") {
      await page.getByLabel("Joueurs simultanés (joueurs)", { exact: true }).fill("4");
      await page.getByLabel("Durée en jeu (s)", { exact: true }).fill("10");
      await page.getByLabel("Délai entre actions (ms)", { exact: true }).fill("250");
      await page.getByRole("button", { name: "Aucun", exact: true }).click();
      await page.locator(".capacity-games label").filter({ hasText: "Yahtzee" }).locator("input").check();
      await page.getByRole("button", { name: "Lancer le test", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Lancer", exact: true }).click();
      await page.getByText("Validé", { exact: true }).waitFor();
      assert.equal(await page.locator(".capacity-ok").count(), 12);
      const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Export JSON", exact: true }).click();
      const download = await downloaded; await download.saveAs(path.join(previews, "browser-report.json"));
      const report = JSON.parse(fs.readFileSync(path.join(previews, "browser-report.json"), "utf8"));
      assert.equal(report.report.passed, true); assert.ok(report.report.counters.actions > 0); assert.equal(report.report.counters.errors, 0);
      assert.ok(!JSON.stringify(report).includes("monitorToken")); assert.ok(!JSON.stringify(report).includes(secret));
    } else {
      await page.getByRole("button", { name: /^Historique/ }).click(); await page.getByRole("button", { name: "Résultats", exact: true }).last().click();
      await page.getByText("Validé", { exact: true }).waitFor();
    }
    assert.equal(await page.getByRole("img", { name: "Latence de la boucle serveur", exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(previews, `${name}-results.png`), fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: true, views: ["desktop", "mobile"], blocker: "Ghostery", errors, previews }));
} finally {
  await browser?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) { const exited = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exited; }
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.match(path.basename(directory), /^ktga-capacity-[A-Za-z0-9]{6}$/);
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
