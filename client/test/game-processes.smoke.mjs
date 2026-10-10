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
const secret = randomBytes(32).toString("hex"), runId = `capacity-${randomBytes(6).toString("hex")}`;
const api = "http://127.0.0.1:4106", origin = "http://127.0.0.1:4251";
const environment = { ...isolatedEnvironment(directory, 4106, runId, secret), GAME_WORKERS_ENABLED: "1", GAME_WORKERS: "2", ACCOUNTS_PROCESS_ENABLED: "0" };
const db = new DatabaseSync(environment.SQLITE_PATH);
db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
const user = { id: "admin", pseudo: "Test", email: "admin@loadtest.invalid", admin: true, active: true, tokens: 10000,
  emailVerifiedAt: new Date().toISOString(), passwordHash: "unused", profile: { birthDate: "1990-01-01" } };
db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(user.id, JSON.stringify(user), user.pseudo, user.email); db.close();
const tools = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(tools, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(tools, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const previews = path.join(root, "docs/previews/game-processes-ui-20261010"); fs.mkdirSync(previews, { recursive: true });
const processes = [], errors = [];
let browser;
function start(cwd, parameters, env) {
  const child = spawn(process.execPath, parameters, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", () => {}); child.stderr.on("data", () => {}); processes.push(child); return child;
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error("Private preview stopped");
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Readiness timed out");
}
try {
  const server = start(path.join(root, "server"), ["src/index.js"], environment); await ready(`${api}/api/health`, server);
  const vite = start(path.join(root, "client"), ["node_modules/vite/bin/vite.js", "--config", "test/capacity.vite.config.mjs"], {
    ...process.env, CAPACITY_API_TARGET: api, CAPACITY_SERVER_ORIGIN: api, VITE_API_URL: origin, VITE_SOCKET_URL: origin,
    VITE_SOCKET_PATH: "/socket.io", VITE_BASE_PATH: "/", VITE_AUDIENCE_READY: "false"
  }); await ready(origin, vite);
  const token = jwt.sign({ id: "admin", sessionVersion: 0 }, secret), headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  for (const name of ["Worker one", "Worker two"]) assert.equal((await fetch(`${api}/api/rooms`, { method: "POST", headers, body: JSON.stringify({ gameId: "yahtzee", name, stake: 10 }) })).status, 200);
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, timezoneId: "Europe/Brussels" });
    await context.addCookies([{ name: "ktga_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await blocker.enableBlockingInPage(page); await page.goto(`${origin}/admin`);
    if (name === "mobile") await page.locator(".admin-mobile-nav select").selectOption("health");
    else await page.getByRole("button", { name: "Supervision", exact: true }).click();
    await page.getByRole("button", { name: "Workers et caches", exact: true }).click();
    await page.getByRole("heading", { name: "Processus du casino", exact: true }).waitFor();
    assert.equal(await page.locator(".health-processes table").first().locator("tbody tr").count(), 4);
    assert.equal(await page.locator(".health-processes table").nth(1).locator("tbody tr").count(), 2);
    assert.match(await page.locator(".health-service-table tbody tr").filter({ hasText: "Transitions de table" }).innerText(), /Gateway \+ Game Workers/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(previews, `${name}.png`), fullPage: true }); await context.close();
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: true, blocker: true, processes: 4, previews }));
} finally {
  await browser?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) { const exit = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exit; }
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.match(path.basename(directory), /^ktga-capacity-[A-Za-z0-9]{6}$/);
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
