import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory = path.join(root, "docs/previews/discord-20261015", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, env: { ...process.env, VITE_API_URL: origin, VITE_BASE_PATH: "/" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "", browser, completed = 0;
const errors = [];
child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => output += chunk);
const profileHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import '/src/styles.css'; import '/src/components/profile/account-workspace.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'); const {AccountConnections}=await import('/src/components/profile/AccountConnections.jsx');
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement('main',{className:'app-shell'},React.createElement('div',{className:'panel'},React.createElement(AccountConnections,{user:{id:'player'},onUser:()=>{},onError:console.error,onMessage:()=>{}})))));
</script></body></html>`;
const adminHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import '/src/styles.css';const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{Admin}=await import('/src/pages/AdminPage.jsx');
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement(Admin,{user:{id:'player',admin:true},onBack:()=>{},onSettingsChange:()=>{}})));
</script></body></html>`;
try {
  let ready = false;
  for (let i=0; i<100; i++) { try { if ((await fetch(origin)).ok) { ready=true; break; } } catch {} await new Promise(resolve => setTimeout(resolve,100)); }
  assert.ok(ready,output);
  browser = await chromium.launch({ channel:"msedge", headless:true });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const viewport of [{ width:390, height:844 }, { width:1440, height:1000 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage();
    page.on("pageerror",error=>errors.push(error.message)); await blocker.enableBlockingInPage(page);
    let presence={available:true,enabled:false,joinEnabled:false,transport:"companion"}, uploaded=false;
    const game={id:"yahtzee",name:"Yahtzee",description:"Treize catégories et cinq dés.",type:"dice",minPlayers:1,maxPlayers:6,category:"score",audience:"solo-multi",complexity:"intermediate"};
    await page.route("**/api/**", async route => {
      const request=route.request(), pathname=new URL(request.url()).pathname;
      let data = [], status=200;
      if(pathname==="/api/config") data={siteName:"KTGA.ME",registrationsEnabled:true,guestAccessEnabled:true,discordLoginAvailable:true};
      else if(pathname==="/api/health") data={ok:true};
      else if(pathname==="/api/me") { status=401; data={error:"Non authentifié."}; }
      else if(pathname==="/api/auth/discord/complete") { completed++; data={mfaRequired:true,challengeId:"test-challenge",methods:["totp"],expiresAt:new Date(Date.now()+600000).toISOString()}; }
      else if(pathname==="/api/auth/mfa/verify") { assert.equal(request.postDataJSON().challengeId,"test-challenge"); status=401; data={error:"Code invalide ou tentative expirée."}; }
      else if(pathname==="/api/me/discord") data={available:true,ageAllowed:true,linked:false,username:""};
      else if(pathname==="/api/me/discord/presence") { if(request.method()==="PATCH") presence={...presence,...request.postDataJSON()};data=presence; }
      else if(pathname==="/api/admin") data={users:[],games:[game],shop:[],achievements:[],pricing:{},permissions:{},overview:{},settings:{siteName:"KTGA.ME"}};
      else if(pathname==="/api/admin/games/yahtzee/images/discordIconImage") {
        const bytes=request.postDataBuffer();assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);uploaded=true;data={image:"/api/game-images/discord-icon.png"};
      }
      else if(pathname==="/api/admin/games/yahtzee" && request.method()==="PATCH") { Object.assign(game,request.postDataJSON());data=game; }
      else if(pathname==="/api/game-images/discord-icon.png") return route.fulfill({contentType:"image/png",body:fs.readFileSync(path.join(root,"client/public/pwa/icon-512.png"))});
      else if(pathname.startsWith("/api/locales")) data={locale:"fr",messages:{}};
      await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
    });
    await page.goto(origin); await page.getByRole("button",{name:"Se connecter avec Discord",exact:true}).waitFor();
    await page.screenshot({path:path.join(directory,`${viewport.width}-login.png`),fullPage:true});
    assert.ok(await page.getByRole("button",{name:"Se connecter avec Discord",exact:true}).isVisible(),"blocker must preserve the entry point");
    const before = completed;
    await page.goto(origin+"/?discord=complete"); await page.getByRole("heading",{name:"Deuxième étape"}).waitFor();
    assert.equal(completed,before+1); assert.ok(!page.url().includes("discord="));
    await page.getByLabel("Code à 6 chiffres",{exact:true}).fill("123456"); await page.getByRole("button",{name:"Confirmer la connexion",exact:true}).click();
    await page.getByText("Code invalide ou tentative expirée.",{exact:true}).waitFor();
    await page.screenshot({path:path.join(directory,`${viewport.width}-mfa.png`),fullPage:true});
    await page.route(origin+"/connection-fixture",route=>route.fulfill({contentType:"text/html",body:profileHtml}));
    await page.goto(origin+"/connection-fixture"); await page.getByRole("button",{name:"Associer Discord",exact:true}).waitFor();
    assert.ok(await page.getByRole("button",{name:"Associer Discord",exact:true}).isVisible());
    const download = page.getByRole("link",{name:"Télécharger le compagnon",exact:true});
    assert.ok(await download.isVisible());
    const archive = await fetch(origin + await download.getAttribute("href"));
    assert.equal(archive.status,200); assert.equal(Buffer.from(await archive.arrayBuffer()).subarray(0,2).toString(),"PK");
    await page.getByRole("button",{name:"Installation et démarrage",exact:true}).click();
    await page.getByRole("heading",{name:"Le compagnon Discord",exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await page.screenshot({path:path.join(directory,`${viewport.width}-companion-help.png`),fullPage:true});
    await page.getByRole("button",{name:"Fermer",exact:true}).last().click();
    await page.getByRole("checkbox",{name:"Autoriser le compagnon à afficher mon activité",exact:true}).click();
    await page.getByRole("checkbox",{name:"Partager le lien de mes salles d’attente publiques sur Discord",exact:true}).waitFor();
    await page.getByRole("checkbox",{name:"Partager le lien de mes salles d’attente publiques sur Discord",exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.account-link-switch input')].filter(input=>input.checked).length===2);
    assert.equal(presence.joinEnabled,true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await page.screenshot({path:path.join(directory,`${viewport.width}-profile.png`),fullPage:true});
    await page.route(origin+"/admin-fixture",route=>route.fulfill({contentType:"text/html",body:adminHtml}));
    await page.goto(origin+"/admin-fixture"); await page.locator('.admin-dashboard').waitFor();
    if(viewport.width<700) await page.locator('.admin-mobile-nav select').selectOption('games');
    else await page.locator('.admin-sidebar').getByRole('button',{name:/^Jeux/}).click();
    await page.getByRole('row').filter({hasText:'yahtzee'}).getByRole('button',{name:'Modifier',exact:true}).click();
    await page.getByRole('tab',{name:'Visuels',exact:true}).click();
    const iconField=page.locator('.game-media-square');await iconField.scrollIntoViewIfNeeded();
    assert.equal(await iconField.getByText('Icône Discord',{exact:true}).isVisible(),true);
    await iconField.getByRole('button',{name:'Ajouter une image',exact:true}).click();
    const crop=page.getByRole('dialog',{name:'Icône Discord · Yahtzee',exact:true});await crop.waitFor();
    await crop.getByLabel('Importer une image du jeu').setInputFiles(path.join(root,'client/public/ktga-preview.png'));
    await page.waitForFunction(()=>!document.querySelector('.game-art-actions button:last-child')?.disabled);
    await crop.getByRole('slider',{name:'Zoom du recadrage'}).fill('0.5');
    await page.screenshot({path:path.join(directory,`${viewport.width}-icon-crop.png`),fullPage:true});
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(node=>node.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(node=>({tag:node.tagName,class:node.className,width:node.getBoundingClientRect().width,right:node.getBoundingClientRect().right}))}));
    assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify(overflow));
    await crop.getByRole('button',{name:'Appliquer le recadrage',exact:true}).click();await crop.waitFor({state:'hidden'});assert.ok(uploaded);
    await iconField.locator('img').waitFor();
    await page.locator('.game-settings-actions').getByRole('button',{name:'Enregistrer',exact:true}).click();
    await page.locator('.game-settings-dialog').waitFor({state:'hidden'});assert.equal(game.discordIconImage,'/api/game-images/discord-icon.png');
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,viewports:2,completed,screenshots:directory}));
} finally {
  await browser?.close();
  if(child.exitCode===null) { const ended=new Promise(resolve=>child.once("exit",resolve)); child.kill(); await ended; }
}
