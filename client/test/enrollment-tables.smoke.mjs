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
import { io } from "../node_modules/socket.io-client/build/esm-debug/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "ktga-enrollment-tables-"));
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
for (const id of ["alpha", "beta"]) {
  const user = { id, pseudo: id, email: `${id}@example.com`, passwordHash, guest: false, active: true, admin: false, tokens: 10000, passwordPolicyVersion: 1, emailVerifiedAt: new Date().toISOString(), profile: { displayName: id === "alpha" ? "Alice" : "Bob", birthDate: "2000-01-01" }, friends: [], friendRequests: { incoming: [], outgoing: [] } };
  database.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), user.pseudo, user.email);
}
database.close();
const processes = [];
const sockets = [];
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
async function watch(room) {
  const socket = io(apiOrigin, { auth: { token: token("beta") }, transports: ["websocket"] });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Room watcher timed out")), 10000);
    socket.once("room", () => { clearTimeout(timer); resolve(); });
    socket.once("connect", () => socket.emit("watch-room", { roomId: room.id }));
  });
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
  const anonymous = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const authenticated = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await authenticated.addCookies([{ name: "ktga_session", value: token("alpha"), url: apiOrigin, httpOnly: true, sameSite: "Lax" }]);
  for (const context of [anonymous, authenticated]) await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
  let blocker;
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  }
  const errors = [];
  const newPage = async (context) => {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    if (blocker) await blocker.enableBlockingInPage(page);
    return page;
  };
  const signup = await newPage(anonymous);
  console.log("Checking signup fields...");
  await signup.goto(origin, { waitUntil: "domcontentloaded" });
  await signup.getByRole("button", { name: "Inscription", exact: true }).click();
  const password = signup.getByLabel("Mot de passe", { exact: true });
  const confirmation = signup.getByLabel("Confirmer le mot de passe", { exact: true });
  const submit = signup.getByRole("button", { name: "Créer le compte", exact: true });
  assert.equal(await signup.locator(".password-requirements .is-missing").count(), 4);
  await password.fill(accountPassword);
  await confirmation.fill(`${accountPassword}x`);
  await signup.getByText("Les mots de passe ne correspondent pas.", { exact: true }).waitFor();
  assert.equal(await confirmation.getAttribute("aria-invalid"), "true");
  assert.equal(await submit.isDisabled(), true);
  await confirmation.fill(accountPassword);
  await signup.getByText("Les mots de passe correspondent.", { exact: true }).waitFor();
  assert.equal(await submit.isEnabled(), true);
  assert.equal(await signup.locator(".password-requirements .is-met").count(), 4);
  for (const input of [password, confirmation]) {
    for (const type of ["copy", "cut", "paste", "drop"]) {
      assert.equal(await input.evaluate((element, eventType) => {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }, type), true, `${type} blocked at signup`);
    }
    assert.equal(await input.inputValue(), accountPassword);
  }
  await signup.getByRole("button", { name: "Afficher : Mot de passe", exact: true }).click();
  assert.equal(await password.getAttribute("type"), "text");
  assert.equal(await confirmation.getAttribute("type"), "password");
  await signup.getByRole("button", { name: "Afficher : Confirmer le mot de passe", exact: true }).click();
  assert.equal(await confirmation.getAttribute("type"), "text");
  await signup.getByRole("button", { name: "Masquer : Mot de passe", exact: true }).click();
  await signup.getByRole("button", { name: "Masquer : Confirmer le mot de passe", exact: true }).click();
  for (const input of [password, confirmation]) {
    const inputBounds = await input.boundingBox();
    const eyeBounds = await input.locator("..").getByRole("button").boundingBox();
    assert.ok(eyeBounds.x >= inputBounds.x && eyeBounds.x + eyeBounds.width <= inputBounds.x + inputBounds.width && eyeBounds.y >= inputBounds.y && eyeBounds.y + eyeBounds.height <= inputBounds.y + inputBounds.height, "eye stays inside its field after toggling");
  }
  await password.fill(`${accountPassword}2`);
  assert.equal(await submit.isDisabled(), true, "editing the first password invalidates its confirmation");
  const previews = path.join(root, "docs", "previews");
  mkdirSync(previews, { recursive: true });
  await signup.screenshot({ path: path.join(previews, "signup-password-feedback-desktop.png"), fullPage: true });
  await signup.setViewportSize({ width: 390, height: 844 });
  await signup.screenshot({ path: path.join(previews, "signup-password-feedback-mobile.png"), fullPage: true });
  await signup.getByRole("button", { name: "Connexion", exact: true }).click();
  assert.equal(await signup.getByLabel("Mot de passe", { exact: true }).evaluate((element) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }), false, "login still supports password managers and paste");
  const before = await request("alpha", "/api/rooms", undefined, 200, "GET");
  console.log("Checking server credential guards...");
  for (const body of [{ name: "alpha@example.com" }, { name: "Table beta@example.com" }, { name: accountPassword }, { name: "Table ordinaire", password: accountPassword }, { name: "CodeSecret", password: "CodeSecret" }]) {
    const failure = await request("alpha", "/api/rooms", { gameId: "yahtzee", stake: 10, ...body }, 400);
    assert.ok(failure.error);
    assert.equal(JSON.stringify(failure).includes(accountPassword), false, "errors never echo a secret");
  }
  assert.equal((await request("alpha", "/api/rooms", undefined, 200, "GET")).length, before.length, "rejected credentials never become public rooms");
  const defaultRoom = await request("alpha", "/api/rooms", { gameId: "yahtzee", stake: 10, isPublic: false });
  assert.equal(defaultRoom.name, "Yahtzee de Alice", "default public title uses the display name, not the login");
  const waiting = await request("beta", "/api/rooms", { gameId: "yahtzee", stake: 10, name: "Table ouverte" });
  await watch(waiting);
  const protectedRoom = await request("beta", "/api/rooms", { gameId: "yahtzee", stake: 10, name: "Table avec code", password: "TableCode987!" });
  await watch(protectedRoom);
  const running = await request("beta", "/api/rooms", { gameId: "yahtzee", stake: 10, name: "Table en cours" });
  await watch(running);
  await request("beta", `/api/rooms/${running.code}/start`, {});
  const page = await newPage(authenticated);
  console.log("Checking table discovery and creation...");
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const gameCard = page.locator(".game-card").filter({ has: page.getByRole("heading", { name: "Yahtzee", exact: true }) });
  await gameCard.getByRole("button", { name: "Créer une table", exact: true }).waitFor();
  const dialog = page.locator(".game-table-dialog");
  await gameCard.getByRole("button", { name: /^Rejoindre/ }).click();
  await dialog.getByRole("heading", { name: "Rejoindre une table publique" }).waitFor();
  assert.equal(await dialog.locator(".game-table-entry").count(), 3);
  assert.equal(await dialog.getByLabel("Nom public (facultatif)").count(), 0, "joining never presents the creation fields");
  await page.screenshot({ path: path.join(previews, "public-tables-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(previews, "public-tables-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("tab", { name: "Créer une table", exact: true }).click();
  const title = dialog.getByLabel("Nom public (facultatif)");
  assert.equal(await title.inputValue(), "");
  assert.equal(await title.getAttribute("readonly"), "");
  assert.equal(await title.getAttribute("autocomplete"), "off");
  assert.equal(await dialog.locator('input[type="password"]').count(), 0, "access code does not exist until explicitly enabled");
  assert.equal(await title.getAttribute("placeholder"), "Yahtzee de Alice");
  await title.click();
  await title.fill("alpha@example.com");
  await dialog.getByRole("button", { name: "Créer la table", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "adresse email" }).waitFor();
  await title.fill("Soiree Yahtzee");
  await dialog.getByLabel("Protéger par un code d’accès").check();
  const accessCode = dialog.getByLabel("Code d’accès de la table", { exact: true });
  assert.equal(await accessCode.getAttribute("readonly"), "");
  assert.equal(await accessCode.getAttribute("autocomplete"), "new-password");
  assert.equal(await dialog.getByRole("button", { name: "Créer la table", exact: true }).isDisabled(), true);
  await accessCode.click();
  await accessCode.fill("UniqueTable123!");
  await page.screenshot({ path: path.join(previews, "create-table-desktop.png") });
  await dialog.getByRole("button", { name: "Règles du jeu", exact: true }).click();
  await page.locator(".rules-modal").getByRole("button", { name: "Fermer", exact: true }).click();
  assert.equal(await title.inputValue(), "Soiree Yahtzee", "reading rules preserves settings");
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator(".game-table-body").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: path.join(previews, "create-table-mobile.png") });
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.height <= 844 * 0.9 + 1 && bounds.x >= 0 && bounds.x + bounds.width <= 390, "modal fits the mobile viewport");
  await dialog.getByRole("button", { name: "Créer la table", exact: true }).waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Créer la table", exact: true }).click({ trial: true });
  await page.setViewportSize({ width: 320, height: 640 });
  await dialog.getByRole("button", { name: "Créer la table", exact: true }).click({ trial: true });
  assert.equal(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth), true, "no horizontal overflow on a narrow phone");
  await page.setViewportSize({ width: 844, height: 390 });
  await dialog.getByRole("button", { name: "Créer la table", exact: true }).click({ trial: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await accessCode.press("Enter");
  await page.waitForURL(/\/table\//);
  await page.getByRole("heading", { name: "Soiree Yahtzee", exact: true }).waitFor();
  const created = (await request("alpha", "/api/rooms", undefined, 200, "GET")).find((room) => room.name === "Soiree Yahtzee");
  assert.ok(created?.hasPassword);
  assert.equal(JSON.stringify(created).includes("UniqueTable123!"), false);
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await gameCard.getByRole("button", { name: /^Rejoindre/ }).click();
  await dialog.locator(".game-table-entry").filter({ hasText: "Table ouverte" }).getByRole("button", { name: "Rejoindre", exact: true }).click();
  await page.waitForURL(`**/table/${waiting.code}`);
  await page.getByRole("heading", { name: "Table ouverte", exact: true }).waitFor();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await gameCard.getByRole("button", { name: /^Rejoindre/ }).click();
  await dialog.locator(".game-table-entry").filter({ hasText: "Table avec code" }).getByRole("button", { name: "Rejoindre", exact: true }).click();
  await page.getByLabel("Code d’accès de la table", { exact: true }).fill("TableCode987!");
  await page.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await page.getByRole("heading", { name: "Table avec code", exact: true }).waitFor();
  const viaCode = await request("beta", "/api/rooms", { gameId: "yahtzee", stake: 10, name: "Table via code", password: "InviteCode456!" });
  await watch(viaCode);
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await gameCard.getByRole("button", { name: /^Rejoindre/ }).click();
  await dialog.getByRole("button", { name: "J’ai un code", exact: true }).click();
  const joinDialog = page.locator(".join-code-modal");
  await joinDialog.getByLabel("Code de la table", { exact: true }).fill(viaCode.code);
  assert.equal(await joinDialog.locator('input[type="password"]').count(), 0);
  await joinDialog.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await joinDialog.getByLabel("Mot de passe de la table").fill("InviteCode456!");
  await joinDialog.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await page.getByRole("heading", { name: "Table via code", exact: true }).waitFor();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await gameCard.getByRole("button", { name: /^Rejoindre/ }).click();
  await dialog.locator(".game-table-entry").filter({ hasText: "Table en cours" }).getByRole("button", { name: "Rejoindre", exact: true }).click();
  await page.waitForURL(`**/table/${running.code}`);
  const joined = await request("alpha", `/api/rooms/${running.code}`, undefined, 200, "GET");
  assert.equal(joined.players.some((player) => player.id === "alpha"), false, "running table is joined as a spectator");
  assert.deepEqual(errors, []);
  console.log("PASS: signup clipboard protection, independent eyes, live mismatch and criteria, login paste preserved.");
  console.log("PASS: public discovery, protected join, spectator join, creation, keyboard submit, safe defaults and credentials rejected before publication.");
  console.log("PASS: desktop/mobile screenshots and viewport bounds; " + (blocker ? "Ghostery enabled." : "content blocker not requested."));
} finally {
  await browser?.close();
  for (const socket of sockets) socket.disconnect();
  for (const child of processes) {
    if (child.exitCode !== null) continue;
    await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
  }
  if (path.dirname(temporary) === path.resolve(tmpdir()) && path.basename(temporary).startsWith("ktga-enrollment-tables-")) rmSync(temporary, { recursive: true, force: true });
}
