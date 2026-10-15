import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "../../server/node_modules/express/index.js";
import { PRIVACY_VERSION } from "../src/privacy/consent.js";
import { defaultPublicSettings } from "../src/config/site.js";
import { catalogs } from "../src/locales/catalog.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory = path.join(root, "docs/previews/locales-20261011", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(directory, { recursive: true });
const app = express();
app.use(express.static(path.join(root, "client/dist"), { index: false }));
app.use((_req, res) => res.sendFile(path.join(root, "client/dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const games = [
  { id: "yahtzee", name: "Yahtzee", type: "dice", minPlayers: 1, maxPlayers: 6, description: "Treize catégories, cinq dés et une dernière chance.", audience: "solo-multi", category: "score", complexity: "easy", coverImage: "/ktga-preview.png", descriptiveImage: "/ktga-preview.png" },
  { id: "421", name: "421", type: "dice", minPlayers: 2, maxPlayers: 6, description: "La meilleure combinaison remporte la manche.", audience: "multi", category: "score", complexity: "easy" },
  { id: "blackjack", name: "Blackjack", type: "cards", minPlayers: 1, maxPlayers: 6, description: "Vise 21 sans le dépasser.", audience: "solo-multi", category: "score", complexity: "easy", coverImage: "/ktga-preview.png", descriptiveImage: "/ktga-preview.png" }
];
let browser; const errors = [], checks = [];
async function setup(viewport, { logged = false, admin = false, editor = false, browserLocale = "fr", accountLocale = "", guests = true, ranked = false, closed = false, coverImage, descriptiveImage } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((version) => {
    localStorage.setItem("ktga-privacy-choice", JSON.stringify({ version, chosenAt: Date.now(), enabled: false }));
    localStorage.setItem("ktga-install-choice", "ignored");
  }, PRIVACY_VERSION);
  await context.addInitScript((language) => { if (!localStorage.getItem("ktga-locale")) localStorage.setItem("ktga-locale", language); }, browserLocale);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  await blocker.enableBlockingInPage(page);
  let user = logged ? { id: "player", pseudo: "Bnmkt", admin, editor, tokens: 1000, profile: { locale: accountLocale, favoriteGames: ["421"] }, cosmetics: { equipped: {} } } : null;
  let settings = { ...defaultPublicSettings, featuredGameId: "yahtzee", guestAccessEnabled: guests };
  const requests = [], uploads = [], settingsUpdates = [], localeUpdates = [];
  const sources = JSON.parse(fs.readFileSync(path.join(root, "client/src/locales/fr.json")));
  const overrides = { fr: {}, en: {} }, revisions = { fr: 0, en: 0 };
  await page.route("**/api/**", (route) => {
    const key = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${key}`);
    const imageHeaders = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
    if (/\/api\/admin\/games\/yahtzee\/images\/(coverImage|descriptiveImage)$/.test(key)) {
      const bytes = route.request().postDataBuffer();
      const field = key.split("/").at(-1);
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      const expected = field === "coverImage" ? [1280, 560] : [960, 720];
      assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], expected);
      uploads.push({ field, bytes });
      fs.writeFileSync(path.join(directory, `crop-${viewport.width}-${field}.png`), bytes);
      return route.fulfill({ contentType: "application/json", headers: imageHeaders, body: JSON.stringify({ image: `/api/game-images/${field}.png`, width: expected[0], height: expected[1] }) });
    }
    if (key.startsWith("/api/game-images/")) return route.fulfill({ contentType: "image/png", headers: imageHeaders, body: uploads.at(-1)?.bytes ?? fs.readFileSync(path.join(root, "client/public/ktga-preview.png")) });
    let status = 200, data = [];
    if (key.startsWith("/api/locales/")) data = { messages: overrides[key.split("/").at(-1)], fallback: overrides.fr };
    else if (key.startsWith("/api/admin/locales/")) {
      const language = key.split("/").at(-1);
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON(); assert.equal(body.revision, String(revisions[language]));
        Object.assign(overrides[language], body.messages); revisions[language]++;
        for (const source of Object.keys(body.messages)) sources[source] ??= source;
      }
      data = { locale: language, revision: String(revisions[language]), messages: { ...(language === "fr" ? sources : catalogs.en), ...overrides[language] }, sources };
    }
    else if (key === "/api/me/locale") {
      const body = route.request().postDataJSON(); localeUpdates.push(body);
      user = { ...user, profile: { ...user.profile, locale: body.locale } }; data = user;
    }
    else if (key === "/api/config") data = settings;
    else if (key === "/api/games") data = games.map((game) => ({ ...game, ...(coverImage === undefined ? {} : { coverImage }), ...(descriptiveImage === undefined ? {} : { descriptiveImage }) }));
    else if (key === "/api/admin") data = { users: [], games, shop: [], achievements: [], pricing: {}, permissions: {}, overview: {}, settings };
    else if (key === "/api/admin/settings" && route.request().method() === "PATCH") {
      const update = route.request().postDataJSON();
      settingsUpdates.push(update);
      settings = { ...settings, ...update };
      data = settings;
    }
    else if (key === "/api/me") { status = user ? 200 : 401; data = user ?? { error: "Anonymous" }; }
    else if (key === "/api/table-entry/ABC123") { status = closed ? 404 : 200; data = closed ? { error: "Cette partie est terminée." } : { code: "ABC123", hostName: "Bnmkt", requiresPassword: true, ranked }; }
    else if (key === "/api/auth/guest") { user = { id: "guest", pseudo: "Testeur", guest: true, tokens: 1000, profile: {}, cosmetics: { equipped: {} } }; data = { token: "fixture-only", user }; }
    else if (key === "/api/rooms/ABC123" || key === "/api/rooms/ABC123/join") { status = 403; data = { error: "Mot de passe de table requis." }; }
    else if (key === "/api/friends") data = { friends: [] };
    else if (key === "/api/community-events/carousel") data = { events: [] };
    else if (key === "/api/tribunal/availability") data = { available: false };
    else if (key === "/api/notifications") data = [];
    else if (key === "/api/ranked") data = { games: [] };
    else if (key === "/api/ranked/history") data = { rows: [] };
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } });
  });
  await page.route(/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com)\//, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  return { page, context, requests, uploads, settingsUpdates, localeUpdates };
}
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const fixture = await setup(viewport); const { page, context } = fixture;
    await page.goto(origin);
    await page.locator(".locale-visitor select").selectOption("en");
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.evaluate(() => localStorage.getItem("ktga-locale")), "en");
    assert.equal(fixture.localeUpdates.length, 0, "Anonymous visitors do not update an account");
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.getByLabel("Confirm password", { exact: true }).waitFor();
    assert.ok(await page.getByText("At least 10 characters", { exact: true }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(directory, `${name}-locale-registration-en.png`), fullPage: true });
    await page.reload();
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).waitFor();
    await page.locator(".locale-visitor select").selectOption("fr");
    await page.getByRole("button", { name: "Se connecter", exact: true }).waitFor();
    await context.close();

    const account = await setup(viewport, { logged: true, admin: true, accountLocale: "en" });
    await account.page.goto(`${origin}/profil`);
    await account.page.getByRole("heading", { name: "My account", exact: true }).waitFor().catch(async (error) => {
      fs.writeFileSync(path.join(directory, "locale-profile-failure.json"), JSON.stringify({ errors, body: await account.page.locator("body").innerText(), requests: account.requests }, null, 2));
      throw error;
    });
    assert.equal(await account.page.locator(".locale-header select").inputValue(), "en", "The account preference wins over the browser default");
    await account.page.locator(".locale-profile select").selectOption("fr");
    await account.page.getByRole("heading", { name: "Mon compte", exact: true }).waitFor();
    await account.page.waitForFunction(() => !document.querySelector(".locale-profile select").disabled);
    assert.equal(account.localeUpdates.at(-1).locale, "fr");
    assert.equal(await account.page.locator("#account-gender option[value=Homme]").innerText(), "Homme");
    await account.page.locator(".locale-header select").selectOption("en");
    await account.page.waitForFunction(() => !document.querySelector(".locale-profile select").disabled);
    assert.equal(await account.page.locator("#account-gender option[value=Homme]").innerText(), "Male", "Only the label changes, not the stored value");
    await account.page.reload();
    await account.page.getByRole("heading", { name: "My account", exact: true }).waitFor();
    assert.equal(await account.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.ok(await account.page.locator(".locale-header .locale-picker img").isVisible(), "The language picker survives a mainstream blocker");
    const flag = await account.page.locator(".locale-header").boundingBox();
    const headerBox = await account.page.locator(".casino-header").boundingBox();
    assert.ok(headerBox.x + headerBox.width - flag.x - flag.width <= 20, "The flag stays at the far right of the header");
    const nameBox = await account.page.locator(".casino-accountbar .display-name-text").first().boundingBox();
    assert.ok(nameBox.height < 35, "The language control must not compress the nickname into a vertical column");
    await account.page.screenshot({ path: path.join(directory, `${name}-locale-profile-en.png`), fullPage: true });
    await account.context.close();
    checks.push(`${name}: FR/EN registration, account/profile persistence, unchanged form values and content blocker`);
  }
  {
    const { page, context } = await setup({ width: 1440, height: 1000 }, { logged: true, editor: true });
    await page.goto(`${origin}/admin`);
    await page.locator(".admin-sidebar").getByRole("button", { name: /^Langues et traductions/ }).click();
    await page.locator(".admin-content .locale-admin").waitFor();
    const search = page.getByRole("searchbox", { name: "Rechercher un texte" });
    await search.fill("Créer une table");
    const entry = page.locator(".locale-admin-entry").filter({ has: page.locator("p", { hasText: /^Créer une table$/ }) });
    await entry.getByRole("textbox").fill("Open a game table");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Traductions enregistrées." }).waitFor();
    await page.locator(".locale-header select").selectOption("en");
    await page.getByRole("heading", { name: "Languages and translations", exact: true }).waitFor();
    assert.equal(await entry.getByRole("textbox").inputValue(), "Open a game table");
    await page.getByLabel("Add a French source text", { exact: true }).fill("Bienvenue dans le guide personnalisé");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.locator(".locale-admin-entry textarea").fill("Welcome to the custom guide");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Translations saved." }).waitFor();
    await page.locator('.locale-admin input[type=file]').setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ locale: "en", messages: { "{value0} joueurs": "Players without the variable" } })) });
    await page.getByRole("alert").filter({ hasText: /variables/ }).waitFor();
    await page.locator('.locale-admin input[type=file]').setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ locale: "en", messages: { "Créer une table": "<img src=x onerror=alert(1)>" } })) });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Translations saved." }).waitFor();
    assert.equal(await page.locator(".locale-admin img").count(), 0, "Translations remain plain text in the editor");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON", exact: true }).click();
    assert.equal((await downloadPromise).suggestedFilename(), "ktga-en.json");
    await page.screenshot({ path: path.join(directory, "locale-editor-en.png"), fullPage: true });
    await context.close();
    checks.push("Editor: locale administration, revisioned save, custom sources, import validation and JSON export");
  }
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    let { page, context } = await setup(viewport);
    await page.goto(origin);
    await page.locator(".public-game-spotlight").waitFor();
    assert.equal(await page.locator(".public-game-entry").count(), 1);
    await page.waitForFunction(() => document.querySelector(".game-artwork-backdrop img")?.naturalWidth > 0);
    const featured = await page.locator(".public-game-featured").boundingBox();
    const grid = await page.locator(".public-games-featured").boundingBox();
    assert.ok(Math.abs(featured.x + featured.width / 2 - grid.x - grid.width / 2) < 2, "Featured game stays centered within the page content");
    if (name === "desktop") assert.ok(featured.width > featured.height * 2, "Featured game uses a horizontal format");
    await page.getByRole("link", { name: "Jouer", exact: true }).waitFor();
    assert.equal(await page.locator(".public-game-featured .public-game-pieces, .public-game-featured .die, .public-game-featured .playing-card").count(), 0);
    const heading = await page.locator(".public-game-featured h3").boundingBox();
    assert.ok(Math.abs(heading.x + heading.width / 2 - featured.x - featured.width / 2) < 2, "Featured title is centered independently of the metadata");
    assert.equal(await page.locator(".public-game-featured h3").evaluate((node) => getComputedStyle(node).color), "rgb(237, 203, 118)");
    if (name === "desktop") {
      const details = await page.locator(".public-game-featured .public-game-type").boundingBox();
      assert.ok(details.x >= heading.x + heading.width, "Game type and players sit to the right of the title");
    }
    await page.screenshot({ path: path.join(directory, `${name}-home.png`), fullPage: true });
    await page.getByRole("link", { name: "Tous les jeux", exact: true }).click();
    await page.getByRole("heading", { name: "Choisir un jeu", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".public-game-entry").length === 3);
    assert.equal(await page.locator(".public-game-entry").count(), 3);
    assert.equal(await page.locator(".public-game-entry .game-artwork-media img").count(), 2);
    assert.equal(await page.locator(".public-game-entry .public-game-pieces").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(directory, `${name}-catalog.png`), fullPage: true });
    await context.close();

    ({ page, context } = await setup(viewport, { logged: true }));
    await page.goto(origin);
    await page.getByRole("heading", { name: "Jeux disponibles", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".game-card").length === 3 && document.querySelector(".game-card h3")?.innerText.includes("421"));
    assert.equal(await page.locator(".game-grid-featured, .public-game-featured").count(), 0, "Featured games are only displayed on the connection page");
    assert.equal(await page.getByRole("button", { name: "À l’affiche", exact: true }).count(), 0);
    assert.match(await page.locator(".game-card").first().innerText(), /421/, "Favorites remain first in the full selection");
    assert.equal(await page.locator(".game-card .game-artwork-backdrop img").count(), 2);
    for (const [type, color] of [["dice", "rgb(137, 147, 153)"], ["cards", "rgb(184, 73, 93)"]]) {
      const card = page.locator(`.game-card.${type}`).filter({ has: page.locator('.game-artwork-media') }).first();
      assert.equal(await card.evaluate((node) => getComputedStyle(node).borderTopColor), color);
      const metadata = await card.locator('.game-entry-meta').boundingBox(), image = await card.locator('.game-artwork-media').boundingBox();
      assert.ok(metadata.y + metadata.height <= image.y, "The type icon and player count must appear above the image");
      assert.equal(await card.locator('.game-entry-kind > svg').count(), 1);
      assert.match(await card.locator('.game-entry-count').innerText(), /joueurs/);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(directory, `${name}-lobby.png`), fullPage: true });
    await page.getByRole('searchbox', { name: 'Rechercher un jeu' }).fill('Blackjack');
    await page.waitForFunction(() => document.querySelectorAll('.game-card').length === 1);
    await page.getByRole('searchbox', { name: 'Rechercher un jeu' }).fill('');
    await page.waitForFunction(() => document.querySelectorAll('.game-card').length === 3);
    assert.equal(await page.locator('.game-grid-featured, .public-game-featured').count(), 0);
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'scroll-test-spacer';
      spacer.style.height = '1500px';
      document.querySelector('.app-shell').append(spacer);
      window.scrollTo(0, 600);
    });
    await page.waitForFunction(() => window.scrollY >= 600);
    const header = page.locator('.casino-header');
    assert.equal(await header.evaluate((node) => getComputedStyle(node).position), 'sticky');
    assert.ok(Math.abs((await header.boundingBox()).y) < 1, 'Header stays at the top when scrolling, including on mobile with the blocker enabled');
    assert.ok(await page.locator('.casino-navigation').isVisible());
    await page.screenshot({ path: path.join(directory, `${name}-sticky-header.png`) });
    await page.evaluate(() => { document.getElementById('scroll-test-spacer').remove(); window.scrollTo(0, 0); });
    await page.getByRole('button', { name: 'Rejoindre avec un code', exact: true }).click();
    await page.getByRole('dialog', { name: 'Rejoindre avec un code', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.elementFromPoint(5, 5)?.closest('.casino-dialog-layer')), 'Modal overlay remains above the sticky header');
    await page.getByRole('dialog', { name: 'Rejoindre avec un code', exact: true }).getByRole('button', { name: 'Fermer', exact: true }).click();
    checks.push(`${name}: sticky header, scroll, navigation and modal stacking with content blocker`);
    await context.close();

    const invitation = await setup(viewport); ({ page, context } = invitation);
    await page.goto(`${origin}/table/ABC123`);
    await page.getByRole("button", { name: /Pas encore de compte/ }).waitFor();
    await page.screenshot({ path: path.join(directory, `${name}-invitation.png`), fullPage: true });
    await page.getByRole("button", { name: /Pas encore de compte/ }).click();
    await page.getByLabel("Pseudo temporaire").fill("Testeur");
    await page.getByRole("button", { name: "Rejoindre la partie", exact: true }).click();
    await page.getByLabel("Code d’accès de la table", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/table/ABC123");
    assert.ok(invitation.requests.includes("POST /api/auth/guest"));
    assert.ok(invitation.requests.includes("GET /api/rooms/ABC123"));
    await context.close();
    checks.push(`${name}: featured, full catalog, favorites, images/fallback, blocker, guest invitation and password step`);
  }
  for (const options of [{ guests: false }, { ranked: true }, { closed: true }]) {
    const { page, context } = await setup({ width: 1280, height: 900 }, options);
    await page.goto(`${origin}/table/ABC123`);
    await page.getByRole("button", { name: "Se connecter", exact: true }).waitFor();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole("button", { name: /Pas encore de compte/ }).count(), 0);
    await context.close();
  }
  for (const coverImage of ["N/A", "/missing-image.webp"]) {
    const { page, context } = await setup({ width: 390, height: 844 }, { coverImage });
    await page.goto(origin);
    await page.locator(".public-game-featured h3").waitFor();
    assert.equal(await page.locator(".public-game-featured .public-game-pieces").count(), 0);
    if (coverImage === "N/A") await page.waitForFunction(() => document.querySelector('.public-game-featured img')?.naturalWidth > 0);
    assert.equal(await page.locator(".public-game-entry").count(), 1);
    await context.close();
  }
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const { page, context, uploads, settingsUpdates } = await setup(viewport, { logged: true, admin: true });
    await page.goto(`${origin}/admin`);
    const section = async (value, title) => {
      if (name === "mobile") await page.locator(".admin-mobile-nav select").selectOption(value);
      else await page.locator(".admin-sidebar").getByRole("button", { name: new RegExp(`^${title}`) }).click();
    };
    await page.locator(".admin-content .admin-dashboard").waitFor();
    await section("settings", "Paramètres");
    const featuredChoice = page.getByRole("combobox", { name: /^Jeux à l’affiche/ });
    for (const choice of ["421", ""]) {
      await featuredChoice.selectOption(choice);
      await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await page.getByText("Paramètres du casino enregistrés.", { exact: true }).waitFor();
      assert.equal(settingsUpdates.at(-1).featuredGameId, choice, 'Saving includes the featured game, including the automatic-selection reset');
      assert.equal(await featuredChoice.inputValue(), choice);
      await page.reload();
      await page.locator(".admin-content .admin-dashboard").waitFor();
      await section("settings", "Paramètres");
      assert.equal(await featuredChoice.inputValue(), choice, 'The featured game selection persists after reloading the administration');
    }
    await featuredChoice.selectOption("421");
    await page.screenshot({ path: path.join(directory, `${name}-settings.png`), fullPage: true });
    await section("games", "Jeux");
    await page.getByRole("row").filter({ hasText: "yahtzee" }).getByRole("button", { name: "Modifier", exact: true }).click();
    await page.getByRole("tab", { name: "Visuels", exact: true }).click();
    for (const label of ["Image descriptive", "Bannière"]) {
      await page.locator(".game-media-field").filter({ has: page.locator("strong", { hasText: label }) }).getByRole("button", { name: "Modifier / recadrer", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${label} · Yahtzee`, exact: true });
      await dialog.getByLabel("Importer une image du jeu").setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
      await dialog.getByRole("alert").waitFor();
      await dialog.getByLabel("Importer une image du jeu").setInputFiles(path.join(root, "client/public/ktga-preview.png"));
      await dialog.getByRole("button", { name: "Appliquer le recadrage" }).waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector('.game-art-actions button:last-child')?.disabled);
      await dialog.getByRole("slider", { name: "Zoom du recadrage" }).fill("2");
      const crop = await dialog.getByRole("group", { name: "Zone de recadrage" }).boundingBox();
      await page.mouse.move(crop.x + crop.width / 2, crop.y + crop.height / 2);
      await page.mouse.down();
      await page.mouse.move(crop.x + crop.width / 2 + 30, crop.y + crop.height / 2 + 20, { steps: 4 });
      await page.mouse.up();
      const before = uploads.length;
      const box = await dialog.boundingBox();
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.down(); await page.mouse.move(2, 2, { steps: 4 }); await page.mouse.up();
      assert.equal(await dialog.count(), 1, "Dragging from the modal onto its overlay must not close it");
      await dialog.getByRole("slider", { name: "Zoom du recadrage" }).fill("0.5");
      assert.match(await dialog.locator("output").innerText(), /0\.50/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: path.join(directory, `${name}-${label === "Bannière" ? "cover" : "description"}-crop.png`) });
      await dialog.getByRole("button", { name: "Appliquer le recadrage" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(uploads.length, before + 1);
      const field = label === "Bannière" ? "coverImage" : "descriptiveImage";
      const pixel = await page.evaluate(async (url) => {
        const image = new Image(); image.crossOrigin = "anonymous"; image.src = url; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
        return [...context.getImageData(0, 0, 1, 1).data];
      }, `${origin}/api/game-images/${field}.png`);
      assert.deepEqual(pixel, [16, 27, 23, 255], "0.5x export fills the outside margins with the preview's opaque background");
    }
    await page.locator(".game-media-fields").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".game-media-fields .game-artwork-media img").count(), 2);
    await page.screenshot({ path: path.join(directory, `${name}-game-editor.png`) });
    await page.locator(".game-media-field").filter({ has: page.locator("strong", { hasText: "Bannière" }) }).getByRole("button", { name: "Modifier / recadrer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Bannière · Yahtzee", exact: true });
    const before = uploads.length;
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(uploads.length, before, "Cancel must not upload or replace the selected image");
    checks.push(`${name}: featured settings save/reset/reload, image modal, import, validation, drag, zoom, PNG output, cancellation and overlay guard`);
    await context.close();
  }
  {
    const { page, context } = await setup({ width: 390, height: 844 }, { coverImage: "N/A", descriptiveImage: "N/A" });
    await page.goto(origin);
    await page.locator(".public-game-featured h3").waitFor();
    assert.equal(await page.locator(".public-game-featured img, .public-game-featured .public-game-pieces").count(), 0);
    await page.getByRole("link", { name: "Jouer", exact: true }).waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
