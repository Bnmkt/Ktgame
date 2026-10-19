import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCustomPageStore, registerCustomPageRoutes } from "../../server/src/services/custom-pages.js";

const require = createRequire(new URL("../../server/package.json", import.meta.url));
const express = require("express");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const store = createCustomPageStore({ filename:":memory:" }), app = express();
app.use(express.json());
registerCustomPageRoutes({ app, store, auth:(req,_res,next) => { req.auth={id:"test-editor"}; next(); }, requireBackOffice:(_req,_res,next) => next() });
app.get("/api/locales/:locale", (_req,res) => res.json({messages:{}}));
const server = app.listen(0,"127.0.0.1");
await new Promise(resolve => server.once("listening",resolve));
const apiOrigin = `http://127.0.0.1:${server.address().port}`;
const previews = new URL(`../../docs/previews/custom-pages-20261019/${Date.now()}/`,import.meta.url);
await fs.mkdir(previews,{recursive:true});
const browser = await chromium.launch({channel:"msedge",headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.on("pageerror",error => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  await page.route("**/api/**",async route => {
    const request=route.request(), url=new URL(request.url());
    const headers={"Access-Control-Allow-Origin":request.headers().origin || "http://127.0.0.1:5197","Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS"};
    if(request.method()==="OPTIONS")return route.fulfill({status:204,headers});
    const response=await fetch(apiOrigin+url.pathname+url.search,{method:request.method(),headers:{"Content-Type":"application/json"},...(request.postData() ? {body:request.postData()} : {})});
    return route.fulfill({status:response.status,body:await response.text(),contentType:"application/json",headers});
  });
  const fixture=`${process.env.CUSTOM_PAGE_ORIGIN || "http://127.0.0.1:5197"}/test/fixtures/custom-pages.html`;
  await page.goto(fixture);
  await page.getByRole("button",{name:"Nouvelle page",exact:true}).click();
  await page.getByLabel("Titre",{exact:true}).fill("Le club KTGA");
  await page.getByRole("textbox",{name:"Contenu de la page",exact:true}).waitFor();
  await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
  await page.getByText("Brouillon enregistré.",{exact:true}).waitFor();
  assert.deepEqual(store.list(true),[]);
  await page.getByRole("button",{name:"HTML",exact:true}).click();
  const editor=page.getByRole("textbox",{name:"Contenu de la page",exact:true});
  await editor.fill('<section style="color:#e8c777"><h2>Les joueurs du club</h2><p>Bienvenue autour de la table.</p><img src="/mascotte_assets/ui/lucky-point-360.webp" width="180" alt="Lucky"><script>window.customPageExecuted=true</script></section>');
  await page.locator(".custom-pages-preview h2").getByText("Les joueurs du club",{exact:true}).waitFor();
  assert.equal(await page.evaluate(() => window.customPageExecuted),undefined);
  await page.screenshot({path:fileURLToPath(new URL("editor-desktop.png",previews)),fullPage:true,animations:"disabled"});
  await page.getByRole("button",{name:"Réglages",exact:true}).click();
  await page.getByLabel("Afficher un lien dans le footer",{exact:true}).check();
  await page.getByRole("button",{name:"Publier",exact:true}).click();
  await page.getByText("Page publiée.",{exact:true}).waitFor();
  assert.ok(store.published("le-club-ktga"));
  assert.equal(store.published("le-club-ktga").html.includes("script"),false);
  await page.locator('footer a[href="/pages/le-club-ktga"]').waitFor();
  await page.getByRole("button",{name:"Contenu",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:fileURLToPath(new URL("editor-mobile.png",previews)),fullPage:true,animations:"disabled"});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth),false);
  await page.goto(`${fixture}?slug=le-club-ktga`);
  await page.locator(".custom-page-content h2").waitFor();
  assert.equal(await page.evaluate(() => window.customPageExecuted),undefined);
  await page.screenshot({path:fileURLToPath(new URL("public-mobile.png",previews)),fullPage:true,animations:"disabled"});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log("Custom page draft, HTML sanitizing, publish, footer and mobile flow passed. Previews:",fileURLToPath(previews));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); store.close(); }
