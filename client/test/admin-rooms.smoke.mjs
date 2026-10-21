import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/admin-rooms-20261021/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
let rooms = Array.from({ length: 24 }, (_, i) => ({ id: String(i), code: `ABC${String(i).padStart(3, "0")}`, name: `Table de Joueur ${i}`, gameId: "yahtzee", ownerName: `Joueur ${i}`,
  isPublic: i % 2 === 0, protected: i % 2 === 1, ranked: i === 1, status: i % 3 === 0 ? "waiting" : "playing", players: [{ id: `player-${i}`, pseudo: `Joueur ${i}` }, { id: `bot-${i}`, pseudo: "Bot 1", isBot: true }] }));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/admin/rooms") return route.fulfill({ json: rooms });
    if (request.method() === "DELETE" && path.startsWith("/api/admin/rooms/")) { rooms = rooms.filter((room) => !path.endsWith(room.code)); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { messages: {} } });
  });
  await page.goto(`${process.env.UI_URL || "http://localhost:5197"}/test/fixtures/admin-rooms.html`);
  await page.getByRole("heading", { name: "Toutes les tables" }).waitFor();
  await page.getByText("Table de Joueur 0", { exact: true }).waitFor();
  assert.equal(await page.locator(".room-management-list > article").count(), 20);
  await page.getByRole("button", { name: "Page suivante", exact: true }).click();
  assert.equal(await page.locator(".room-management-list > article").count(), 4);
  await page.getByRole("textbox", { name: "Rechercher une table" }).fill("ABC001");
  await page.getByText("Table de Joueur 1", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByText("La partie classée sera annulée sans modifier les classements.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(rooms.length, 24);
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fermer la table", exact: true }).click();
  await page.getByText("Table fermée.", { exact: true }).waitFor();
  assert.equal(rooms.length, 23);
  await page.getByRole("textbox", { name: "Rechercher une table" }).fill("");
  await page.getByLabel("Visibilité", { exact: true }).selectOption("private");
  assert.equal(await page.locator(".room-management-list > article").count(), 11);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: fileURLToPath(output), pagination: true, filters: true, cancellation: true, closure: true, blocker: Boolean(process.env.BLOCKER_MODULE), errors }));
} finally { await browser.close(); }
