import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url)), temporary = mkdtempSync(path.join(tmpdir(), "ktga-bugs-browser-"));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
async function port() { const server = createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); const value = server.address().port; await new Promise((resolve) => server.close(resolve)); return value; }
const apiOrigin = `http://127.0.0.1:${await port()}`, origin = `http://127.0.0.1:${await port()}`, base = "/ktga";
const secret = randomBytes(32).toString("hex"), token = (id) => jwt.sign({ id, guest: false, sessionVersion: 0 }, secret, { expiresIn: "1h" });
const database = new DatabaseSync(path.join(temporary, "main.sqlite"));
database.exec("CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER NOT NULL DEFAULT 0); CREATE TABLE rooms(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,game_id TEXT NOT NULL,is_public INTEGER NOT NULL DEFAULT 1,finished INTEGER NOT NULL DEFAULT 0,created_at TEXT,data TEXT NOT NULL);");
for (const id of ["alice", "bob", "editor", "admin"]) {
  const user = { id, pseudo: id, email: `${id}@example.com`, emailVerifiedAt: new Date().toISOString(), guest: false, active: true, admin: id === "admin", editor: id === "editor", createdAt: "2020-01-01T00:00:00Z", tokens: 100000, profile: { displayName: id, birthDate: "2000-01-01" }, friends: [], friendRequests: { incoming: [], outgoing: [] } };
  database.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), user.pseudo, user.email);
}
database.close();
const processes = []; let output = "", browser;
function start(args, cwd, env) { const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; }); processes.push(child); }
async function waitFor(check, label) { const end = Date.now() + 25000; while (Date.now() < end) { try { if (await check()) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`Timeout ${label}\n${output.slice(-3000)}`); }
async function request(user, endpoint, method = "GET", body, status = 200, receipt) {
  const response = await fetch(`${apiOrigin}${base}${endpoint}`, { method, headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), ...(receipt ? { "X-Bug-Receipt": receipt } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.equal(response.status, status, `${endpoint}: ${JSON.stringify(data)}`); return data;
}
const reportInput = (title) => ({ submissionId: randomUUID(), title, description: "Le bouton de lancer reste bloqué pendant la partie.", expected: "Un nouveau lancer possible", actual: "Le bouton est grisé", steps: "Ouvrir une table puis lancer les dés", category: "game", frequency: "always", impact: "major" });
try {
  start(["src/index.js"], path.join(root, "server"), { NODE_ENV: "test", PORT: new URL(apiOrigin).port, HOST: "127.0.0.1", JWT_SECRET: secret, CLIENT_ORIGIN: origin, CLIENT_DIST: "", APP_BASE_PATH: base, HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", SQLITE_PATH: path.join(temporary, "main.sqlite"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "PATCHNOTES_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH"].map((key) => [key, path.join(temporary, `${key}.sqlite`)])), BUG_REPORT_UPLOAD_DIR: path.join(temporary, "bug-images"), PATCHNOTES_UPLOAD_DIR: path.join(temporary, "note-images") });
  start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", new URL(origin).port, "--strictPort"], path.join(root, "client"), { VITE_API_URL: `${apiOrigin}${base}`, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: `${base}/socket.io`, VITE_BASE_PATH: `${base}/` });
  await waitFor(async () => (await fetch(`${apiOrigin}${base}/api/health`)).ok && (await fetch(`${origin}${base}/`)).ok, "servers");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  let blocker;
  if (process.env.BLOCKER_MODULE) { const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href); blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch); }
  const errors = [];
  async function pageFor(id) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Europe/Brussels" });
    if (id) await context.addCookies([{ name: "ktga_session", value: token(id), url: apiOrigin, httpOnly: true, sameSite: "Lax" }]);
    await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message)); if (blocker) await blocker.enableBlockingInPage(page); return page;
  }
  const previews = path.join(root, "docs", "previews"); mkdirSync(previews, { recursive: true });
  const player = await pageFor("alice"); await player.goto(`${origin}${base}/bugs`, { waitUntil: "domcontentloaded" });
  await player.getByRole("button", { name: "Signaler un bug", exact: true }).click();
  const form = player.locator(".issue-form-dialog"); await form.getByLabel("Titre", { exact: true }).fill("Le lancer reste bloqué");
  await form.getByLabel("Description", { exact: true }).fill("Le bouton de lancer ne se réactive pas après le premier lancer.");
  await form.getByLabel("Résultat attendu", { exact: true }).fill("Un deuxième lancer possible");
  await form.getByLabel("Résultat obtenu", { exact: true }).fill("Le bouton reste grisé");
  const inputBox = await form.getByLabel("Description", { exact: true }).boundingBox();
  await player.mouse.move(inputBox.x + 30, inputBox.y + 30); await player.mouse.down(); await player.mouse.move(3, 3, { steps: 8 }); await player.mouse.up();
  assert.equal(await form.isVisible(), true, "drag from modal must not close it");
  await player.screenshot({ path: path.join(previews, "bugs-report-desktop.png"), fullPage: true });
  await player.mouse.click(3, 3); assert.equal(await form.count(), 0, "voluntary overlay click closes");
  await player.getByRole("button", { name: "Signaler un bug", exact: true }).click(); assert.match(await form.getByLabel("Description", { exact: true }).inputValue(), /réactive/);
  await form.getByRole("button", { name: "Contexte et captures", exact: true }).click();
  assert.equal(await form.getByLabel("Page", { exact: true }).inputValue(), "/ktga/bugs");
  await form.getByRole("button", { name: "Vider le contexte", exact: true }).click(); await form.getByLabel("Zone du site", { exact: true }).fill("Email");
  const image = await player.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 100; const ctx = canvas.getContext("2d"); ctx.fillStyle = "#16694f"; ctx.fillRect(0, 0, 160, 100); ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif"; ctx.fillText("Capture du bug", 12, 55); return canvas.toDataURL("image/png").split(",")[1]; });
  await form.locator('input[type="file"]').setInputFiles([{ name: "capture.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") }, { name: "private.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") }]);
  await form.getByRole("heading", { name: "Captures · 2 / 6" }).waitFor();
  await form.getByRole("button", { name: "Diagnostic facultatif", exact: true }).click(); assert.equal(await form.getByRole("checkbox").isChecked(), false);
  const noConsentRequest = player.waitForRequest((req) => req.url().endsWith("/api/bugs") && req.method() === "POST");
  const submittedResponse = player.waitForResponse((res) => res.url().endsWith("/api/bugs") && res.request().method() === "POST");
  await form.getByRole("button", { name: "Envoyer le signalement", exact: true }).click();
  const payload = (await noConsentRequest).postDataJSON(); assert.equal(payload.diagnosticConsent, false); assert.ok(!Object.hasOwn(payload, "diagnostics"));
  const submitted = await (await submittedResponse).json(); const principal = submitted.report.id; assert.equal(submitted.report.images.length, 2); assert.equal(submitted.report.diagnostics, null);
  await form.getByRole("heading", { name: `BUG ${principal}`, exact: true }).waitFor();
  await form.getByRole("button", { name: "Nouveau signalement", exact: true }).click(); await form.getByLabel("Titre", { exact: true }).fill("Lancer bloqué avec diagnostic"); await form.getByLabel("Description", { exact: true }).fill("Le bouton reste bloqué lorsque je relance les dés.");
  await form.getByRole("button", { name: "Diagnostic facultatif", exact: true }).click(); await form.getByRole("checkbox").check();
  await player.evaluate(async () => { window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("SECRET password"), filename: "https://private.invalid/app.js?token=SECRET", lineno: 42 })); const { api } = await import("/ktga/src/api.js"); await api("/api/SECRET?token=SECRET", { background: true }).catch(() => {}); });
  const diagnosticResponse = player.waitForResponse((res) => res.url().endsWith("/api/bugs") && res.request().method() === "POST");
  await form.getByRole("button", { name: "Envoyer le signalement", exact: true }).click(); const diagnosticReport = (await (await diagnosticResponse).json()).report;
  assert.equal(diagnosticReport.diagnostics.javascript[0].line, 42); assert.equal(diagnosticReport.diagnostics.userId, "alice"); assert.ok(!JSON.stringify(diagnosticReport.diagnostics).includes("SECRET"));
  await form.getByRole("button", { name: "Fermer", exact: true }).click();
  const duplicate = (await request("bob", "/api/bugs", "POST", reportInput("Lancer bloqué pour Bob"), 201)).report.id;
  const dependency = (await request("bob", "/api/bugs", "POST", reportInput("Lancer bloqué avec dépendance"), 201)).report.id;
  await request("editor", `/api/admin/bugs/${duplicate}/relations`, "POST", { targetId: principal, type: "duplicate" });
  await request("editor", `/api/admin/bugs/${dependency}/relations`, "POST", { targetId: principal, type: "depends_on" });
  await request("bob", `/api/bugs/${principal}`, "GET", undefined, 404);
  const editor = await pageFor("editor"); await editor.goto(`${origin}${base}/admin`, { waitUntil: "domcontentloaded" });
  await editor.getByRole("button", { name: "Signalements de bugs", exact: true }).click();
  await editor.locator("tr").filter({ hasText: `BUG ${principal} ·` }).getByRole("button", { name: "Ouvrir", exact: true }).click();
  const dossier = editor.locator(".issue-editor-dialog").first(); await dossier.getByRole("button", { name: "Traitement", exact: true }).click();
  await dossier.getByLabel("Statut", { exact: true }).selectOption("reproduced"); await dossier.getByLabel("Priorité", { exact: true }).selectOption("high"); await dossier.getByLabel("Note interne", { exact: true }).fill("Analyse privée CONFIDENTIAL");
  await dossier.getByRole("button", { name: "Enregistrer", exact: true }).click(); await dossier.getByText("Modifications enregistrées.", { exact: true }).waitFor();
  await dossier.getByRole("button", { name: "Publication", exact: true }).click();
  await dossier.getByLabel("Titre public", { exact: true }).fill("Un bouton de lancer reste désactivé");
  await dossier.getByLabel("Description publique", { exact: true }).fill("Après un premier lancer, le bouton peut rester désactivé. Une correction est prévue.");
  await dossier.getByRole("checkbox", { name: "Publier cette capture", exact: true }).first().check();
  await dossier.getByRole("checkbox", { name: "Afficher ce bug dans le suivi public", exact: true }).check();
  await dossier.getByRole("checkbox", { name: /^J’ai vérifié/ }).check();
  await editor.screenshot({ path: path.join(previews, "bugs-admin-publication-desktop.png"), fullPage: true });
  await dossier.getByRole("button", { name: "Enregistrer", exact: true }).click(); await dossier.getByText("Modifications enregistrées.", { exact: true }).waitFor();
  const publicReport = await request(null, `/api/bugs/${principal}`); assert.equal(publicReport.images.length, 1); assert.equal(publicReport.privateView, false); assert.ok(!JSON.stringify(publicReport).includes("CONFIDENTIAL")); assert.ok(!Object.hasOwn(publicReport, "context"));
  await request("editor", `/api/bugs/${principal}`, "GET"); assert.equal((await request("editor", `/api/bugs/${principal}`)).reporterId, "alice");
  assert.equal((await fetch(`${apiOrigin}${base}/api/bugs/images/${submitted.report.images.find((entry) => entry.id !== publicReport.images[0].id).id}`)).status, 404);
  await dossier.getByRole("button", { name: "Résoudre et vérifier les liens", exact: true }).click();
  const resolving = editor.getByRole("dialog", { name: "Confirmer la résolution", exact: true });
  assert.equal(await resolving.getByRole("checkbox", { name: new RegExp(`BUG ${duplicate}`) }).isChecked(), true); assert.equal(await resolving.getByRole("checkbox", { name: new RegExp(`BUG ${dependency}`) }).isChecked(), false);
  await resolving.getByRole("button", { name: "Confirmer pour 2 dossier(s)", exact: true }).click(); await resolving.waitFor({ state: "hidden" });
  assert.equal((await request("editor", `/api/bugs/${duplicate}`)).status, "fixed"); assert.equal((await request("editor", `/api/bugs/${dependency}`)).status, "received");
  await dossier.getByRole("button", { name: "Fermer", exact: true }).click();
  await editor.locator("tr").filter({ hasText: `BUG ${dependency} ·` }).getByRole("checkbox").check();
  await editor.getByRole("button", { name: "Modifier en série", exact: true }).click();
  const batch = editor.getByRole("dialog", { name: "Modifier 1 signalements", exact: true }); await batch.getByLabel("Priorité", { exact: true }).selectOption("critical"); await batch.getByRole("button", { name: "Appliquer aux dossiers sélectionnés", exact: true }).click(); await batch.waitFor({ state: "hidden" });
  assert.equal((await request("editor", `/api/bugs/${dependency}`)).priority, "critical");
  await editor.goto(`${origin}${base}/bugs/${principal}`); await editor.getByRole("button", { name: "Informations privées", exact: true }).click(); await editor.getByText("Dossier privé · réservé aux administrateurs et éditeurs.", { exact: true }).waitFor(); assert.ok((await editor.locator(".issue-page-panel").innerText()).includes("CONFIDENTIAL"));
  await editor.goto(`${origin}${base}/admin`); await editor.getByRole("button", { name: /^Studio boutique/ }).click(); await editor.getByRole("button", { name: "Créer un objet", exact: true }).click();
  const studio = editor.locator(".shop-admin-editor"); await studio.getByLabel("Nom de l’élément", { exact: true }).fill("Brouillon conservé");
  const studioField = await studio.getByLabel("Nom de l’élément", { exact: true }).boundingBox(); await editor.mouse.move(studioField.x + 15, studioField.y + 10); await editor.mouse.down(); await editor.mouse.move(2, 2, { steps: 8 }); await editor.mouse.up();
  assert.equal(await studio.isVisible(), true); assert.equal(await studio.getByLabel("Nom de l’élément", { exact: true }).inputValue(), "Brouillon conservé"); await studio.getByRole("button", { name: "Annuler", exact: true }).click();
  const room = await request("alice", "/api/rooms", "POST", { gameId: "421", name: "Table de diagnostic", stake: 10, isPublic: true }, 200);
  await player.goto(`${origin}${base}/table/${room.code}`); await player.getByRole("button", { name: "Plein écran", exact: true }).click(); await player.getByRole("button", { name: "Signaler un bug", exact: true }).click();
  await player.locator(".issue-form-dialog").waitFor(); assert.equal(await player.evaluate(() => document.fullscreenElement.classList.contains("room-app-shell")), true);
  await player.locator(".issue-form-dialog").getByRole("button", { name: "Contexte et captures", exact: true }).click(); await player.locator(".issue-form-dialog").getByRole("button", { name: "Page actuelle", exact: true }).click();
  assert.equal(await player.locator(".issue-form-dialog").getByLabel("Jeu", { exact: true }).inputValue(), "421"); assert.equal(await player.locator(".issue-form-dialog").getByLabel("Salon", { exact: true }).inputValue(), room.code);
  await player.screenshot({ path: path.join(previews, "bugs-report-table-fullscreen.png") });
  await player.locator(".issue-form-dialog").getByRole("button", { name: "Fermer", exact: true }).click(); await player.evaluate(() => document.exitFullscreen());
  const visitor = await pageFor(); await visitor.goto(`${origin}${base}/bugs`); await visitor.getByText("Un bouton de lancer reste désactivé", { exact: true }).click(); await visitor.getByRole("heading", { name: "Un bouton de lancer reste désactivé", exact: true }).waitFor();
  assert.equal(await visitor.getByRole("button", { name: "Informations privées", exact: true }).count(), 0);
  await visitor.screenshot({ path: path.join(previews, "bugs-public-desktop.png"), fullPage: true });
  await visitor.setViewportSize({ width: 390, height: 844 }); await visitor.getByRole("button", { name: "Signaler un bug", exact: true }).click(); await visitor.screenshot({ path: path.join(previews, "bugs-report-mobile.png"), fullPage: true });
  assert.ok(await visitor.locator(".issue-form-dialog").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)); await visitor.getByRole("button", { name: "Fermer", exact: true }).click();
  for (const route of ["faq", "conditions", "status", ""]) { await visitor.goto(`${origin}${base}/${route}`); await visitor.getByRole("button", { name: "Signaler un bug", exact: true }).waitFor(); assert.equal(await visitor.locator(".issue-launcher").isVisible(), true); }
  await visitor.locator(".issue-launcher").evaluate((button) => { button.addEventListener("click", () => document.documentElement.requestFullscreen(), { once: true }); });
  await visitor.getByRole("button", { name: "Signaler un bug", exact: true }).click(); await waitFor(() => visitor.evaluate(() => Boolean(document.fullscreenElement)), "fullscreen");
  assert.equal(await visitor.locator(".issue-form-dialog").isVisible(), true); assert.equal(await visitor.locator(".issue-launcher").isVisible(), true); await visitor.evaluate(() => document.exitFullscreen());
  const anonymous = await pageFor();
  await anonymous.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "ktga-issue-receipts") throw new DOMException("Storage blocked", "SecurityError");
      return setItem.call(this, key, value);
    };
  });
  await anonymous.goto(`${origin}${base}/bugs`);
  await anonymous.getByRole("button", { name: "Signaler un bug", exact: true }).click();
  const anonymousForm = anonymous.locator(".issue-form-dialog");
  await anonymousForm.getByLabel("Titre", { exact: true }).fill("Un email reçu ne fonctionne pas");
  await anonymousForm.getByLabel("Description", { exact: true }).fill("Le lien de mon email ne permet pas de valider mon compte.");
  await anonymousForm.getByRole("button", { name: "Envoyer le signalement", exact: true }).click();
  await anonymousForm.getByRole("link", { name: "Consulter le suivi", exact: true }).click();
  await anonymous.getByRole("heading", { name: "Un email reçu ne fonctionne pas", exact: true }).waitFor();
  assert.match(await anonymous.locator(".issue-page-panel").innerText(), /Le lien de mon email/);
  assert.equal(await anonymous.locator(".issue-form-dialog").count(), 0);
  assert.deepEqual(errors, []); console.log("Passed bug reports: consent, images, modal gestures, staff privacy, publication, batch, relations, mobile/fullscreen and Ghostery.");
} catch (error) {
  console.error(output.slice(-3500)); for (const context of browser?.contexts() ?? []) for (const page of context.pages()) console.error(page.url(), (await page.locator("body").innerText().catch(() => "")).slice(-6000)); throw error;
} finally {
  await browser?.close(); for (const child of processes) child.kill(); await Promise.all(processes.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((resolve) => child.once("exit", resolve))));
  if (process.env.KEEP_SMOKE_TMP) console.log(temporary);
  else { assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith("ktga-bugs-browser-")); rmSync(temporary, { recursive: true, force: true }); }
}
