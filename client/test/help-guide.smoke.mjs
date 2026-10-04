import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";
import bcrypt from "../../server/node_modules/bcryptjs/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "ktga-help-guide-"));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
async function port() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const value = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return value;
}
const apiOrigin = `http://127.0.0.1:${await port()}`;
const origin = `http://127.0.0.1:${await port()}`;
const secret = randomBytes(32).toString("hex");
const token = (id) => jwt.sign({ id, guest: false, sessionVersion: 0 }, secret, { expiresIn: "1h" });
const accountPassword = "AccountSecret123!";
const passwordHash = await bcrypt.hash(accountPassword, 4);
const database = new DatabaseSync(path.join(temporary, "main.sqlite"));
database.exec("CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER NOT NULL DEFAULT 0); CREATE TABLE rooms(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,game_id TEXT NOT NULL,is_public INTEGER NOT NULL DEFAULT 1,finished INTEGER NOT NULL DEFAULT 0,created_at TEXT,data TEXT NOT NULL);");
for (const id of ["alpha", "beta", "editor", "newbie"]) {
  const user = { id, pseudo: id, email: `${id}@example.com`, passwordHash, guest: false, active: true, admin: false, editor: id === "editor", createdAt: id === "newbie" ? new Date(Date.now() + 60000).toISOString() : "2020-01-01T00:00:00Z", tokens: 100000, passwordPolicyVersion: 1, emailVerifiedAt: new Date().toISOString(), profile: { displayName: id === "alpha" ? "Alice" : "Bob", birthDate: "2000-01-01" }, friends: [], friendRequests: { incoming: [], outgoing: [] } };
  database.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), user.pseudo, user.email);
}
database.close();
const processes = [];
let output = "";
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  processes.push(child);
}
async function waitFor(check, label) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* Wait for the isolated servers or browser. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}\n${output.slice(-3000)}`);
}
async function request(id, endpoint, body, status = 200, method = "POST") {
  const response = await fetch(`${apiOrigin}${endpoint}`, { method, headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.equal(response.status, status, `${endpoint}: ${JSON.stringify(data)}`);
  return data;
}

let browser;
try {
  start(["src/index.js"], path.join(root, "server"), {
    NODE_ENV: "test", PORT: new URL(apiOrigin).port, HOST: "127.0.0.1", JWT_SECRET: secret, CLIENT_ORIGIN: origin, CLIENT_DIST: "", APP_BASE_PATH: "", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", EMAIL_FROM: "", SQLITE_PATH: path.join(temporary, "main.sqlite"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "PATCHNOTES_DB_PATH", "REQUEST_LOG_PATH"].map((key) => [key, path.join(temporary, `${key}.sqlite`)]))
  });
  start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", new URL(origin).port, "--strictPort"], path.join(root, "client"), { VITE_API_URL: apiOrigin, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: "/socket.io", VITE_BASE_PATH: "/" });
  await waitFor(async () => (await fetch(`${apiOrigin}/api/health`)).ok && (await fetch(origin)).ok, "isolated servers");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  let blocker;
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  }
  const errors = [];
  async function pageFor(id) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    if (id) await context.addCookies([{ name: "ktga_session", value: token(id), url: apiOrigin, httpOnly: true, sameSite: "Lax" }]);
    await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    if (blocker) await blocker.enableBlockingInPage(page);
    return page;
  }
  const previews = path.join(root, "docs", "previews");

  mkdirSync(previews, { recursive: true });
  const page = await pageFor();
  console.log("Grouped FAQ with Ghostery...");
  await page.goto(`${origin}/faq`, { waitUntil: "domcontentloaded" });
  await page.locator(".player-help-topic").first().waitFor();
  const content = await request("editor", "/api/help", undefined, 200, "GET");
  const categories = [...new Set(content.entries.filter((entry) => entry.kind === "faq").map((entry) => entry.category))];
  assert.equal(await page.locator(".player-help-topic").count(), categories.length);
  for (const topic of await page.locator(".player-help-topic").all()) {
    assert.equal(await topic.locator("h2").count(), 1);
    assert.equal(await topic.locator("h2").evaluate((element) => getComputedStyle(element).color), "rgb(231, 196, 99)");
    assert.ok(await topic.locator(".player-help-question").count() > 0);
  }
  await page.locator(".player-help-question summary").first().click();
  await page.screenshot({ path: path.join(previews, "faq-grouped-desktop.png"), fullPage: true });
  await page.getByPlaceholder("Rechercher une question ou un sujet").fill("packs");
  assert.ok(await page.locator(".player-help-question").count() > 0);
  assert.ok(await page.locator(".player-help-topic").count() < categories.length);
  await page.getByPlaceholder("Rechercher une question ou un sujet").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(previews, "faq-grouped-mobile.png"), fullPage: true });
  console.log("Optional scenarios and actual reading progress...");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/guide`, { waitUntil: "domcontentloaded" });
  await page.locator(".player-help-chapter").first().waitFor();
  assert.equal(await page.locator(".player-help-chapter").count(), 10);
  const first = page.locator(".player-help-chapter").first();
  const scenario = first.locator(".player-help-scenario");
  let writes = 0;
  page.on("request", (req) => { if (req.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method())) writes++; });
  await scenario.getByRole("radio").first().check();
  await scenario.getByRole("status").getByText("Pas dans ce cas.", { exact: true }).waitFor();
  await scenario.getByRole("radio").nth(1).check();
  await scenario.getByRole("status").getByText("Bien vu !", { exact: true }).waitFor();
  assert.equal(writes, 0, "scenarios never mutate game or account data");
  await first.getByRole("checkbox").check();
  assert.equal(await page.getByRole("progressbar", { name: "Étapes parcourues", exact: true }).getAttribute("value"), "1");
  await page.screenshot({ path: path.join(previews, "guide-interactive-desktop.png") });
  await scenario.getByRole("button", { name: "Réessayer la question", exact: true }).click();
  assert.equal(await scenario.locator("input:checked").count(), 0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "guide fits narrow screens");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(previews, "guide-interactive-mobile.png") });
  await page.getByRole("button", { name: "Ouvrir le guide d’accueil", exact: true }).click();
  const welcome = page.locator(".player-help-welcome");
  await welcome.waitFor();
  await welcome.getByRole("button", { name: "On continue ?", exact: true }).click();
  await welcome.getByRole("heading", { name: "Créer ou rejoindre une table", exact: true }).waitFor();
  await welcome.getByRole("button", { name: /Étape 8/ }).click();
  assert.equal(await welcome.getByRole("progressbar", { name: "Étapes explorées", exact: true }).getAttribute("value"), "3");
  await welcome.getByRole("button", { name: /Étape 1 :/ }).click();
  await page.screenshot({ path: path.join(previews, "welcome-interactive-mobile.png") });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Ouvrir le guide d’accueil", exact: true }).click();
  await page.screenshot({ path: path.join(previews, "welcome-interactive-desktop.png") });
  await page.keyboard.press("Escape");
  console.log("Framed administration, scenario editing and persistence...");
  const edit = await pageFor("editor");
  await edit.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
  await edit.getByRole("button", { name: "FAQ et tutos", exact: true }).click();
  const editor = edit.locator(".card.player-help-editor");
  await editor.waitFor();
  assert.equal(await editor.evaluate((element) => getComputedStyle(element).borderTopWidth), "1px");
  await edit.screenshot({ path: path.join(previews, "help-framed-admin-desktop.png"), fullPage: true });
  await edit.getByRole("button", { name: "Tutos et accueil", exact: true }).click();
  await edit.getByLabel("Accroche personnelle", { exact: true }).fill("Prends place, on découvre les tables ensemble.");
  await edit.getByLabel("Question aux joueurs", { exact: true }).fill("Prêt pour une petite partie ?");
  await edit.getByLabel("Réponse 1", { exact: true }).fill("Oui, à mon rythme.");
  await edit.getByLabel("Réponse 2", { exact: true }).fill("Je dois tout lire avant.");
  await edit.getByRole("radio", { name: "Définir la réponse 1 comme correcte", exact: true }).check();
  await edit.getByLabel("Explication après le choix", { exact: true }).fill("Tu peux découvrir le guide à ton rythme, sans obligation.");
  await edit.getByRole("button", { name: "Ajouter une réponse", exact: true }).click();
  await edit.getByLabel("Réponse 3", { exact: true }).fill("Une autre réponse.");
  await edit.getByRole("button", { name: "Retirer la réponse 3", exact: true }).click();
  await edit.getByRole("button", { name: "Aperçu", exact: true }).click();
  await edit.locator(".player-help-editor-preview").getByRole("radio").first().check();
  await edit.locator(".player-help-editor-preview").getByRole("status").getByText("Bien vu !", { exact: true }).waitFor();
  const saved = edit.waitForResponse((res) => res.url().endsWith("/api/admin/help") && res.request().method() === "PUT");
  await edit.locator(".player-help-editor-toolbar").getByRole("button", { name: "Enregistrer", exact: true }).click();
  assert.equal((await saved).status(), 200);
  await page.goto(`${origin}/guide`, { waitUntil: "domcontentloaded" });
  await page.getByText("Prends place, on découvre les tables ensemble.", { exact: true }).waitFor();
  await page.locator(".player-help-chapter").first().getByRole("radio", { name: "Oui, à mon rythme.", exact: true }).check();
  await page.locator(".player-help-chapter").first().getByRole("status").getByText("Bien vu !", { exact: true }).waitFor();
  await edit.getByRole("button", { name: "Texte Markdown", exact: true }).click();
  await edit.screenshot({ path: path.join(previews, "guide-editor-desktop.png"), fullPage: true });
  for (const width of [390, 320]) {
    await edit.setViewportSize({ width, height: 844 });
    assert.equal(await edit.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "editor fits narrow screens");
  }
  await edit.setViewportSize({ width: 390, height: 844 });
  await edit.screenshot({ path: path.join(previews, "guide-editor-mobile.png"), fullPage: true });
  await edit.getByRole("checkbox", { name: "Question facultative", exact: true }).uncheck();
  const savedWithoutQuestion = edit.waitForResponse((res) => res.url().endsWith("/api/admin/help") && res.request().method() === "PUT");
  await edit.locator(".player-help-editor-toolbar").getByRole("button", { name: "Enregistrer", exact: true }).click();
  assert.equal((await savedWithoutQuestion).status(), 200);
  const result = await request("editor", "/api/admin/help", undefined, 200, "GET");
  assert.equal(result.entries.find((entry) => entry.id === "guide-start").challenge, null);
  const newbie = await pageFor("newbie");
  await newbie.goto(origin, { waitUntil: "domcontentloaded" });
  await newbie.locator(".player-help-welcome").waitFor();
  await newbie.getByRole("button", { name: "Plus tard", exact: true }).click();
  await waitFor(async () => !(await request("newbie", "/api/me/help", undefined, 200, "GET")).needsWelcome, "welcome dismissal");
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log("Grouped FAQ, interactive guides and framed admin verified with desktop, mobile and content blocker.");
} finally {
  await browser?.close();
  for (const child of processes) if (child.exitCode === null) child.kill();
  await Promise.all(processes.map((child) => child.exitCode !== null ? Promise.resolve() : new Promise((resolve) => child.once("exit", resolve))));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
  rmSync(temporary, { recursive: true, force: true });
}


