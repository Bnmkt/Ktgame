import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultKoinConfig } from "../../server/src/services/koins/config.js";
import { koinReceiptPdf } from "../../server/src/services/koins/documents.js";

const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
);
const { PlaywrightBlocker } = await import(
  pathToFileURL(process.env.BLOCKER_MODULE).href
);
const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const base = "http://127.0.0.1:5197",
  directory = path.resolve("../docs/previews/header-documents-20261024");
await fs.mkdir(directory, { recursive: true });
const logo = await fs.readFile(
  new URL("../public/pwa/icon-192.png", import.meta.url),
);
let enabled = true;
const config = {
  ...structuredClone(defaultKoinConfig),
  documents: structuredClone(defaultKoinConfig.documents),
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const checks = [];
const previewPdf = await koinReceiptPdf({
  number: "APERÇU",
  order: {
    id: "example",
    provider: "code",
    koins: 25,
    createdAt: new Date().toISOString(),
    customer: { name: "Joueur exemple" },
    issuer: {},
  },
  logo,
  specimen: true,
});
try {
  const context = await browser.newContext({ reducedMotion: "reduce" }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await blocker.enableBlockingInPage(page);
  await page.route(`${base}/`, async (route) => {
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "content-security-policy": "frame-src 'self' blob:",
      },
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      headers = {
        "access-control-allow-origin": request.headers().origin || base,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type,authorization",
        "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname.startsWith("/api/branding/"))
      return route.fulfill({ body: logo, contentType: "image/png", headers });
    if (url.pathname === "/api/admin/monetization/documents/preview")
      return route.fulfill({
        body: previewPdf,
        contentType: "application/pdf",
        headers,
      });
    const publicConfig = {
      ...config,
      shopEnabled: enabled,
      codesEnabled: enabled,
      purchasesEnabled: enabled,
    };
    const data =
      url.pathname === "/api/koins/config"
        ? publicConfig
        : url.pathname === "/api/me/koins"
          ? { balance: 987654, transactions: [], orders: [], documents: [] }
          : url.pathname === "/api/admin/monetization"
            ? {
                config,
                providers: { stripe: false, discord: false },
                orders: [],
                documents: [],
                transactions: [],
                statistics: [],
                batches: [],
                jobs: [],
                mailLog: [],
              }
            : {};
    return route.fulfill({ json: data, headers });
  });
  for (const view of ["header", "activity", "documents"]) {
    const entry = `
   import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
   import{LocaleProvider}from'/src/locales/LocaleProvider.jsx';import{CasinoHeader}from'/src/components/navigation/CasinoHeader.jsx';import{DailyBonusButton}from'/src/components/navigation/DailyBonusButton.jsx';import{DisplayName}from'/src/components/cosmetics/Cosmetics.jsx';import{NotificationCenter}from'/src/components/feedback/Feedback.jsx';import{MonetizationAdmin}from'/src/components/admin/MonetizationAdmin.jsx';import{Shield,Users}from'/node_modules/.vite/deps/lucide-react.js';
   import'/src/styles.css';import'/src/navigation/casino.css';import'/src/navigation/mobile-casino.css';import'/src/navigation/header-layout.css';import'/src/features/discord/activity.css';
   document.body.classList.toggle('activity-session',${JSON.stringify(view)}==='activity');
   const user={id:'preview',pseudo:'PseudoExtremementLongPourVerifierLeHeader',admin:true,tokens:987654321,profile:{birthDate:'1990-01-01'},cosmetics:{equipped:{icon:'chip'}},dailyBonus:{canClaim:true,nextReward:10000,nextMultiplier:3}};
   const children=[React.createElement(DailyBonusButton,{key:'bonus',user,settings:{dailyTokens:10000},setUser:()=>{},onFeedback:()=>{}}),React.createElement('div',{className:'identity-pill',key:'name'},React.createElement(DisplayName,{user,interactive:false}),React.createElement('a',{href:'#',className:'casino-management-link',title:'Administration'},React.createElement(Shield,{size:18}))),React.createElement('button',{key:'chat',className:'secondary icon-toggle conversation-toggle',title:'Social'},React.createElement(Users,{size:18})),React.createElement(NotificationCenter,{key:'notifications',items:[],open:false,onToggle:()=>{}})];
   const content=${JSON.stringify(view)}!=='documents'?React.createElement(CasinoHeader,{user,siteName:'KTGA.ME',siteIcon:'/api/branding/site',view:'room',roomCode:'EXAMPLE',eventSlug:'exemple',tribunalAvailable:true,onNavigate:key=>window.__navigation=key,onLogout:()=>{}},...children):React.createElement('main',{style:{maxWidth:1300,margin:'24px auto',padding:12}},React.createElement(MonetizationAdmin));
   ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,content));
  `;
    await page.route("**/src/main.jsx*", (route) =>
      route.fulfill({ body: entry, contentType: "text/javascript" }),
    );
    const widths =
      view === "header"
        ? [1920, 1440, 1280, 1100, 1024, 900, 800, 761, 760, 390, 320]
        : view === "activity"
          ? [1024, 390, 320]
          : [1440, 390];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: "domcontentloaded" });
      if (view !== "documents") {
        await page.locator(".casino-currency-koins").waitFor();
        await page.waitForTimeout(150);
        const geometry = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          headerHeight: document
            .querySelector(".casino-header")
            .getBoundingClientRect().height,
          links: [...document.querySelectorAll(".casino-navigation > a")].map(
            (node) => node.getBoundingClientRect().top,
          ),
          regions: [...document.querySelector(".casino-header-inner").children]
            .filter((node) => getComputedStyle(node).display !== "none")
            .map((node) => {
              const r = node.getBoundingClientRect();
              return { x: r.x, right: r.right, top: r.top, bottom: r.bottom };
            }),
        }));
        assert.equal(geometry.overflow, false, `header overflow ${width}`);
        if (width > 760) {
          assert.ok(
            geometry.headerHeight <= 90,
            `header height ${width}: ${geometry.headerHeight}`,
          );
          assert.ok(
            geometry.links.every(
              (top) => Math.abs(top - geometry.links[0]) < 1,
            ),
          );
          for (let i = 1; i < geometry.regions.length; i++)
            assert.ok(
              geometry.regions[i - 1].right <= geometry.regions[i].x + 1,
              `overlap ${width}`,
            );
        }
        const more = page.locator(".casino-navigation > .casino-nav-more");
        if (width > 760 && (await more.isVisible())) {
          await more.click();
          await page
            .getByRole("dialog")
            .getByRole("link", { name: "Ma table", exact: true })
            .click();
          assert.equal(await page.evaluate(() => window.__navigation), "room");
        }
        if ([1920, 1024, 390, 320].includes(width))
          await page.screenshot({
            path: path.join(directory, `${view}-${width}.png`),
            fullPage: true,
          });
        enabled = false;
        await page.evaluate(() =>
          window.dispatchEvent(new Event("ktga-koins-updated")),
        );
        await page
          .locator(".casino-currency-koins")
          .waitFor({ state: "hidden" });
        assert.equal(await page.locator(".casino-currency-row").count(), 1);
        enabled = true;
        checks.push({ view, width, ...geometry });
      } else {
        await page
          .getByRole("button", { name: "Modèle des factures", exact: true })
          .click();
        await page
          .getByRole("heading", {
            name: "Modèle des documents KTGA",
            exact: true,
          })
          .waitFor();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        assert.equal(overflow, false, `document editor overflow ${width}`);
        await page
          .getByRole("button", { name: "Prévisualiser le PDF", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        assert.match(
          await dialog.locator("iframe").getAttribute("src"),
          /^blob:/,
        );
        await dialog
          .getByRole("button", { name: "Fermer", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await page.screenshot({
          path: path.join(directory, `documents-${width}.png`),
          fullPage: true,
        });
        checks.push({ view, width, overflow });
      }
    }
    await page.unroute("**/src/main.jsx*");
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(directory, "checks.json"),
    JSON.stringify(checks, null, 2),
  );
  console.log(
    JSON.stringify(
      checks.map(({ view, width, headerHeight, overflow }) => ({
        view,
        width,
        headerHeight,
        overflow,
      })),
    ),
  );
  await context.close();
} finally {
  await browser.close();
}
