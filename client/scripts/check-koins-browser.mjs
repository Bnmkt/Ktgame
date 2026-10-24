import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultKoinConfig } from "../../server/src/services/koins/config.js";

const moduleUrl = (value) =>
  value ? pathToFileURL(path.resolve(value)).href : null;
const { chromium } = await import(
  moduleUrl(process.env.PLAYWRIGHT_MODULE) || "playwright"
);
const { PlaywrightBlocker } = await import(
  moduleUrl(process.env.BLOCKER_MODULE) || "@ghostery/adblocker-playwright"
);
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const base = process.env.KOIN_BROWSER_URL || "http://127.0.0.1:5197",
  directory = path.resolve("../docs/previews/koins-20261023");
await fs.mkdir(directory, { recursive: true });
const artwork = await fs.readFile(
  new URL(
    "../public/mascotte_assets/ui/nixie-victory-360.webp",
    import.meta.url,
  ),
);
const image = `/api/media/${"a".repeat(64)}.webp`;
let config = {
  ...structuredClone(defaultKoinConfig),
  purchasesEnabled: true,
  codesEnabled: true,
  shopEnabled: true,
  iconImage: image,
};
config.offers = config.offers.map((offer) => ({
  ...offer,
  image,
  description:
    "Habille ton profil avec tes cosmétiques préférés.\nLes Koins ne changent jamais les résultats des parties.",
}));
const user = {
  id: "visual-admin",
  admin: true,
  pseudo: "Joueur",
  tokens: 12500,
  profile: { birthDate: "1990-01-01" },
  cosmetics: { icons: [], equipped: {} },
};
const wallet = {
  balance: 150,
  blocked: false,
  purchaseAllowed: true,
  transactions: [
    {
      id: "tx",
      created_at: new Date().toISOString(),
      reason: "code",
      delta: 150,
    },
  ],
  orders: [],
  documents: [],
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") console.error(message.text());
    });
    await blocker.enableBlockingInPage(page);
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        headers = {
          "access-control-allow-origin": request.headers().origin || base,
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "content-type,authorization",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
        };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      if (url.pathname === image)
        return route.fulfill({
          contentType: "image/webp",
          body: artwork,
          headers,
        });
      let body = {};
      if (url.pathname === "/api/koins/config") body = config;
      else if (url.pathname === "/api/me/koins") body = wallet;
      else if (url.pathname === "/api/admin/monetization") {
        if (request.method() === "PUT") config = request.postDataJSON();
        body =
          request.method() === "PUT"
            ? config
            : {
                config,
                providers: { stripe: true, discord: false },
                orders: [],
                documents: [],
                transactions: [],
                statistics: [],
                batches: [],
                jobs: [],
                mailLog: [],
              };
      }
      await route.fulfill({ json: body, headers });
    });
    for (const view of ["admin", "wallet", "shop"]) {
      const main = `
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import {LocaleProvider} from '/src/locales/LocaleProvider.jsx';
        import {MonetizationAdmin} from '/src/components/admin/MonetizationAdmin.jsx';
        import {KoinWallet} from '/src/features/koins/Koins.jsx';
        import {ShopCatalog} from '/src/components/shop/ShopCatalog.jsx';
        import '/src/styles.css';
        const user=${JSON.stringify(user)}, view=${JSON.stringify(view)};
        const items=[{id:'one',name:'Icône de collection',description:'Un profil à ton image.',type:'icons',value:'star',price:1000,koinPrice:30,category:'classic',icon:'star',packs:['collection']},{id:'two',name:'Icône exclusive',type:'icons',value:'heart',price:2000,koinPrice:50,tokenPriceEnabled:false,category:'classic',icon:'heart',packs:['collection']}];
        const content=view==='admin'?React.createElement(MonetizationAdmin):view==='wallet'?React.createElement(KoinWallet,{user}):React.createElement(ShopCatalog,{user,items,stats:{},onPurchaseItem:()=>{},onPurchasePack:()=>{}});
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement('main',{className:view==='admin'?'':'card',style:{maxWidth:1240,margin:'24px auto',padding:16}},content)));
      `;
      await page.route("**/src/main.jsx*", (route) =>
        route.fulfill({ contentType: "text/javascript", body: main }),
      );
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", {
          name:
            view === "admin"
              ? "Monétisation"
              : view === "wallet"
                ? "Mes Koins"
                : "Icône de collection",
          exact: true,
        })
        .first()
        .waitFor();
      if (view === "admin") {
        await page
          .getByRole("button", { name: "Personnalisation", exact: true })
          .click();
        await page
          .getByLabel("Description")
          .first()
          .fill("Une description personnalisée\nAvec une seconde ligne.");
        await page
          .getByRole("button", { name: "Enregistrer", exact: true })
          .click();
        await page
          .getByText("Paramètres enregistrés.", { exact: true })
          .waitFor();
        assert.ok(config.offers[0].description.includes("personnalisée"));
      } else if (view === "shop") {
        assert.equal(
          await page
            .getByRole("heading", { name: "Icône exclusive", exact: true })
            .count(),
          0,
        );
        await page.getByRole("button", { name: /Koins · 150/ }).click();
        await page
          .getByRole("heading", { name: "Icône exclusive", exact: true })
          .first()
          .waitFor();
      }
      await page.screenshot({
        path: path.join(directory, `${view}-${viewport.width}.png`),
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      assert.equal(overflow, false, `${view} overflows at ${viewport.width}`);
      const brokenImages = await page
        .locator(".koin-workspace img")
        .evaluateAll(
          (images) =>
            images.filter((image) => !image.complete || !image.naturalWidth)
              .length,
        );
      assert.equal(brokenImages, 0);
      results.push({ view, width: viewport.width, overflow, brokenImages });
      await page.unroute("**/src/main.jsx*");
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await fs.writeFile(
    path.join(directory, "checks.json"),
    JSON.stringify({ contentBlocker: true, results }, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
