import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { zipSync } from "fflate";
import { registerMediaRoutes } from "../../server/src/services/media-library.js";
const require=createRequire(new URL("../../server/package.json",import.meta.url)),express=require("express");
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const directory=await fs.mkdtemp(path.join(os.tmpdir(),"ktga-zip-browser-"));
const app=express();app.use(express.json());
const store=await registerMediaRoutes({app,directory,auth:(req,_res,next)=>{req.auth={id:"fixture-editor"};req.backOfficeUser={admin:true};next();},requireBackOffice:(_req,_res,next)=>next(),settings:()=>({mediaUploadMaxMb:5})});
app.get("/api/locales/:locale",(_req,res)=>res.json({messages:{}}));
const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:"msedge",headless:true});
const output=new URL(`../../docs/previews/media-archive-20261023/${Date.now()}/`,import.meta.url);await fs.mkdir(output,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let posts=0;
  page.on("pageerror",error=>errors.push(error.message));
  if(process.env.BLOCKER_MODULE){const {PlaywrightBlocker}=await import(pathToFileURL(process.env.BLOCKER_MODULE).href);await(await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);}
  await page.route("**/api/**",async route=>{
    const req=route.request(),url=new URL(req.url());
    const headers={"Access-Control-Allow-Origin":req.headers().origin||"http://localhost:5197","Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"content-type,authorization","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers});
    if(req.method()==="POST")posts++;
    const response=await fetch(origin+url.pathname+url.search,{method:req.method(),headers:{"Content-Type":req.headers()["content-type"]||"application/json"},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})});
    return route.fulfill({status:response.status,headers,contentType:response.headers.get("content-type")||"application/json",body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(`${process.env.UI_URL||"http://localhost:5197"}/test/fixtures/media-archive.html`,{waitUntil:"domcontentloaded"});
  const system=page.locator('.metrics-section').filter({has:page.getByRole('heading',{name:'Système',exact:true})});
  for(const[label,value]of[["Capacité du disque","40 Go"],["Disque utilisé","6 Go"],["Espace disponible","32 Go"],["Espace réservé système","2 Go"],["RAM disponible","3 Go"]])assert.equal(await system.locator('dl > div').filter({has:page.getByText(label,{exact:true})}).locator('dd').textContent(),value);
  await system.screenshot({path:fileURLToPath(new URL('system-capacity.png',output))});
  const png=await fs.readFile(new URL('../public/pwa/icon-180.png',import.meta.url)),second=await fs.readFile(new URL('../public/pwa/icon-192.png',import.meta.url)),third=await fs.readFile(new URL('../public/pwa/icon-512.png',import.meta.url));
  const zip=zipSync({"mascottes/Lucky été.png":png,"fond casino.png":second,"ne-pas-importer.png":third,"../interdit.png":png,"notes.txt":new TextEncoder().encode("ignored")});
  await page.getByRole('button',{name:'Importer un ZIP',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Importer des images depuis un ZIP',exact:true});await dialog.waitFor();
  await page.waitForFunction(()=>!document.querySelector('.media-archive-toolbar button').disabled);
  await dialog.locator('input[type=file]').setInputFiles({name:'collection.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
  await dialog.locator('.media-archive-item').nth(3).waitFor();
  assert.equal(posts,0,'no uploads before confirmation');
  assert.equal(await dialog.getByLabel('Nom de Lucky été.png',{exact:true}).inputValue(),'Lucky été.png');
  assert.equal(await dialog.getByLabel('Sélectionner interdit.png',{exact:true}).isDisabled(),true);
  await dialog.getByLabel('Sélectionner ne-pas-importer.png',{exact:true}).uncheck();
  await dialog.getByLabel('Nom de Lucky été.png',{exact:true}).fill('Lucky heureux.png');
  for(const[name,width,height]of[["desktop",1440,1000],["mobile",390,844],["small-mobile",320,740]]){
    await page.setViewportSize({width,height});assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+2));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output))});
  }
  await dialog.getByRole('button',{name:'Importer 2 image(s)',exact:true}).click();
  await dialog.getByRole('button',{name:'Terminer',exact:true}).waitFor();
  assert.equal(posts,2);assert.deepEqual(store.list().map(row=>row.name).sort(),['Lucky heureux.png','fond casino.png']);
  await dialog.getByRole('button',{name:'Terminer',exact:true}).click();
  await page.locator('.media-library-item').nth(1).waitFor();
  assert.equal(await page.locator('.media-library-item').count(),2);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({screenshots:fileURLToPath(output),posts,names:store.list().map(row=>row.name),worker:true,selectedOnly:true,diskCapacity:true,errors}));
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
  if(path.dirname(directory)!==os.tmpdir()||!path.basename(directory).startsWith('ktga-zip-browser-'))throw Error('Unexpected temporary directory');
  await fs.rm(directory,{recursive:true,force:true});
}
