import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(pathToFileURL(path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules/playwright/index.mjs")));
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`, directory = path.join(root, "docs/previews/notice-crop-20261012", String(Date.now()));
fs.mkdirSync(directory, { recursive: true });
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: origin }, stdio: ["ignore", "pipe", "pipe"] });
let output = "", browser;
child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import '/src/styles.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{CasinoSettings}=await import('/src/components/admin/CasinoSettings.jsx'),{defaultPublicSettings}=await import('/src/config/site.js');
const h=React.createElement;function App(){const[draft,setDraft]=React.useState({...defaultPublicSettings,lobbyNotice:{enabled:true,title:'Annonce',content:'Bienvenue au casino. Découvrez les nouvelles parties.',backgroundImage:'',updatedAt:''}});return h(LocaleProvider,null,h('main',{className:'app-shell'},h(CasinoSettings,{draft,setDraft,games:[],onSubmit:event=>{event.preventDefault();window.saved=draft}})))}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
</script></body></html>`;
try {
  for (let attempt = 0; attempt < 200; attempt++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); if (attempt === 199) throw new Error(output); }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, locale: "fr-BE" });
    let image, uploads = 0;
    await page.route("**/__crop", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.route("**/api/**", route => {
      const key = new URL(route.request().url()).pathname;
      if (key === "/api/admin/lobby-notice/image") {
        image = route.request().postDataBuffer(); uploads++;
        assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [1280, 560]);
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ image: "/api/game-images/notice.png" }) });
      }
      if (key === "/api/game-images/notice.png") return route.fulfill({ contentType: "image/png", body: image });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: {} }) });
    });
    await page.goto(`${origin}/__crop`);
    await page.getByRole("button", { name: "Annonce", exact: true }).click();
    await page.getByRole("button", { name: "Importer / recadrer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Image de fond · Annonce", exact: true });
    await dialog.getByLabel("Importer une image", { exact: true }).setInputFiles(path.join(root, "client/public/ktga-preview.png"));
    const zoom = dialog.getByRole("slider", { name: "Zoom du recadrage" });
    await zoom.waitFor(); await zoom.focus(); await zoom.press("Home");
    assert.equal(await zoom.inputValue(), "0.5");
    await dialog.screenshot({ path: path.join(directory, `${name}-crop.png`) });
    await dialog.getByRole("button", { name: "Appliquer le recadrage" }).click();
    await dialog.waitFor({ state: "detached" }); assert.equal(uploads, 1);
    assert.equal(await page.getByRole("textbox", { name: "Image de fond", exact: true }).inputValue(), "/api/game-images/notice.png");
    await page.getByRole("button", { name: "Aperçu", exact: true }).click();
    await page.locator(".lobby-notice-art img").first().evaluate(img => img.decode());
    await page.locator(".lobby-notice-editor").screenshot({ path: path.join(directory, `${name}-preview.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.close();
  }
  console.log(JSON.stringify({ directory, result: "Existing crop modal imports notice images, zooms to 0.5 and previews their background" }));
} finally { await browser?.close(); if (child.exitCode === null) { const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited; } }
