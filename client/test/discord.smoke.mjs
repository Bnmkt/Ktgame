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
const directory = path.join(root, "docs/previews/discord-20261014", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
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
try {
  let ready = false;
  for (let i=0; i<100; i++) { try { if ((await fetch(origin)).ok) { ready=true; break; } } catch {} await new Promise(resolve => setTimeout(resolve,100)); }
  assert.ok(ready,output);
  browser = await chromium.launch({ channel:"msedge", headless:true });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const viewport of [{ width:390, height:844 }, { width:1440, height:1000 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage();
    page.on("pageerror",error=>errors.push(error.message)); await blocker.enableBlockingInPage(page);
    await page.route("**/api/**", async route => {
      const request=route.request(), pathname=new URL(request.url()).pathname;
      let data = [], status=200;
      if(pathname==="/api/config") data={siteName:"KTGA.ME",registrationsEnabled:true,guestAccessEnabled:true,discordLoginAvailable:true};
      else if(pathname==="/api/health") data={ok:true};
      else if(pathname==="/api/me") { status=401; data={error:"Non authentifié."}; }
      else if(pathname==="/api/auth/discord/complete") { completed++; data={mfaRequired:true,challengeId:"test-challenge",methods:["totp"],expiresAt:new Date(Date.now()+600000).toISOString()}; }
      else if(pathname==="/api/auth/mfa/verify") { assert.equal(request.postDataJSON().challengeId,"test-challenge"); status=401; data={error:"Code invalide ou tentative expirée."}; }
      else if(pathname==="/api/me/discord") data={available:true,ageAllowed:true,linked:false,username:""};
      else if(pathname==="/api/me/discord/presence") data={available:true,enabled:false,transport:"companion"};
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
    assert.ok(await page.getByRole("checkbox").isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await page.screenshot({path:path.join(directory,`${viewport.width}-profile.png`),fullPage:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,viewports:2,completed,screenshots:directory}));
} finally {
  await browser?.close();
  if(child.exitCode===null) { const ended=new Promise(resolve=>child.once("exit",resolve)); child.kill(); await ended; }
}
