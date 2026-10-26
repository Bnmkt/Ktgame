import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const base = "http://127.0.0.1:5197";
const directory = path.resolve("../docs/previews/shop-currencies-20261026");
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  await blocker.enableBlockingInPage(page);
  let balance = 40;
  await page.route("**/api/**", async (route) => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": base, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const config = { shopEnabled: true, purchasesEnabled: true, codesEnabled: true, offers: [], testMode: true };
    if (pathname === "/api/me/koins/redeem") { balance += 25; return route.fulfill({ json: { order: { koins: 25 } }, headers }); }
    const data = pathname === "/api/koins/config" ? config : pathname === "/api/me/koins" ? { balance, transactions: [], orders: [], documents: [], purchaseAllowed: true } : {};
    return route.fulfill({ json: data, headers });
  });
  await page.route("**/src/main.jsx*", (route) => route.fulfill({ contentType: "text/javascript", body: `
    import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import{LocaleProvider}from'/src/locales/LocaleProvider.jsx';import{ShopCatalog}from'/src/components/shop/ShopCatalog.jsx';import'/src/styles.css';
    const user={id:'preview',pseudo:'Joueur',tokens:1000,profile:{},cosmetics:{icons:['chip'],equipped:{icon:'chip',memberCard:'default',nameEffect:'none',diceSkin:'classic',cardSkin:'classic'}}};
    const common={description:'Un objet à découvrir.',category:'classic',packs:['neon']};
    const items=[{...common,id:'dual',type:'icons',value:'crown',name:'Couronne',price:200,koinPrice:20},{...common,id:'tokens',type:'nameEffects',value:'gold',name:'Nom doré',price:100},{...common,id:'koins',type:'memberCards',value:'gold',name:'Carte royale',price:0,tokenPriceEnabled:false,koinPrice:10},{...common,id:'owned',type:'icons',value:'chip',name:'Mon insigne',price:80,koinPrice:8}];
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement('main',{className:'app-shell shop-shell'},React.createElement('section',{className:'shop-page-panel'},React.createElement(ShopCatalog,{user,items,stats:[],onPurchaseItem:item=>window.__purchase=item,onPurchasePack:pack=>window.__pack=pack,onPreviewProfile:()=>{}})))));
  ` }));
  const card = (name) => page.locator(".catalog-item").filter({ has: page.getByRole("heading", { name, exact: true }) });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base);
    await card("Couronne").locator(".catalog-buy-koins").waitFor();
    await card("Couronne").locator(".catalog-buy-tokens").click();
    assert.equal((await page.evaluate(() => window.__purchase)).price, 200);
    await card("Couronne").locator(".catalog-buy-koins").click();
    assert.equal((await page.evaluate(() => window.__purchase)).currency, "koins");
    assert.equal((await page.evaluate(() => window.__purchase)).price, 20);
    assert.equal(await card("Nom doré").locator(".catalog-buy-koins").count(), 0);
    assert.equal(await card("Carte royale").locator(".catalog-buy-tokens").count(), 0);
    assert.equal(await card("Mon insigne").count(), 0);
    await page.getByLabel("Inventaire", { exact: true }).selectOption("owned");
    assert.equal(await card("Mon insigne").locator(".catalog-owned").count(), 1);
    assert.equal(await card("Mon insigne").locator(".catalog-purchase-options").count(), 0);
    await page.getByLabel("Inventaire", { exact: true }).selectOption("unowned");
    await page.locator(".catalog-currency-filters").getByRole("checkbox", { name: "Koins", exact: true }).uncheck();
    assert.equal(await card("Carte royale").count(), 0);
    await page.locator(".catalog-currency-filters").getByRole("checkbox", { name: "Koins", exact: true }).check();
    await page.locator(".catalog-currency-filters").getByRole("checkbox", { name: "Jetons", exact: true }).uncheck();
    assert.equal(await card("Nom doré").count(), 0);
    await page.getByRole("button", { name: "Réinitialiser les filtres", exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `Horizontal overflow at ${width}`);
    await page.screenshot({ path: path.join(directory, `catalog-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Packs", exact: true }).click();
    await card("Couronne").getByRole("checkbox").check();
    await card("Carte royale").getByRole("checkbox").check();
    const checkout = page.locator(".catalog-checkout");
    assert.equal(await checkout.locator(".catalog-buy-tokens").isDisabled(), true);
    await checkout.locator(".catalog-buy-koins").click();
    assert.equal((await page.evaluate(() => window.__pack)).total, 29);
    await card("Nom doré").getByRole("checkbox").check();
    assert.equal(await checkout.locator(".catalog-buy-koins").isDisabled(), true);
    assert.equal(await checkout.locator(".catalog-checkout-hint").count(), 1);
    await page.screenshot({ path: path.join(directory, `pack-${width}.png`), fullPage: true });
    await page.locator(".catalog-mode").getByRole("button", { name: "Koins", exact: true }).click();
    await page.getByRole("heading", { name: "Mes Koins", exact: true }).waitFor();
    await page.getByRole("button", { name: "Utiliser un code", exact: true }).click();
    await page.getByLabel("Code à usage unique", { exact: true }).fill("TEST-GIFT");
    await page.getByRole("button", { name: "Utiliser le code", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "25 Koins ajoutés." }).waitFor();
    checks.push({ width, overflow, purchaseButtons: true, ownership: true, filters: true, packPricing: true, giftCode: true });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(directory, "checks.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
