import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { achievementRuleSchemas, normalizeAchievementDefinition } from "../../server/src/services/achievement-rules.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const output = path.join(tmpdir(), "ktga-achievements-review");
mkdirSync(output, { recursive: true });
const user = { id: "admin", pseudo: "Admin", login: "admin", admin: true, guest: false, tokens: 10000, cosmetics: { equipped: {} }, profile: {}, dailyBonus: {} };
const games = [{ id: "farkle", name: "Farkle", minPlayers: 1, maxPlayers: 6, category: "dice", audience: "multi", complexity: "easy", enabled: true }, { id: "yahtzee", name: "Yahtzee", minPlayers: 1, maxPlayers: 6, type: "dice", enabled: true }];
const schemas = achievementRuleSchemas(games);
let achievements = [{ id: "farkle-roll-3000", title: "Lancer absolu", description: "Marquer 3 000 points.", group: "Farkle", type: "games", gameId: "farkle", target: 1, milestone: true, secret: false, enabled: true, builtIn: true, rule: { source: "event", event: "game.finished", scope: "event", aggregate: "match", condition: { field: "signals", operator: "contains", value: "farkle-roll-3000" } } }];
const writes = [];
let failNextSave = true;
const errors = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname.includes("socket.io")) return route.fulfill({ status: 503, body: "" });
  const start = url.pathname.indexOf("/api/");
  if (start < 0) return route.continue();
  const endpoint = url.pathname.slice(start);
  const send = (json, status = 200) => route.fulfill({ status, json, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE", "access-control-allow-headers": "authorization,content-type" } });
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
  if (endpoint === "/api/me") return send(user);
  if (endpoint === "/api/health") return send({ ok: true });
  if (endpoint === "/api/config") return send({ siteName: "KTGA", siteSubtitle: "Casino", siteIcon: "", guestAccessEnabled: false });
  if (endpoint === "/api/shop") return send([]);
  if (endpoint === "/api/admin" && request.method() === "GET") return send({ users: [], games, shop: [], achievements, achievementRuleSchemas: schemas, permissions: { manageAchievements: true, manageCommunityEvents: false, editBuiltInShopItems: true }, pricing: {}, settings: {}, overview: {} });
  if (endpoint === "/api/admin/achievements" && request.method() === "POST") {
    if (failNextSave) { failNextSave = false; return send({ error: "Erreur temporaire de sauvegarde" }, 500); }
    const body = request.postDataJSON();
    const created = { ...normalizeAchievementDefinition({ ...body, id: body.id || `custom-test-${writes.length}` }), builtIn: false };
    achievements = [...achievements, created];
    writes.push(created);
    return send(created, 201);
  }
  return send([]);
});

async function assertNoOverflow() {
  const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(bounds.width <= bounds.viewport + 1, JSON.stringify(bounds));
}

try {
  const base = process.env.CASINO_TEST_URL ?? "http://127.0.0.1:5173/ktga";
  await page.goto(`${base}/admin`);
  await page.locator(".admin-nav").getByRole("button", { name: /Succès/ }).click();
  await page.getByRole("heading", { name: "Succès", exact: true }).waitFor();
  await assertNoOverflow();
  await page.screenshot({ path: path.join(output, "achievements-list.png"), fullPage: true });
  await page.getByRole("button", { name: "Créer un succès" }).click();
  const editor = page.locator(".achievement-rule-editor");
  await editor.getByLabel("Jeu concerné").selectOption("yahtzee");
  await editor.getByRole("radio", { name: /Atteindre un score/ }).check();
  await page.screenshot({ path: path.join(output, "achievement-wizard-objective.png"), fullPage: false });
  await editor.getByRole("button", { name: "Continuer", exact: true }).click();
  await editor.getByLabel("Score minimum").fill("350");
  await editor.getByLabel("Nombre de parties où réussir ce défi").fill("3");
  assert.match(await editor.getByLabel("Aperçu du succès").innerText(), /350/);
  await editor.getByLabel("Score minimum").fill("");
  assert.equal(await editor.getByRole("button", { name: "Continuer", exact: true }).isDisabled(), true);
  await editor.getByLabel("Score minimum").fill("300");
  await page.screenshot({ path: path.join(output, "achievement-wizard-conditions.png"), fullPage: false });
  await editor.getByRole("button", { name: "Continuer", exact: true }).click();
  await editor.getByLabel("Nom du succès").fill("Club des 300");
  await editor.getByRole("checkbox", { name: /Milestone/ }).check();
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await editor.getByRole("alert").filter({ hasText: "Erreur temporaire" }).waitFor();
  assert.equal(await editor.getByLabel("Nom du succès").inputValue(), "Club des 300");
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].rule.gameId, "yahtzee");
  assert.equal(writes[0].rule.condition.value, 300);
  assert.equal(writes[0].target, 3);
  assert.equal(writes[0].milestone, true);

  await page.getByRole("button", { name: "Créer un succès" }).click();
  await editor.getByLabel("Jeu concerné").selectOption("farkle");
  await editor.getByRole("radio", { name: /Réussir un lancer exceptionnel/ }).check();
  await editor.getByRole("button", { name: "Personnaliser la règle" }).click();
  assert.equal(await editor.getByLabel("Nom", { exact: true }).inputValue(), "Réussir un lancer exceptionnel");
  await editor.getByLabel("Source", { exact: false }).first().selectOption("metric");
  await editor.getByLabel("Source", { exact: false }).first().selectOption("event");
  await editor.getByLabel("Portée").selectOption("career");
  await editor.getByLabel("Agrégat").selectOption("count");
  await editor.getByRole("button", { name: "Groupe" }).click();
  assert.equal(await editor.locator(".achievement-condition-group").count(), 2);
  await page.screenshot({ path: path.join(output, "achievement-editor-complex.png"), fullPage: true });
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  assert.equal(writes.length, 2);
  assert.equal(writes[1].rule.scope, "career");
  assert.ok(writes[1].rule.condition.all.some((entry) => entry.all));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Créer un succès" }).click();
  await assertNoOverflow();
  await page.screenshot({ path: path.join(output, "achievement-editor-mobile.png"), fullPage: false });
  await editor.getByLabel("Jeu concerné").selectOption("farkle");
  await editor.getByRole("radio", { name: /Réaliser un exploit/ }).check();
  await editor.getByRole("button", { name: "Continuer", exact: true }).click();
  await editor.getByLabel("Nombre de parties où réussir ce défi").fill("2");
  await editor.getByRole("button", { name: "Continuer", exact: true }).click();
  await editor.getByLabel("Nom du succès").fill("Double exploit");
  await page.screenshot({ path: path.join(output, "achievement-wizard-mobile-publish.png"), fullPage: false });
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  assert.equal(writes[2].rule.condition.value, "farkle-roll-3000");
  assert.equal(writes[2].target, 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: output, checks: ["guided-score", "live-preview", "validation", "save-error-retry", "advanced-handoff", "nested-and-or", "mobile-feat-publish"] }));
} finally {
  await browser.close();
}
