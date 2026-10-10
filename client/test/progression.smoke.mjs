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
import { DEFAULT_GAME_TITLES } from "../../server/src/services/game-titles.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "ktga-progression-browser-"));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
async function port() { const server = createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); const value = server.address().port; await new Promise((resolve) => server.close(resolve)); return value; }
const apiOrigin = `http://127.0.0.1:${await port()}`, origin = `http://127.0.0.1:${await port()}`, base = "/ktga";
const secret = randomBytes(32).toString("hex"), token = (id) => jwt.sign({ id, guest: false, sessionVersion: 0 }, secret, { expiresIn: "1h" });
const database = new DatabaseSync(path.join(temporary, "main.sqlite"));
database.exec("CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER NOT NULL DEFAULT 0)");
for (const id of ["alice", "bob", "editor", "admin"]) {
  const user = { id, pseudo: id, email: `${id}@example.com`, emailVerifiedAt: new Date().toISOString(), guest: false, active: true, admin: id === "admin", editor: id === "editor", createdAt: "2020-01-01T00:00:00Z", tokens: 100000, profile: { displayName: id, birthDate: "2000-01-01", favoriteGames: id === "alice" ? ["yahtzee", "bataille"] : [] }, friends: [], friendRequests: { incoming: [], outgoing: [] } };
  database.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), user.pseudo, user.email);
}
database.close();
const processes = []; let output = "", browser;
function start(args, cwd, env) { const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; }); processes.push(child); }
async function waitFor(check, label) { const end = Date.now() + 30000; while (Date.now() < end) { try { if (await check()) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`Timeout ${label}\n${output.slice(-3000)}`); }
async function request(user, endpoint, method = "GET", body, status = 200) {
  const response = await fetch(`${apiOrigin}${base}${endpoint}`, { method, headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.equal(response.status, status, `${endpoint}: ${JSON.stringify(data)}`); return data;
}
const previews = process.env.PREVIEW_DIRECTORY || path.join(root, "docs", "previews"); mkdirSync(previews, { recursive: true });
try {
  start(["src/index.js"], path.join(root, "server"), { NODE_ENV: "test", PORT: new URL(apiOrigin).port, HOST: "127.0.0.1", JWT_SECRET: secret, CLIENT_ORIGIN: origin, CLIENT_DIST: "", APP_BASE_PATH: base, HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", SQLITE_PATH: path.join(temporary, "main.sqlite"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "PATCHNOTES_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH"].map((key) => [key, path.join(temporary, `${key}.sqlite`)])), BUG_REPORT_UPLOAD_DIR: path.join(temporary, "bug-images"), PATCHNOTES_UPLOAD_DIR: path.join(temporary, "note-images") });
  start(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", new URL(origin).port, "--strictPort"], path.join(root, "client"), { VITE_API_URL: `${apiOrigin}${base}`, VITE_SOCKET_URL: apiOrigin, VITE_SOCKET_PATH: `${base}/socket.io`, VITE_BASE_PATH: `${base}/` });
  await waitFor(async () => (await fetch(`${apiOrigin}${base}/api/health`)).ok && (await fetch(`${origin}${base}/`)).ok, "servers");
  const config = { formula: "50*N", maxLevel: 20, completionXp: 50, victoryXp: 25, titles: [{ level: 1, label: "Apprenti" }, { level: 3, label: "Lanceur" }], games: {} };
  await request("admin", "/api/admin/settings", "PATCH", { gameProgression: config, roundResultsSeconds: 0, turnEndDelaySeconds: 1, botThinkingSeconds: 0 });
  await request("alice", "/api/admin/progression/preview", "POST", config, 403);
  await request("admin", "/api/admin/settings", "PATCH", { gameProgression: { ...config, formula: "process.exit()" } }, 400);
  const reward = await request("admin", "/api/admin/achievements", "POST", { id: "test-victory", title: "Premiere victoire", description: "Gagner une partie de Yahtzee", group: "Yahtzee", type: "games", gameId: "yahtzee", target: 1, rule: { source: "event", event: "game.finished", scope: "career", aggregate: "count", condition: { all: [{ field: "won", operator: "eq", value: true }, { field: "gameId", operator: "eq", value: "yahtzee" }] } }, rewards: { itemIds: ["dice-classic-ivory"], xp: [{ gameId: "yahtzee", amount: 150 }] } }, 201);
  await request("admin", "/api/admin/achievements", "POST", { id: "test-level", title: "Niveau trois", description: "Atteindre le niveau trois au Yahtzee", group: "Yahtzee", type: "games", gameId: "yahtzee", target: 3, rule: { source: "metric", metric: "gameLevel.yahtzee" }, rewards: { itemIds: ["card-classic-red"], xp: [{ gameId: "blackjack", amount: 20 }] } }, 201);
  await request("admin", "/api/admin/achievements", "POST", { ...reward, id: "invalid-item", rewards: { itemIds: ["missing"] } }, 400);
  const room = await request("alice", "/api/rooms", "POST", { gameId: "yahtzee", name: "Test progression", stake: 10, isPublic: true });
  await request("alice", `/api/rooms/${room.code}/start`, "POST", {});
  for (const category of ["upper-1", "upper-2", "upper-3", "upper-4", "upper-5", "upper-6", "three-kind", "four-kind", "full-house", "small-straight", "large-straight", "yahtzee", "chance"]) {
    let current = await request("alice", `/api/rooms/${room.code}`);
    if (current.pacing) await request("alice", `/api/rooms/${room.code}/pacing/skip`, "POST", {});
    const rollWait = (current.state?.rollAvailableAt?.alice ?? 0) - Date.now();
    if (rollWait > 0) await new Promise((resolve) => setTimeout(resolve, rollWait + 20));
    await request("alice", `/api/rooms/${room.code}/action`, "POST", { type: "roll" });
    current = await request("alice", `/api/rooms/${room.code}/action`, "POST", { type: "score", category });
    if (current.pacing && !current.finished) await request("alice", `/api/rooms/${room.code}/pacing/skip`, "POST", {});
  }
  const finished = await request("alice", `/api/rooms/${room.code}`); assert.equal(finished.finished, true);
  let player = await request("alice", "/api/me");
  const progress = (id) => player.gameProgression.find((row) => row.gameId === id);
  assert.equal(progress("yahtzee").xp, 225); assert.equal(progress("yahtzee").level, 3); assert.equal(progress("blackjack").xp, 20);
  assert.ok(player.cosmetics.diceSkins.includes("classic-ivory")); assert.ok(player.cosmetics.cardSkins.includes("classic-red")); assert.equal(player.gameTitle.title, "Lanceur");
  await request("admin", "/api/admin/users/alice/achievements", "PATCH", { states: { "test-victory": false } });
  await request("alice", "/api/me");
  await request("admin", "/api/admin/users/alice/achievements", "PATCH", { states: { "test-victory": true } });
  player = await request("alice", "/api/me"); assert.equal(progress("yahtzee").xp, 225);
  const levelRoom = await request("alice", "/api/rooms", "POST", { gameId: "yahtzee", name: "Niveaux trois", stake: 10, isPublic: true, minLevel: 3, maxLevel: 4 });
  await request("bob", `/api/rooms/${levelRoom.code}/join`, "POST", {}, 403);
  await request("alice", "/api/rooms", "POST", { gameId: "yahtzee", stake: 10, maxLevel: 2 }, 400);
  await request("alice", `/api/rooms/${levelRoom.code}/start`, "POST", {});
  const spectating = await request("bob", `/api/rooms/${levelRoom.code}/join`, "POST", {}); assert.equal(spectating.spectator, true);
  await request("bob", `/api/rooms/${levelRoom.code}/action`, "POST", { type: "roll" }, 403);
  const publicProfile = await request("bob", "/api/users/alice/public"); assert.equal(publicProfile.gameTitle.title, "Lanceur");
  assert.deepEqual(player.gameProgression.find((row) => row.gameId === "yahtzee").unlockedTitles.map((row) => row.level), [1, 3]);
  await request("alice", "/api/me", "PATCH", { titleGameId: "blackjack", titleLevel: 3 }, 403);
  await request("alice", "/api/me", "PATCH", { titleGameId: "missing", titleLevel: 1 }, 400);
  await request("alice", "/api/me", "PATCH", { titleGameId: "yahtzee", titleLevel: "1" }, 400);
  await request("alice", "/api/me", "PATCH", { titleHidden: "true" }, 400);
  for (let i = 1; i <= 5; i++) await request("admin", "/api/admin/achievements", "POST", { id: `test-chain-${i}`, title: `Chaine ${i}`, description: "Progression en cascade", group: "Blackjack", type: "games", gameId: "blackjack", target: 1, rule: { source: "event", event: "game.xp", scope: "event", aggregate: "match", condition: { all: [{ field: "gameId", operator: "eq", value: "blackjack" }, { field: "xp", operator: "gte", value: i * 50 }] } }, rewards: { xp: [{ gameId: "blackjack", amount: 50 }] } }, 201);
  await request("admin", "/api/admin/achievements", "POST", { id: "test-chain-start", title: "Depart", description: "Declencher une chaine", group: "Blackjack", type: "games", target: 1, rule: { source: "metric", metric: "gamesPlayed" }, rewards: { xp: [{ gameId: "blackjack", amount: 50 }] } }, 201);
  await request("admin", "/api/admin/users/bob/achievements", "PATCH", { states: { "test-chain-start": true } });
  assert.equal((await request("bob", "/api/me")).gameProgression.find((row) => row.gameId === "blackjack").xp, 300);
  console.log("Passed real game completion, victory XP, chained achievement rewards, reward idempotency, level restrictions and spectator access.");

  browser = await chromium.launch({ channel: "msedge", headless: true });
  let blocker;
  if (process.env.BLOCKER_MODULE) { const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href); blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch); }
  const errors = [];
  async function pageFor(id) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Europe/Brussels" }); context.setDefaultNavigationTimeout(60000); context.setDefaultTimeout(45000);
    await context.addCookies([{ name: "ktga_session", value: token(id), url: apiOrigin, httpOnly: true, sameSite: "Lax" }]);
    await context.addInitScript(() => localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version: "2026-09-27", chosenAt: Date.now(), enabled: false })));
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message)); if (blocker) await blocker.enableBlockingInPage(page); return page;
  }
  async function noOverflow(page, selector) {
    const result = await page.locator(selector).evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth, display: getComputedStyle(element).display }));
    assert.notEqual(result.display, "none"); assert.ok(result.content <= result.width + 1, `${selector} overflow: ${JSON.stringify(result)}`);
  }
  const page = await pageFor("alice"); await page.goto(`${origin}${base}/profil`);
  await page.locator(".xp-workspace").waitFor(); await page.locator(".xp-game-list").getByText("Niveau 3", { exact: true }).waitFor();
  assert.deepEqual(await page.locator(".xp-game-list article header strong").allTextContents(), ["Yahtzee", "Bataille"]);
  await page.getByRole("button", { name: "Bataille", exact: true }).click();
  assert.deepEqual(await page.locator(".xp-game-list article header strong").allTextContents(), ["Yahtzee"]);
  await page.getByRole("button", { name: "Bataille", exact: true }).click();
  assert.equal(await page.getByLabel("Afficher la progression", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Titre affiché", { exact: true }).locator('option[value="yahtzee:1"]').count(), 1);
  assert.equal(await page.getByLabel("Titre affiché", { exact: true }).locator('option[value="yahtzee:5"]').count(), 0);
  await noOverflow(page, ".xp-workspace"); await page.screenshot({ path: path.join(previews, "game-progression-profile-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Profil public", exact: true }).click(); await page.locator(".public-profile-modal .xp-workspace").waitFor();
  assert.equal(await page.locator(".public-profile-modal .player-game-title").innerText(), "Lanceur");
  assert.deepEqual(await page.locator(".public-profile-modal .xp-game-list article header strong").allTextContents(), ["Yahtzee", "Bataille"]);
  assert.equal(await page.locator(".public-profile-modal h2").count(), 0);
  assert.equal(await page.locator(".public-profile-modal .xp-workspace select").count(), 0);
  assert.equal(await page.locator(".public-profile-modal .xp-game-list progress").count(), 0);
  assert.equal(await page.locator(".public-profile-modal .xp-game-list small").count(), 0);
  assert.equal(await page.locator(".public-profile-modal .xp-game-list").getByText(/Niveau|Maîtrise| XP/).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page, ".public-profile-modal .xp-workspace"); await noOverflow(page, ".public-profile-layout"); await noOverflow(page, ".public-profile-scroll"); await page.screenshot({ path: path.join(previews, "game-progression-public-mobile.png") });
  await page.locator(".public-profile-modal").getByRole("button", { name: "Fermer le profil", exact: true }).click();
  await page.getByLabel("Titre affiché", { exact: true }).selectOption("yahtzee:1"); await page.getByRole("button", { name: "Enregistrer le profil", exact: true }).click();
  await waitFor(async () => (await request("alice", "/api/me")).gameTitle.titleLevel === 1, "lower-tier title selection saved");
  assert.equal((await request("bob", "/api/users/alice/public")).gameTitle.title, "Apprenti");
  await page.getByLabel("Titre affiché", { exact: true }).selectOption("hidden"); await page.getByRole("button", { name: "Enregistrer le profil", exact: true }).click();
  await waitFor(async () => (await request("alice", "/api/me")).gameTitle === null, "hidden title selection saved");
  await page.getByLabel("Titre affiché", { exact: true }).selectOption("blackjack:1"); await page.getByRole("button", { name: "Enregistrer le profil", exact: true }).click();
  await waitFor(async () => { const user = await request("alice", "/api/me"); return user.profile.titleGameId === "blackjack" && user.profile.titleLevel === 1 && !user.profile.titleHidden; }, "title selection saved");
  await page.reload(); await page.locator(".xp-workspace").waitFor(); assert.equal(await page.getByLabel("Titre affiché", { exact: true }).inputValue(), "blackjack:1");
  await page.screenshot({ path: path.join(previews, "game-progression-profile-mobile.png"), fullPage: true });
  await page.goto(`${origin}${base}/shop`); await page.getByLabel("Inventaire", { exact: true }).selectOption("all");
  for (const [type, name] of [["diceSkins", "dice"], ["cardSkins", "cards"]]) {
    await page.getByLabel("Type", { exact: true }).selectOption(type); await page.locator(`.catalog-visual-${type}`).first().waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await noOverflow(page, ".catalog-workspace");
      const valid = await page.locator(`.catalog-visual-${type}`).evaluateAll((elements) => elements.every((element) => [...element.querySelectorAll(".pip,.playing-card strong,.playing-card span")].every((piece) => { const box = piece.getBoundingClientRect(), parent = piece.parentElement.getBoundingClientRect(); return box.left >= parent.left && box.right <= parent.right + 1 && box.top >= parent.top && box.bottom <= parent.bottom + 1; })));
      assert.ok(valid, `${type}: contained symbols at ${width}px`);
      await page.screenshot({ path: path.join(previews, `shop-${name}-fixed-${width}.png`), fullPage: true });
    }
  }
  const admin = await pageFor("admin"); await admin.goto(`${origin}${base}/admin`); await admin.getByRole("button", { name: "Paramètres", exact: true }).click(); await admin.getByRole("button", { name: "XP et titres", exact: true }).click();
  await admin.getByRole("img", { name: "Courbe des niveaux XP", exact: true }).waitFor(); await noOverflow(admin, ".xp-settings");
  await admin.getByLabel("Jeu de progression", { exact: true }).selectOption("yahtzee"); await admin.getByLabel("XP par partie terminée", { exact: true }).fill("80"); await admin.getByText("Titres propres à ce jeu", { exact: true }).click();
  await admin.getByLabel("Nom du titre 2", { exact: true }).fill("Champion"); await admin.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await waitFor(async () => (await request("alice", "/api/me")).gameProgression.find((row) => row.gameId === "yahtzee").title === "Champion", "per-game titles saved");
  const waiting = await request("alice", "/api/rooms", "POST", { gameId: "yahtzee", name: "Carriere Yahtzee", stake: 10, minLevel: 3, maxLevel: 4 });
  assert.equal(waiting.players.find((row) => row.id === "alice").gameTitle.title, "Apprenti");
  const message = await request("alice", "/api/chat/messages", "POST", { channelType: "room", roomCode: waiting.code, content: "Bienvenue a la table" }, 201);
  assert.equal(message.sender.gameTitle.title, "Apprenti");
  await request("alice", `/api/rooms/${waiting.code}/level-settings`, "POST", { minLevel: 4, maxLevel: 5 }, 400);
  await request("bob", `/api/rooms/${waiting.code}/level-settings`, "POST", { minLevel: 1 }, 404);
  await admin.screenshot({ path: path.join(previews, "game-progression-admin-desktop.png"), fullPage: true });
  await admin.setViewportSize({ width: 390, height: 844 }); await noOverflow(admin, ".xp-settings"); await admin.screenshot({ path: path.join(previews, "game-progression-admin-mobile.png"), fullPage: true });
  await admin.setViewportSize({ width: 1440, height: 1000 }); await admin.getByRole("button", { name: /^Succès/ }).click(); await admin.getByPlaceholder("Nom, identifiant, jeu ou groupe").fill("Premiere victoire");
  await admin.locator(".achievement-admin-grid article").filter({ hasText: "Premiere victoire" }).getByRole("button", { name: "Modifier", exact: true }).click();
  const achievement = admin.locator(".achievement-rule-editor"); await achievement.getByRole("button", { name: "Choisir les objets offerts", exact: true }).click();
  const picker = admin.getByRole("dialog", { name: "Choisir les objets offerts", exact: true }); await picker.getByRole("searchbox").fill("Dés ivoire"); await picker.getByRole("button", { name: /^Dés ivoire/ }).waitFor(); await picker.getByRole("button", { name: "Appliquer la selection", exact: true }).click();
  await achievement.getByLabel("XP récompense 1", { exact: true }).fill("175"); await admin.screenshot({ path: path.join(previews, "achievement-rewards-editor-desktop.png") });
  await achievement.getByRole("button", { name: "Enregistrer", exact: true }).click(); await achievement.waitFor({ state: "hidden" });
  assert.equal((await request("alice", "/api/achievements")).find((row) => row.id === "test-victory").rewards.xp[0].amount, 175);
  await request("admin", "/api/admin/settings", "PATCH", { gameProgression: { ...config, games: Object.fromEntries(Object.entries(DEFAULT_GAME_TITLES).map(([id, titles]) => [id, { titles }])) } });
  await request("admin", "/api/admin/achievements", "POST", { id: "test-title-levels", title: "Paliers de titres", description: "Verifier les titres precedents", group: "Yahtzee", type: "games", gameId: "yahtzee", target: 999999, rule: { source: "metric", metric: "gamesPlayed" }, rewards: { xp: [{ gameId: "yahtzee", amount: 3500 }] } }, 201);
  await request("admin", "/api/admin/users/alice/achievements", "PATCH", { states: { "test-title-levels": true } });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`${origin}${base}/profil`); await page.locator(".xp-workspace").waitFor();
  const choices = page.getByLabel("Titre affiché", { exact: true });
  assert.equal(await choices.locator('option[value="yahtzee:10"]').innerText(), "Brelan · niveau 10");
  assert.equal(await choices.locator('option[value="yahtzee:20"]').count(), 0);
  await choices.selectOption("yahtzee:5"); await page.getByRole("button", { name: "Enregistrer le profil", exact: true }).click();
  await waitFor(async () => (await request("alice", "/api/me")).gameTitle.title === "Paire", "preset lower-tier title saved");
  await page.locator(".xp-workspace").screenshot({ path: path.join(previews, "favorite-title-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page, ".xp-workspace"); await page.locator(".xp-workspace").screenshot({ path: path.join(previews, "favorite-title-mobile.png") });
  await page.getByRole("button", { name: "Profil public", exact: true }).click();
  await page.locator(".public-profile-modal .xp-workspace").scrollIntoViewIfNeeded(); await noOverflow(page, ".public-profile-scroll");
  assert.equal(await page.locator(".public-profile-modal .player-game-title").innerText(), "Paire");
  await page.screenshot({ path: path.join(previews, "favorite-title-public-mobile.png") });
  const crossGame = await request("alice", "/api/rooms", "POST", { gameId: "blackjack", name: "Titre choisi", stake: 10 });
  assert.equal(crossGame.players.find((row) => row.id === "alice").gameTitle.title, "Paire");
  assert.equal((await request("alice", "/api/chat/messages", "POST", { channelType: "room", roomCode: crossGame.code, content: "Titre conserve" }, 201)).sender.gameTitle.title, "Paire");
  assert.deepEqual(errors, []); console.log("Passed progression profiles, per-game titles/settings persistence, reward picker, shop symbols, mobile layouts and Ghostery.");
} catch (error) {
  console.error(output.slice(-3500)); for (const context of browser?.contexts() ?? []) for (const page of context.pages()) console.error(page.url(), (await page.locator("body").innerText().catch(() => "")).slice(-4000)); throw error;
} finally {
  await browser?.close(); for (const child of processes) child.kill(); await Promise.all(processes.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((resolve) => child.once("exit", resolve))));
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith("ktga-progression-browser-")); rmSync(temporary, { recursive: true, force: true });
}
