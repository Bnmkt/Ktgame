import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";
import bcrypt from "../../server/node_modules/bcryptjs/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "ktga-account-rights-"));
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
  const user = { id, pseudo: id, email: `${id}@example.com`, passwordHash, guest: false, active: true, admin: id === "editor", editor: id === "editor", createdAt: id === "newbie" ? new Date(Date.now() + 60000).toISOString() : "2020-01-01T00:00:00Z", tokens: 100000, passwordPolicyVersion: 1, emailVerifiedAt: new Date().toISOString(), profile: { displayName: id === "alpha" ? "Alice" : "Bob", birthDate: "2000-01-01" }, friends: [], friendRequests: { incoming: [], outgoing: [] } };
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


const smtp = createServer((socket) => {
  let buffer = "", collecting = false, mail = "";
  socket.setEncoding("utf8"); socket.write("220 localhost fixture\r\n");
  socket.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\r\n")) {
      const at = buffer.indexOf("\r\n"); const line = buffer.slice(0, at); buffer = buffer.slice(at + 2);
      if (collecting) {
        if (line === ".") { mails.push(mail); mail = ""; collecting = false; socket.write("250 queued\r\n"); }
        else mail += line + "\r\n";
      } else if (/^EHLO|^HELO/.test(line)) socket.write("250 localhost\r\n");
      else if (line === "DATA") { collecting = true; socket.write("354 data\r\n"); }
      else if (line === "QUIT") socket.end("221 bye\r\n");
      else socket.write("250 ok\r\n");
    }
  });
});
const mails = [];
await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
let browser;
try {
  start(["src/index.js"], path.join(root, "server"), {
    NODE_ENV: "test", PORT: new URL(apiOrigin).port, HOST: "127.0.0.1", JWT_SECRET: secret, CLIENT_ORIGIN: origin, CLIENT_DIST: "", APP_BASE_PATH: "", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.address().port), SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "fixture@example.com", SQLITE_PATH: path.join(temporary, "main.sqlite"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "PATCHNOTES_DB_PATH", "REQUEST_LOG_PATH"].map((key) => [key, path.join(temporary, `${key}.sqlite`)])),
    HELP_DB_PATH: path.join(temporary, "help.sqlite"), DATA_REQUEST_DB_PATH: path.join(temporary, "rights.sqlite"), PATCHNOTES_UPLOAD_DIR: path.join(temporary, "images")
  });
  start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", new URL(origin).port, "--strictPort"], path.join(root, "client"), { VITE_API_URL: apiOrigin, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: "/socket.io", VITE_BASE_PATH: "/" });
  await waitFor(async () => (await fetch(`${apiOrigin}/api/health`)).ok && (await fetch(origin)).ok, "isolated servers");
  const fixture = new DatabaseSync(path.join(temporary, "main.sqlite"));
  fixture.exec("BEGIN");
  for (let i = 0; i < 650; i++) {
    const data = { id: `tx-${i}`, userId: "alpha", amount: 1, balance: 1000 + i, reason: "fixture", createdAt: "2026-01-01T00:00:00Z" };
    fixture.prepare("INSERT INTO transactions(id,user_id,created_at,data,amount,balance,reason,day) VALUES(?,?,?,?,?,?,?,?)").run(data.id, "alpha", data.createdAt, JSON.stringify(data), 1, data.balance, "fixture", "2026-01-01");
  }
  fixture.exec("COMMIT"); fixture.close();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  let blocker;
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  }
  const errors = [];
  async function pageFor(id, timezoneId = "Europe/Brussels") {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId });
    await context.addCookies([{ name: "ktga_session", value: token(id), url: apiOrigin, httpOnly: true, sameSite: "Lax" }]);
    await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    if (blocker) await blocker.enableBlockingInPage(page);
    return page;
  }
  const previews = path.join(root, "docs", "previews"); mkdirSync(previews, { recursive: true });
  const player = await pageFor("alpha");
  console.log("Player data request with Ghostery...");
  await player.goto(`${origin}/profil`, { waitUntil: "domcontentloaded" });
  await player.getByRole("button", { name: "Carte et confidentialité", exact: true }).click();
  await player.getByRole("button", { name: "Demander mes données", exact: true }).click();
  await player.getByLabel("Mot de passe actuel", { exact: true }).fill(accountPassword);
  await player.getByRole("button", { name: "Confirmer la demande", exact: true }).click();
  await player.getByText("Approbation en attente", { exact: true }).waitFor();
  await player.screenshot({ path: path.join(previews, "account-data-request-desktop.png"), fullPage: true });
  const rights = await request("alpha", "/api/me/data-requests", undefined, 200, "GET");
  assert.equal(rights.requests.length, 1); assert.equal(mails.filter((mail) => mail.includes("application/zip")).length, 0);
  assert.equal((await request("beta", "/api/me/data-requests", undefined, 200, "GET")).requests.length, 0);
  await request("alpha", `/api/admin/users/alpha/data-requests/${rights.requests[0].id}/approve`, undefined, 403);
  const admin = await pageFor("editor");
  console.log("Unified account editor and guarded actions...");
  await request("editor", "/api/admin", undefined, 200, "GET");
  await admin.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: /^Comptes joueurs/ }).first().click();
  await admin.locator("tr").filter({ hasText: "alpha@example.com" }).getByRole("button", { name: /Modifier/ }).click();
  await admin.getByRole("button", { name: "Consulter la demande", exact: true }).waitFor();
  await admin.getByRole("button", { name: "Profil et accès", exact: true }).click();
  await admin.getByLabel("Genre", { exact: true }).selectOption("Non-binaire");
  await admin.getByLabel("Pseudo affiché", { exact: true }).fill("Alice Modifiée");
  await admin.locator(".admin-user-editor-footer").getByRole("button", { name: /Enregistrer/ }).click();
  await admin.locator(".admin-user-editor-footer").getByText("Fiche à jour", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "Connexion et sécurité", exact: true }).click();
  await admin.getByRole("heading", { name: "Double authentification", exact: true }).waitFor();
  await admin.getByRole("button", { name: "Modération", exact: true }).click();
  await admin.locator(".account-admin-toggle").filter({ hasText: "Softban" }).getByRole("checkbox").check();
  await admin.getByLabel("Motif du softban", { exact: true }).fill("Fixture de validation des heures");
  await admin.getByLabel("Fin du softban", { exact: true }).fill("2027-07-01T12:00");
  await admin.locator(".admin-user-editor-footer").getByRole("button", { name: /Enregistrer/ }).click();
  await waitFor(async () => (await request("editor", "/api/admin/users/alpha", undefined, 200, "GET")).user.moderation.softBan.endsAt === "2027-07-01T10:00:00.000Z", "sanction local/UTC");
  await admin.getByRole("button", { name: "Modération", exact: true }).click();
  assert.equal(await admin.getByLabel("Fin du softban", { exact: true }).inputValue(), "2027-07-01T12:00");
  await admin.getByRole("button", { name: "Identité et favoris", exact: true }).click();
  await admin.screenshot({ path: path.join(previews, "admin-account-unified-desktop.png"), fullPage: true });
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.getByLabel("Section du compte", { exact: true }).selectOption("security");
  await admin.getByLabel("Section du compte", { exact: true }).selectOption("identity");
  await admin.getByLabel("Pseudo affiché", { exact: true }).waitFor();
  await admin.waitForTimeout(400);
  await admin.screenshot({ path: path.join(previews, "admin-account-unified-mobile.png"), fullPage: true });
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await admin.setViewportSize({ width: 1440, height: 1000 });
  console.log("Explicit approval and real ZIP SMTP attachment...");
  await admin.getByRole("button", { name: "Demandes de données", exact: true }).click();
  await admin.getByRole("button", { name: "Approuver et envoyer", exact: true }).click();
  assert.equal(mails.filter((mail) => mail.includes("application/zip")).length, 0);
  await admin.getByRole("dialog").getByRole("button", { name: "Approuver et envoyer", exact: true }).click();
  let delivery;
  for (let i = 0; i < 100; i++) {
    delivery = (await request("editor", "/api/admin/users/alpha/data-requests", undefined, 200, "GET")).requests[0];
    if (["sent", "failed"].includes(delivery.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(delivery.status, "sent", JSON.stringify(delivery));
  const sent = mails.find((mail) => mail.includes("application/zip")); assert.ok(sent);
  assert.ok(sent.includes("To: alpha@example.com")); assert.equal(sent.includes("beta@example.com"), false);
  const match = sent.match(/Content-Type: application\/zip[^]*?Content-Transfer-Encoding: base64[^]*?\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/);
  assert.ok(match, "ZIP attachment in MIME");
  const zip = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  const { inflateRawSync } = await import("node:zlib");
  const files = new Map();
  for (let at = 0; at < zip.length - 46; at++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) continue;
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20), nameSize = zip.readUInt16LE(at + 28), extra = zip.readUInt16LE(at + 30), comment = zip.readUInt16LE(at + 32), offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameSize).toString();
    const localStart = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const compressed = zip.subarray(localStart, localStart + size);
    files.set(name, (method === 8 ? inflateRawSync(compressed) : compressed).toString());
    at += 45 + nameSize + extra + comment;
  }
  assert.ok(files.has("LIRE-MOI.txt")); assert.ok(files.has("compte.json"));
  const account = JSON.parse(files.get("compte.json")); assert.equal(account.id, "alpha"); assert.equal(account.passwordHash, undefined); assert.equal(account.profile.gender, "Non-binaire");
  assert.equal(files.get("transactions.jsonl").trim().split("\n").length >= 650, true);
  assert.equal([...files.values()].join("").includes(passwordHash), false);
  assert.equal([...files.values()].join("").includes("beta@example.com"), false);
  assert.ok(files.has("contributions-catalogue.json"));
  const { dataRequestEmail } = await import("../../server/src/services/data-request-email.js");
  const emailPage = await browser.newPage({ viewport: { width: 760, height: 720 } });
  await emailPage.setContent(dataRequestEmail({ user: { pseudo: "Alice", profile: { displayName: "Alice" } }, request: delivery, kind: "sent" }).html);
  await emailPage.screenshot({ path: path.join(previews, "data-export-email.png"), fullPage: true });
  await emailPage.close();
  await admin.locator(".rights-request-panel").getByText("Archive envoyée", { exact: true }).waitFor();
  await admin.locator(".admin-user-editor-body").evaluate((element) => { element.scrollTop = 0; });
  await admin.screenshot({ path: path.join(previews, "admin-data-request-sent.png"), fullPage: true });
  await player.getByRole("button", { name: "Actualiser les demandes", exact: true }).click();
  await player.getByText("Archive envoyée", { exact: true }).waitFor();
  await player.setViewportSize({ width: 390, height: 844 });
  await player.screenshot({ path: path.join(previews, "account-data-request-mobile.png"), fullPage: true });
  assert.equal(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("Incident dates preserve the repeated autumn hour...");
  await admin.locator(".admin-user-editor-title").getByRole("button", { name: "Fermer", exact: true }).click();
  await request("editor", "/api/admin/status/incidents", { title: "Fixture horodatage", message: "Un incident de test", type: "warning", state: "scheduled", components: ["website"], scheduledAt: "2026-10-25T01:30:45.000Z", updates: [{ state: "scheduled", createdAt: "2026-10-25T01:30:45.000Z", message: "Test" }] }, 201);
  await admin.getByRole("button", { name: "Supervision", exact: true }).click();
  await admin.getByRole("button", { name: "Statut public", exact: true }).click();
  await admin.locator(".status-admin-incident-list article").filter({ hasText: "Fixture horodatage" }).getByRole("button", { name: "Modifier", exact: true }).click();
  const incidentDialog = admin.getByRole("dialog");
  assert.equal(await incidentDialog.getByLabel("Heure du relevé concerné").inputValue(), "2026-10-25T02:30");
  await incidentDialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const status = await request("editor", "/api/admin/status", undefined, 200, "GET");
  const found = status.incidents.find((entry) => entry.title === "Fixture horodatage");
  assert.equal(found.scheduledAt, "2026-10-25T01:30:45.000Z");
  console.log("Private detected incidents remain editable after recovery...");
  const statusDb = new DatabaseSync(path.join(temporary, "STATUS_DB_PATH.sqlite"));
  const at = new Date(Date.now() - 600000).toISOString();
  statusDb.prepare("INSERT INTO status_detections(id,component_id,severity,title,description,first_at,last_at,recovered_at,diagnostic,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run("fixture-smtp", "email", "outage", "Fixture SMTP", "Connexion SMTP refusée. Cause à confirmer.", at, at, new Date().toISOString(), "Authentification refusée · EAUTH · AUTH · 535", at);
  statusDb.close();
  await request("beta", "/api/admin/status/detections", undefined, 403, "GET");
  await request("beta", "/api/admin/status/detections/fixture-smtp", { state: "closed", notes: "Interdit" }, 403, "PATCH");
  await admin.getByRole("button", { name: "Actualiser les incidents détectés", exact: true }).click();
  const detected = admin.locator(".status-detection-row").filter({ hasText: "Fixture SMTP" });
  await detected.getByRole("button", { name: "Compléter / clôturer", exact: true }).click();
  const followup = admin.getByRole("dialog");
  await followup.getByLabel("Analyse, actions et conclusion").fill("Cause **confirmée en test**, service rétabli. Note privée.");
  await followup.getByLabel("État du suivi").selectOption("closed");
  await followup.getByRole("button", { name: "Clôturer le suivi", exact: true }).click();
  await admin.locator(".status-detection-section").getByRole("button", { name: "Clôturés", exact: true }).click();
  await detected.getByText("Clôturé", { exact: true }).waitFor();
  const anonymous = await fetch(`${apiOrigin}/api/status`).then((response) => response.json());
  assert.equal(JSON.stringify(anonymous).includes("Note privée"), false);
  assert.equal(JSON.stringify(anonymous).includes("EAUTH"), false);
  await admin.locator(".status-detection-section").screenshot({ path: path.join(previews, "detected-incidents-desktop.png") });
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.locator(".status-detection-section").screenshot({ path: path.join(previews, "detected-incidents-mobile.png") });
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await detected.getByRole("button", { name: "Préparer un incident public", exact: true }).click();
  const publishing = admin.getByRole("dialog");
  assert.equal(await publishing.getByLabel("Heure du relevé concerné").inputValue(), await admin.evaluate((value) => {
    const date = new Date(value); const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }, at));
  assert.equal((await request("editor", "/api/admin/status", undefined, 200, "GET")).history.some((entry) => entry.title === "Fixture SMTP"), false);
  await publishing.getByRole("button", { name: "Publier", exact: true }).click();
  await waitFor(async () => (await request("editor", "/api/admin/status", undefined, 200, "GET")).history.some((entry) => entry.title === "Fixture SMTP"), "explicit incident publication");

  console.log("Muting a non-friend from the shared public profile...");
  const viewer = await pageFor("beta");
  await viewer.goto(origin, { waitUntil: "domcontentloaded" });
  await viewer.getByRole("button", { name: /^Ouvrir Social/ }).waitFor();
  await request("newbie", "/api/chat/messages", { channelType: "global", content: "Message du joueur à mettre en sourdine" }, 201);
  assert.equal((await request("beta", "/api/users/newbie/public", undefined, 200, "GET")).relationship.isFriend, false);
  await viewer.evaluate(() => window.dispatchEvent(new CustomEvent("ktga-public-profile", { detail: "newbie" })));
  const profileDialog = viewer.locator(".public-profile-modal");
  await profileDialog.getByRole("button", { name: "Mettre ce joueur en sourdine", exact: true }).click();
  await profileDialog.getByRole("button", { name: "Réactiver les messages de ce joueur", exact: true }).waitFor();
  assert.equal((await request("beta", "/api/users/newbie/public", undefined, 200, "GET")).relationship.muted, true);
  assert.equal((await request("beta", "/api/chat/messages?channelType=global", undefined, 200, "GET")).messages.some((entry) => entry.senderId === "newbie"), false);
  await viewer.screenshot({ path: path.join(previews, "public-profile-muted.png"), fullPage: true });
  await profileDialog.getByRole("button", { name: "Fermer le profil", exact: true }).click();
  await viewer.evaluate(() => window.dispatchEvent(new CustomEvent("ktga-public-profile", { detail: "newbie" })));
  await profileDialog.getByRole("button", { name: "Réactiver les messages de ce joueur", exact: true }).click();
  await profileDialog.getByRole("button", { name: "Mettre ce joueur en sourdine", exact: true }).waitFor();
  assert.equal((await request("beta", "/api/chat/messages?channelType=global", undefined, 200, "GET")).messages.some((entry) => entry.senderId === "newbie"), true);
  assert.deepEqual(errors, []);
  console.log("Passed account editor, dates, permissions, full ZIP and isolated SMTP with Ghostery.");
} catch (error) {
  console.error(output.slice(-3500));
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    console.error(page.url(), await page.locator("body").innerText().catch(() => ""));
  }
  throw error;
} finally {
  await browser?.close();
  for (const child of processes) child.kill();
  await Promise.all(processes.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((resolve) => child.once("exit", resolve))));
  await new Promise((resolve) => smtp.close(resolve));
  if (process.env.KEEP_SMOKE_TMP) console.log(temporary);
  else {
    const target = path.resolve(temporary);
    assert.equal(path.dirname(target), path.resolve(tmpdir()));
    assert.ok(path.basename(target).startsWith("ktga-account-rights-"));
    rmSync(target, { recursive: true, force: true });
  }
}
