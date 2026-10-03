import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";
import bcrypt from "../../server/node_modules/bcryptjs/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "ktga-account-shop-help-"));
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
  const guides = path.join(root, "client", "public", "guides");
  mkdirSync(previews, { recursive: true });
  mkdirSync(guides, { recursive: true });
  const page = await pageFor("alpha");
  console.log("Account layout and separated saves...");
  await page.goto(`${origin}/profil`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Mon compte", exact: true }).waitFor();
  assert.equal(await page.getByLabel(/^Date de naissance/).isDisabled(), true);
  assert.equal(await page.locator(".account-stat-summary").getAttribute("open"), null);
  for (const game of await page.locator(".favorite-game").all()) {
    if (await game.isEnabled() && await game.getAttribute("aria-pressed") !== "true") await game.click();
    if (await page.locator('.favorite-game[aria-pressed="true"]').count() === 5) break;
  }
  assert.equal(await page.locator('.favorite-game[aria-pressed="true"]').count(), 5);
  assert.equal(await page.locator(".favorite-game:disabled").count() > 0, true);
  await page.getByLabel("Bio", { exact: true }).fill("Des jeux et de la bonne humeur.");
  const saving = page.waitForRequest((req) => req.url().endsWith("/api/me") && req.method() === "PATCH");
  await page.getByRole("button", { name: "Enregistrer le profil", exact: true }).click();
  const payload = (await saving).postDataJSON();
  assert.equal(Object.hasOwn(payload, "login"), false);
  assert.equal(Object.hasOwn(payload, "password"), false);
  await page.getByText("Paramètres mis à jour.", { exact: true }).waitFor();
  await waitFor(async () => await page.locator(".action-feedback-pending").count() === 0, "profile saved feedback");
  await page.locator(".profile-shell").screenshot({ path: path.join(guides, "account.png") });
  copyFileSync(path.join(guides, "account.png"), path.join(previews, "account-workspace-desktop.png"));
  await page.getByRole("button", { name: "Carte et confidentialité", exact: true }).click();
  await page.getByLabel("Emplacement 1").selectOption("customAchievement");
  await page.getByLabel("Emplacement 2").selectOption("customAchievement");
  assert.equal(await page.getByLabel("Succès personnalisé", { exact: true }).count(), 2);
  await page.getByRole("button", { name: "Connexion et sécurité", exact: true }).click();
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(accountPassword);
  await page.getByLabel("Confirmer le nouveau mot de passe", { exact: true }).fill("Different123!");
  assert.equal(await page.getByRole("button", { name: "Modifier le mot de passe", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Afficher : Nouveau mot de passe", exact: true }).click();
  assert.equal(await page.getByLabel("Nouveau mot de passe", { exact: true }).getAttribute("type"), "text");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "account has no horizontal overflow");
  }
  await page.getByRole("button", { name: "Mon profil", exact: true }).click();
  await page.screenshot({ path: path.join(previews, "account-workspace-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("Shop filters, packs and confirmation...");
  const shop = await request("alpha", "/api/shop", undefined, 200, "GET");
  const bought = shop.find((item) => !item.rewardOnly && item.price > 0 && item.price < 10000);
  await request("alpha", "/api/shop/purchase", { itemId: bought.id });
  await page.goto(`${origin}/shop`, { waitUntil: "domcontentloaded" });
  await page.locator(".catalog-items").waitFor();
  const search = page.getByLabel("Recherche", { exact: true });
  await search.fill(bought.name);
  assert.equal(await page.locator(".catalog-item").filter({ has: page.getByRole("heading", { name: bought.name, exact: true }) }).count(), 0);
  await page.getByLabel("Inventaire", { exact: true }).selectOption("owned");
  await page.locator(".catalog-item").getByRole("heading", { name: bought.name, exact: true }).waitFor();
  assert.equal(await page.locator(".catalog-item").filter({ has: page.getByRole("heading", { name: bought.name, exact: true }) }).getByRole("button", { name: "Acquis", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Réinitialiser les filtres", exact: true }).click();
  await page.getByLabel("Type", { exact: true }).selectOption("icons");
  await page.getByLabel("Gamme", { exact: true }).selectOption("classic");
  await page.locator(".catalog-item").first().waitFor();
  await page.locator(".shop-shell").screenshot({ path: path.join(guides, "shop.png") });
  copyFileSync(path.join(guides, "shop.png"), path.join(previews, "shop-catalog-desktop.png"));
  await page.getByRole("button", { name: "Réinitialiser les filtres", exact: true }).click();
  await page.getByRole("button", { name: "Packs", exact: true }).click();
  await page.getByLabel("Collection", { exact: true }).waitFor();
  assert.equal(await page.locator('.catalog-item-check input:checked').count(), 0, "packs have no automatic purchase selection");
  const check = page.locator('.catalog-item-check input:not(:disabled)').first();
  await check.check();
  await page.locator(".catalog-checkout").getByText("1 objet sélectionné", { exact: true }).waitFor();
  await search.fill("THIS_DOES_NOT_MATCH");
  assert.equal(await page.locator(".catalog-item").count(), 0);
  await search.fill("");
  await page.locator(".catalog-checkout").getByText("1 objet sélectionné", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Acheter la sélection", exact: true }).click();
  await page.locator(".shop-confirmation-modal").waitFor();
  await page.locator(".shop-confirmation-modal").getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Acheter la sélection", exact: true }).click();
  const purchaseRequest = page.waitForRequest((req) => req.url().endsWith("/api/shop/purchase-pack") && req.method() === "POST");
  const purchaseResponse = page.waitForResponse((res) => res.url().endsWith("/api/shop/purchase-pack") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Confirmer l’achat", exact: true }).click();
  assert.equal((await purchaseRequest).postDataJSON().itemIds.length, 1, "only the explicitly selected item is purchased");
  assert.equal((await purchaseResponse).status(), 200);
  await page.locator(".shop-confirmation-modal").waitFor({ state: "hidden" });
  await page.locator(".catalog-checkout").getByText("0 objet sélectionné", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "shop has no horizontal overflow");
  await page.screenshot({ path: path.join(previews, "shop-packs-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const game = page.locator(".game-card").filter({ has: page.locator("h3").filter({ hasText: "Yahtzee" }) });
  await game.getByRole("button", { name: "Créer une table", exact: true }).click();
  await page.locator(".game-table-dialog").waitFor();
  await page.screenshot({ path: path.join(guides, "create-table.png") });
  copyFileSync(path.join(guides, "create-table.png"), path.join(previews, "help-create-table.png"));
  await page.keyboard.press("Escape");

  console.log("Public FAQ, tutorials, images and welcome persistence...");
  const publicPage = await pageFor();
  await publicPage.goto(`${origin}/faq`, { waitUntil: "domcontentloaded" });
  await publicPage.getByRole("heading", { name: "Questions fréquentes", exact: true }).waitFor();
  await publicPage.getByPlaceholder("Rechercher une question ou un sujet").fill("packs");
  assert.equal(await publicPage.locator(".player-help-question").count() > 0, true);
  await publicPage.locator(".player-help-question").first().locator("summary").click();
  await publicPage.screenshot({ path: path.join(previews, "faq-desktop.png"), fullPage: true });
  await publicPage.goto(`${origin}/guide`, { waitUntil: "domcontentloaded" });
  await publicPage.locator(".player-help-chapter").first().waitFor();
  assert.equal(await publicPage.locator(".player-help-chapter").count(), 10);
  for (const image of await publicPage.locator(".player-help-figure img").all()) {
    await image.scrollIntoViewIfNeeded();
    await waitFor(() => image.evaluate((element) => element.complete && element.naturalWidth > 0), "tutorial image");
  }
  await publicPage.getByRole("button", { name: "Ouvrir le guide d’accueil", exact: true }).click();
  await publicPage.locator(".player-help-welcome").waitFor();
  await publicPage.screenshot({ path: path.join(previews, "welcome-guide-desktop.png") });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.getByRole("button", { name: "Étape 2 : Créer ou rejoindre une table", exact: true }).click();
  assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "guide modal fits mobile");
  await publicPage.screenshot({ path: path.join(previews, "welcome-guide-mobile.png") });
  await publicPage.keyboard.press("Escape");
  const welcome = await pageFor("newbie");
  await welcome.goto(origin, { waitUntil: "domcontentloaded" });
  await welcome.locator(".player-help-welcome").waitFor();
  await welcome.getByRole("button", { name: "Plus tard", exact: true }).click();
  await waitFor(async () => !(await request("newbie", "/api/me/help", undefined, 200, "GET")).needsWelcome, "persisted guide dismissal");
  await welcome.reload({ waitUntil: "domcontentloaded" });
  await welcome.locator(".game-card").first().waitFor();
  assert.equal(await welcome.locator(".player-help-welcome").count(), 0);

  console.log("Help administration, permissions and safe Markdown...");
  await request("alpha", "/api/admin/help", undefined, 403, "GET");
  const document = await request("editor", "/api/admin/help", undefined, 200, "GET");
  await request("editor", "/api/admin/help", { ...document, entries: [{ ...document.entries[0], image: "https://example.com/pixel.gif" }] }, 400, "PUT");
  const edit = await pageFor("editor");
  await edit.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
  await edit.getByRole("link", { name: "Studio", exact: true }).waitFor();
  const identity = await edit.locator(".identity-pill .display-name").boundingBox();
  const management = await edit.getByRole("link", { name: "Studio", exact: true }).boundingBox();
  assert.ok(management.x >= identity.x + identity.width, "studio icon follows nickname");
  assert.equal(await edit.locator(".casino-navigation").getByText("Studio", { exact: true }).count(), 0);
  await edit.getByRole("button", { name: "FAQ et tutos", exact: true }).click();
  await edit.getByLabel("Question", { exact: true }).waitFor();
  await edit.getByRole("button", { name: "Ajouter une question", exact: true }).click();
  await edit.getByLabel("Question", { exact: true }).fill("Question de démonstration");
  await edit.getByLabel("Réponse", { exact: true }).fill("**Une réponse claire.**\n\n[Lien du guide](/guide)\n\n<script>alert(1)</script>\n\n![pixel](https://example.com/pixel.gif)");
  await edit.getByLabel("Publié", { exact: true }).check();
  await edit.getByRole("button", { name: "Aperçu", exact: true }).click();
  assert.equal(await edit.locator(".player-help-editor-preview strong").filter({ hasText: "Une réponse claire." }).count(), 1);
  assert.equal(await edit.locator(".player-help-editor-preview script, .player-help-editor-preview img").count(), 0, "Markdown cannot execute HTML or load external image pixels");
  const saved = edit.waitForResponse((res) => res.url().endsWith("/api/admin/help") && res.request().method() === "PUT");
  await edit.locator(".player-help-editor-toolbar").getByRole("button", { name: "Enregistrer", exact: true }).click();
  assert.equal((await saved).status(), 200);
  await publicPage.goto(`${origin}/faq`, { waitUntil: "domcontentloaded" });
  await publicPage.getByText("Question de démonstration", { exact: true }).waitFor();
  const result = await request("editor", "/api/admin/help", undefined, 200, "GET");
  const faq = result.entries.filter((entry) => entry.kind === "faq");
  assert.equal(faq[1].title, "Question de démonstration", "new sections insert after selected section");
  const upload = edit.waitForResponse((res) => res.url().endsWith("/api/admin/help/images") && res.request().method() === "POST");
  await edit.locator('.player-help-editor input[type="file"]').setInputFiles(path.join(guides, "account.png"));
  assert.equal((await upload).status(), 201);
  const uploadedImage = edit.locator(".player-help-editor-preview img");
  await uploadedImage.waitFor();
  await waitFor(() => uploadedImage.evaluate((element) => element.complete && element.naturalWidth > 0), "uploaded illustration");
  const imageSource = await uploadedImage.getAttribute("src");
  assert.ok(imageSource.startsWith(apiOrigin + "/api/help/images/"));
  assert.equal((await fetch(imageSource)).headers.get("content-type"), "image/png");
  await edit.getByRole("button", { name: "Retirer l’image", exact: true }).click();
  await edit.getByRole("button", { name: "Texte Markdown", exact: true }).click();
  await edit.getByLabel("Réponse", { exact: true }).fill("**Les packs sont personnalisables.**\n\nChoisis les objets qui te plaisent, vérifie le total et confirme ton achat. Les jetons sont exclusivement virtuels.");
  await edit.getByRole("button", { name: "Aperçu", exact: true }).click();
  await edit.getByRole("button", { name: "Supprimer", exact: true }).click();
  await edit.getByRole("dialog", { name: "Supprimer cette rubrique ?", exact: true }).waitFor();
  await edit.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }).click();
  await edit.screenshot({ path: path.join(previews, "help-admin-desktop.png"), fullPage: true });
  await edit.setViewportSize({ width: 390, height: 844 });
  assert.equal(await edit.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "editor fits mobile");
  const editorIdentity = await edit.locator(".identity-pill .display-name").boundingBox();
  const editorIcon = await edit.getByRole("link", { name: "Studio", exact: true }).boundingBox();
  assert.ok(editorIcon.x >= editorIdentity.x + editorIdentity.width && Math.abs(editorIcon.y - editorIdentity.y) < 25, "studio icon follows nickname on mobile");
  await edit.screenshot({ path: path.join(previews, "help-admin-mobile.png"), fullPage: true });
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(`Account, catalog, FAQ, onboarding and administration verified${blocker ? " with Ghostery" : ""}.`);
} finally {
  await browser?.close();
  for (const child of processes) if (child.exitCode === null) child.kill();
  await Promise.all(processes.map((child) => child.exitCode !== null ? Promise.resolve() : new Promise((resolve) => child.once("exit", resolve))));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
  rmSync(temporary, { recursive: true, force: true });
}
