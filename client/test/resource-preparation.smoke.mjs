import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel:"msedge", headless:true });
const output = new URL(`../../docs/previews/resource-preparation-20261023/${Date.now()}/`, import.meta.url);
await fs.mkdir(output,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  if(process.env.BLOCKER_MODULE) {
    const {PlaywrightBlocker}=await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await(await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
  }
  let requests=0,revision="first";
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64");
  await page.route("**/resource-manifest.json",route=>route.fulfill({json:{version:1,assets:Array.from({length:18},(_,n)=>({url:`/guides/fixture-${n}.png`,revision:n===0?revision:"first",bytes:png.length,category:"illustrations"}))}}));
  await page.route("**/api/resources",route=>route.fulfill({json:{version:1,assets:[]},headers:{"access-control-allow-origin":"*"}}));
  await page.route("**/api/locales/**",route=>route.fulfill({json:{messages:{}}}));
  await page.route("**/guides/fixture-*.png*",async route=>{requests++;await new Promise(resolve=>setTimeout(resolve,1100));await route.fulfill({body:png,contentType:"image/png"});});
  const url=`${process.env.UI_URL||"http://localhost:5197"}/test/fixtures/resource-preparation.html`;
  await page.goto(url,{waitUntil:"domcontentloaded"});
  const dialog=page.getByRole("dialog",{name:"Préparation du casino",exact:true});await dialog.waitFor();
  const firstPose=await dialog.locator('.mascot-visible').getAttribute('src');
  for(const[name,width,height]of[["desktop",1440,1000],["mobile",390,844]]){
    await page.setViewportSize({width,height});
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+2));
    await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output))});
  }
  await page.waitForTimeout(3650);
  assert.notEqual(await dialog.locator('.mascot-visible').getAttribute('src'),firstPose,'waiting mascots change poses');
  await dialog.getByRole("button",{name:"Entrer dans le casino",exact:true}).click();
  await dialog.waitFor({state:"detached"});
  assert.equal(await page.locator("[data-resources-pending]").getAttribute("data-resources-pending"),"false");
  for(let n=0;n<100;n++) {
    const complete=await page.evaluate(async()=>{const cache=await caches.open("ktga-resources-v1");return(await cache.keys()).filter(key=>key.url.includes("fixture-")).length===18;});
    if(complete)break;
    await page.waitForTimeout(100);
  }
  assert.equal(requests,18);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await page.unroute("**/guides/fixture-*.png*");
  const cached=await page.evaluate(async()=>{const response=await fetch("/guides/fixture-0.png");return{status:response.status,bytes:(await response.arrayBuffer()).byteLength};});
  assert.equal(cached.status,200);assert.equal(cached.bytes,png.length);assert.equal(requests,18,"normal requests use the worker cache");
  await page.route("**/guides/fixture-*.png*",async route=>{requests++;await route.fulfill({body:png,contentType:"image/png"});});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-resources-pending="false"]');
  assert.equal(requests,18,"second launch does not download unchanged files");
  assert.equal(await dialog.count(),0);
  revision="second";
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-resources-pending="false"]');
  assert.equal(requests,19,"only an updated image is downloaded again");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({screenshots:fileURLToPath(output),requests,cached,reused:true,incremental:true,background:true,errors}));
}finally{await browser.close();}
