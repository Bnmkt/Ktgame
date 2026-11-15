import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const external = createRequire(path.join(process.env.KTGA_BROWSER_TOOLS, "package.json"));
const { chromium } = external("playwright"), { PlaywrightBlocker } = external("@ghostery/adblocker-playwright");
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-xp-participants-"));
const secret = "isolated-xp-participants-browser-secret";
const db = new DatabaseSync(path.join(temporary, "main.sqlite"));
db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER NOT NULL DEFAULT 0)");
const account = { id: "admin", pseudo: "Admin", email: "admin@example.test", active: true, admin: true, emailVerifiedAt: new Date().toISOString(), tokens: 10000, createdAt: new Date().toISOString(), profile: { birthDate: "1990-01-01" } };
db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(account.id, JSON.stringify(account), account.pseudo, account.email); db.close();
async function freePort() { const server = createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
const api = `http://127.0.0.1:${await freePort()}`, origin = `http://127.0.0.1:${await freePort()}`;
const processes = [], errors = []; let browser, logs = "";
const output = path.join(root, "docs/previews/xp-participants-20261115", String(Date.now())); fs.mkdirSync(output, { recursive: true });
function start(args, cwd, env) { const child = spawn(process.execPath, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }); child.stdout.on("data", chunk => logs += chunk); child.stderr.on("data", chunk => logs += chunk); processes.push(child); }
const token = jwt.sign({ id: "admin", sessionVersion: 0 }, secret);
async function request(route, method = "GET", body) { const response = await fetch(api + route, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data; }
async function until(check, label) { for (let i = 0; i < 150; i++) { try { if (await check()) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw Error(`Timeout: ${label}`); }
try {
  start(["src/index.js"], path.join(root, "server"), { DOTENV_CONFIG_PATH: path.join(temporary, "disabled.env"), NODE_ENV: "test", HOST: "127.0.0.1", PORT: new URL(api).port, CLIENT_DIST: "", APP_BASE_PATH: "", JWT_SECRET: secret, CLIENT_ORIGIN: origin, PUBLIC_APP_URL: origin, ACCOUNTS_PROCESS_ENABLED: "0", GAME_WORKERS_ENABLED: "1", GAME_WORKERS: "2", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", SQLITE_PATH: path.join(temporary, "main.sqlite"), BUG_REPORT_UPLOAD_DIR: path.join(temporary, "bugs"), PATCHNOTES_UPLOAD_DIR: path.join(temporary, "images"), ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "PATCHNOTES_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "CONTACT_NOTICE_DB_PATH", "EXECUTION_DB_PATH"].map(key => [key, path.join(temporary, `${key}.sqlite`)])) });
  start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", new URL(origin).port, "--strictPort"], path.join(root, "client"), { VITE_API_URL: api, VITE_BASE_PATH: "/", VITE_SOCKET_URL: api, VITE_SOCKET_PATH: "/socket.io" });
  await until(async () => (await fetch(api + "/api/health")).ok && (await fetch(origin)).ok, "servers");
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(value => { localStorage.setItem("ktgame-token", value); localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })); }, token);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); await blocker.enableBlockingInPage(page);
  await page.goto(origin + "/admin");
  async function openSettings() { await page.getByRole("button", { name: "Paramètres", exact: true }).click(); await page.getByRole("button", { name: "XP et titres", exact: true }).click(); await page.locator('.xp-settings').waitFor(); }
  await openSettings();
  const completion = page.getByLabel("XP par participant supplémentaire · partie terminée", { exact: true });
  const victory = page.getByLabel("XP par participant supplémentaire · victoire", { exact: true });
  assert.equal(await completion.inputValue(), "10"); assert.equal(await victory.inputValue(), "5");
  await completion.fill("12"); await victory.fill("7"); await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await until(async () => (await request('/api/admin')).settings.gameProgression.completionParticipantXp === 12, 'common coefficients saved');
  await page.getByLabel("Jeu de progression", { exact: true }).selectOption("yahtzee");
  assert.equal(await completion.inputValue(), "12"); assert.equal(await victory.inputValue(), "7");
  await completion.fill("3"); await victory.fill("0"); await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await until(async () => (await request('/api/admin')).settings.gameProgression.games.yahtzee.victoryParticipantXp === 0, 'game override saved');
  await page.getByLabel("Jeu de progression", { exact: true }).selectOption("blackjack");
  assert.equal(await completion.inputValue(), "12"); assert.equal(await victory.inputValue(), "7");
  await page.reload(); await openSettings();
  assert.equal(await completion.inputValue(), "12"); assert.equal(await victory.inputValue(), "7");
  await page.getByLabel("Jeu de progression", { exact: true }).selectOption("yahtzee");
  assert.equal(await completion.inputValue(), "3"); assert.equal(await victory.inputValue(), "0");
  for (const [name, viewport] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport); await completion.scrollIntoViewIfNeeded();
    assert.ok(await completion.isVisible()); await victory.scrollIntoViewIfNeeded(); assert.ok(await victory.isVisible());
    assert.ok(await page.locator('.xp-participant-help').evaluate(node => node.getBoundingClientRect().top >= node.previousElementSibling.getBoundingClientRect().bottom + 6), `${name}: help stays clear of the inputs`);
    const size = await page.locator('.xp-settings').evaluate(node => ({ width: node.clientWidth, content: node.scrollWidth }));
    assert.ok(size.content <= size.width + 1, `${name}: no horizontal overflow`);
    await page.screenshot({ path: path.join(output, `coefficients-${name}.png`) });
  }
  assert.deepEqual(errors, []);
  const settings = (await request('/api/admin')).settings.gameProgression;
  assert.equal(settings.victoryParticipantXp, 7); assert.equal(settings.games.yahtzee.completionParticipantXp, 3);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: true, output, blocker: true, common: { completionParticipantXp: settings.completionParticipantXp, victoryParticipantXp: settings.victoryParticipantXp }, yahtzee: settings.games.yahtzee, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, output, blocker: true, persisted: true }));
} catch (error) {
  console.error(logs.slice(-2000));
  const page = browser?.contexts()[0]?.pages()[0]; if (page) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); console.error((await page.locator('body').innerText()).slice(-3000)); }
  throw error;
} finally {
  await browser?.close();
  for (const child of processes) if (child.exitCode === null && !child.signalCode) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir())); assert.ok(path.basename(temporary).startsWith('ktga-xp-participants-')); fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
