import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultCommunityEvent } from "../../server/src/services/community-events.js";
import { defaultPublicSettings } from "../src/config/site.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const output = path.join(tmpdir(), "ktga-studio-review");
mkdirSync(output, { recursive: true });
const item = { id: "custom-review", name: "Ivoire test", description: "Objet de test", type: "diceSkins", value: "default", category: "classic", price: 2000, motion: { preset: "float" } };
const event = defaultCommunityEvent();
Object.assign(event, { id: "review-event", status: "draft", internalName: "Soirée test" });
event.objective.milestones = [{ id: "first", label: "Premier palier", percent: 50, effects: [{ id: "effect", type: "tokens", value: 10, label: "Prime" }] }];
const detail = { event, metrics: { progress: 0, participants: 0, actions: 0, pot: 0 }, validation: [], leaderboard: [], recentActions: [] };
let user = { id: "review", pseudo: "Camille", editor: true, guest: false, tokens: 16400000, cosmetics: { equipped: {} }, profile: {}, dailyBonus: { claimedToday: false, nextReward: 1100, nextMultiplier: 1.1, streak: 1 } };
let adminSettings = { ...defaultPublicSettings };
let texasGame = { id: "texas-holdem", name: "Texas Hold’em", description: "Poker communautaire.", category: "cards", audience: "multi", complexity: "advanced", type: "cards", minPlayers: 2, maxPlayers: 8, entryPot: 1000, position: 1, enabled: true, minPokerBuyIn: 1000, pokerDefaultBigBlind: 20, pokerTurnSeconds: 300 };
let failDuplicate = true;
let failBonus = true;
const writes = [];
const errors = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname.includes("socket.io")) return route.fulfill({ status: 503, body: "" });
  const start = url.pathname.indexOf("/api/");
  if (start < 0) return route.continue();
  const endpoint = url.pathname.slice(start);
  const method = request.method();
  const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE", "access-control-allow-headers": "authorization,content-type" };
  const send = (json, status = 200) => route.fulfill({ status, json, headers });
  if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
  if (method !== "GET") writes.push({ endpoint, method });
  if (endpoint === "/api/me") return send(user);
  if (endpoint === "/api/health") return send({ ok: true });
  if (endpoint === "/api/config") return send(adminSettings);
  if (endpoint === "/api/shop") return send([item]);
  if (endpoint === "/api/admin") return send({ users: [], games: user.admin ? [texasGame] : [], shop: [item], settings: adminSettings, permissions: { editBuiltInShopItems: true, manageCommunityEvents: true, operateCommunityEvents: Boolean(user.admin) }, pricing: {}, overview: {} });
  if (endpoint === "/api/admin/settings" && method === "PATCH") { adminSettings = { ...adminSettings, ...request.postDataJSON() }; return send(adminSettings); }
  if (endpoint === "/api/admin/games/texas-holdem" && method === "PATCH") { texasGame = { ...texasGame, ...request.postDataJSON() }; return send({ ok: true }); }
  if (endpoint === "/api/admin/shop" && method === "POST") {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (failDuplicate) { failDuplicate = false; return send({ error: "Copie temporairement indisponible" }, 503); }
    return send(item);
  }
  if (endpoint === "/api/admin/community-events" && method === "GET") return send([detail]);
  if (endpoint === "/api/me/daily-claim") {
    if (failBonus) { failBonus = false; return send({ error: "Bonus temporairement indisponible" }, 503); }
    user = { ...user, tokens: user.tokens + 1100, dailyBonus: { ...user.dailyBonus, claimedToday: true } };
    return send({ user, award: { amount: 1100, multiplier: 1.1, streak: 2 } });
  }
  if (endpoint.startsWith("/api/admin/")) return send({});
  if (endpoint === "/api/community-events/carousel") return send({ events: [] });
  return send([]);
});
const base = process.env.CASINO_TEST_URL ?? "http://127.0.0.1:5173/ktga";
const dialog = () => page.getByRole("dialog");
const count = (endpoint, method = "POST") => writes.filter((row) => row.endpoint === endpoint && row.method === method).length;
const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });
async function fits() {
  const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, overflow: [...document.querySelectorAll("body *")].filter((el) => {
    if (el.getBoundingClientRect().right <= innerWidth + 1 || getComputedStyle(el).visibility === "hidden") return false;
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) if (getComputedStyle(parent).overflowX !== "visible") return false;
    return true;
  }).slice(0, 12).map((el) => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })) }));
  assert.ok(bounds.width <= bounds.viewport, JSON.stringify(bounds));
}
async function cancel() { await dialog().getByRole("button", { name: "Annuler", exact: true }).click(); await dialog().waitFor({ state: "hidden" }); }
try {
  await page.goto(`${base}/admin`);
  await page.getByTitle("Dupliquer en objet personnalisé").waitFor();
  const boxes = await page.locator(".casino-accountbar").evaluate((element) => [".casino-wallet", ".daily-bonus-button", ".identity-pill", ".casino-logout"].map((selector) => { const { x, y } = element.querySelector(selector).getBoundingClientRect(); return { x, y }; }));
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].x > boxes[i - 1].x && Math.abs(boxes[i].y - boxes[i - 1].y) < 18);
  await fits(); await shot("header-desktop");
  const duplicate = page.getByTitle("Dupliquer en objet personnalisé");
  await duplicate.click(); await dialog().waitFor();
  assert.equal(count("/api/admin/shop"), 0);
  await cancel(); assert.equal(count("/api/admin/shop"), 0);
  await duplicate.click();
  await dialog().getByRole("button", { name: "Dupliquer l’objet", exact: true }).click();
  await page.keyboard.press("Escape");
  await dialog().getByRole("alert").waitFor();
  assert.equal(count("/api/admin/shop"), 1);
  await shot("duplicate-error");
  await dialog().getByRole("button", { name: "Dupliquer l’objet", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(count("/api/admin/shop"), 2);
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByRole("button", { name: "Supprimer la configuration", exact: true }).click();
  await cancel();
  assert.equal(count("/api/admin/shop/custom-review", "PATCH"), 0);
  await page.getByRole("button", { name: "Supprimer la configuration", exact: true }).click();
  await dialog().getByRole("button", { name: "Supprimer la configuration", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "Supprimer la configuration", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Supprimer l’élément", exact: true }).click();
  await cancel(); assert.equal(count("/api/admin/shop/custom-review", "DELETE"), 0);
  await page.getByRole("button", { name: "Supprimer l’élément", exact: true }).click();
  await shot("delete-shop");
  await dialog().getByRole("button", { name: "Supprimer l’objet", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(count("/api/admin/shop/custom-review", "DELETE"), 1);

  await page.locator(".admin-nav").getByRole("button", { name: "Événements", exact: true }).click();
  await page.getByTitle("Dupliquer", { exact: true }).click();
  await cancel(); assert.equal(count("/api/admin/community-events/review-event/duplicate"), 0);
  await page.getByTitle("Dupliquer", { exact: true }).click();
  await dialog().getByRole("button", { name: "Dupliquer l’événement", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(count("/api/admin/community-events/review-event/duplicate"), 1);
  await page.getByRole("button", { name: "Configurer", exact: true }).click();
  await page.locator(".event-editor-tabs").getByRole("button", { name: "Objectif", exact: true }).click();
  await page.getByTitle("Supprimer cet effet").click();
  await cancel(); assert.equal(await page.locator(".event-effect-row").count(), 1);
  await page.getByTitle("Supprimer cet effet").click();
  await dialog().getByRole("button", { name: "Supprimer l’effet", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await page.locator(".event-effect-row").count(), 0);
  await page.getByRole("button", { name: "Supprimer ce palier", exact: true }).click();
  await cancel(); assert.equal(await page.locator(".event-config-row").count(), 1);
  await page.getByRole("button", { name: "Supprimer ce palier", exact: true }).click();
  await shot("delete-event-tier");
  await dialog().getByRole("button", { name: "Supprimer", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await page.locator(".event-config-row").count(), 0);
  assert.equal(count("/api/admin/community-events/review-event", "PATCH"), 0);
  await page.locator(".event-editor-footer").getByRole("button", { name: "Fermer", exact: true }).click();

  user = { ...user, admin: true };
  await page.reload();
  await page.locator(".admin-nav").getByRole("button", { name: "Événements", exact: true }).click();
  await page.getByTitle("Supprimer l’événement", { exact: true }).click();
  await cancel(); assert.equal(count("/api/admin/community-events/review-event", "DELETE"), 0);
  await page.getByTitle("Supprimer l’événement", { exact: true }).click();
  await dialog().getByRole("button", { name: "Supprimer l’événement", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(count("/api/admin/community-events/review-event", "DELETE"), 1);

  await page.locator(".admin-nav").getByRole("button", { name: /^Jeux/ }).click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  const gameEditor = page.locator(".admin-editor");
  await gameEditor.getByLabel("Grosse blinde par défaut").fill("40");
  await gameEditor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await gameEditor.waitFor({ state: "hidden" });
  const pokerWrite = writes.findLast((row) => row.endpoint === "/api/admin/games/texas-holdem");
  assert.ok(pokerWrite);
  assert.equal(texasGame.pokerDefaultBigBlind, 40);

  await page.locator(".admin-nav").getByRole("button", { name: "Paramètres", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Texas Hold’em" }).count(), 0);
  await page.getByLabel("Icône du site").fill("crown");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText("Paramètres du casino enregistrés.").waitFor();
  assert.equal(adminSettings.siteIcon, "crown");
  await fits(); await shot("settings-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/shop`);
  await page.locator(".shop-layout").waitFor();
  await fits(); await shot("header-mobile");
  const wallet = await page.locator(".casino-wallet").evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(wallet.scroll <= wallet.client);
  await page.getByTitle("Notifications", { exact: true }).click();
  const inbox = await page.locator(".notification-panel").boundingBox();
  assert.ok(inbox.x >= 0 && inbox.x + inbox.width <= 390, JSON.stringify(inbox));
  await shot("notifications-mobile");
  await page.getByTitle("Notifications", { exact: true }).click();
  await page.locator(".daily-bonus-button").click();
  await page.getByRole("alert").filter({ hasText: "Bonus temporairement indisponible" }).waitFor();
  assert.equal(await page.locator(".daily-bonus-button").count(), 1);
  await page.locator(".daily-bonus-button").click();
  await page.locator(".daily-bonus-button").waitFor({ state: "hidden" });
  assert.match(await page.locator(".casino-wallet .compact-number").getAttribute("data-full-number"), /16\s*401\s*100/);
  assert.equal(count("/api/me/daily-claim"), 2);
  await page.goto(`${base}/admin`);
  await page.locator(".admin-nav").getByRole("button", { name: "Paramètres", exact: true }).click();
  await fits(); await shot("settings-mobile");
  await page.locator(".admin-nav").getByRole("button", { name: /^Boutique/ }).click();
  await page.getByTitle("Dupliquer en objet personnalisé").click();
  await shot("confirm-mobile");
  await fits(); await cancel();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: output, checks: ["header-order", "bonus-success-error", "notification-layout", "studio-duplicate-delete", "event-duplicate-delete", "nested-deletion", "cancel-no-write", "retry-after-error", "desktop-mobile"] }));
} catch (error) {
  await shot("failure");
  console.error(JSON.stringify({ errors, text: (await page.locator("body").innerText()).slice(-6000) }));
  throw error;
} finally { await browser.close(); }
