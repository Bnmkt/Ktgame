import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStatusMonitor, publicStatusComponents } from "../../server/src/services/status-monitor.js";

const root = fileURLToPath(new URL("../../", import.meta.url)), dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory = path.join(root, "docs/previews/status-corrections-20261017", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, env: { ...process.env, VITE_API_URL: origin, VITE_BASE_PATH: "/" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "", browser; const errors = [];
server.stdout.on("data", chunk => output += chunk); server.stderr.on("data", chunk => output += chunk);
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import '/src/styles.css';import '/src/navigation/casino.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{DetectedIncidents}=await import('/src/components/admin/DetectedIncidents.jsx');
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement('main',{className:'app-shell'},React.createElement('section',{className:'panel'},React.createElement(DetectedIncidents,{components:${JSON.stringify(publicStatusComponents)},onPublish:()=>{}})))));
</script></body></html>`;
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(origin)).ok) break; } catch {} if (attempt === 99) throw Error(output); await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const monitor = createStatusMonitor({ filename: ":memory:" });
    monitor.recordSnapshot([{ id: "database", status: "degraded", latencyMs: .7, message: "Le stockage nécessite une surveillance." }]);
    const context = await browser.newContext({ viewport }), page = await context.newPage();
    try {
      page.on("pageerror", error => errors.push(error.message)); await blocker.enableBlockingInPage(page);
      await page.route(origin + "/", route => route.fulfill({ contentType: "text/html", body: html }));
      await page.route(origin + "/api/**", route => {
        const request = route.request(), url = new URL(request.url()), json = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname.startsWith("/api/locales/")) return json({ messages: {} });
        if (url.pathname === "/api/admin/status/detections") return json(monitor.detections.list(Object.fromEntries(url.searchParams)));
        if (url.pathname.endsWith("/history")) return json({ actions: monitor.detections.history(url.pathname.split("/").at(-2)) });
        if (request.method() === "PATCH") return json({ detection: monitor.detections.update(url.pathname.split("/").at(-1), request.postDataJSON(), "fixture-admin") });
        return json({});
      });
      await page.goto(origin);
      const row = page.locator(".status-detection-row"); await row.waitFor();
      await row.getByRole("button", { name: "Fausse alerte", exact: true }).click();
      const dialog = page.getByRole("dialog"); await dialog.getByLabel("Justificatif de la fausse alerte", { exact: true }).fill("Pages SQLite réutilisables : aucune panne, contrôle d’intégrité OK.");
      await page.screenshot({ path: path.join(directory, `${viewport.width}-confirm.png`) });
      await dialog.getByRole("button", { name: "Confirmer la fausse alerte", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByLabel("État du suivi", { exact: true }).selectOption("false_positive");
      await row.waitFor(); assert.equal(await row.locator(".status-detection-state.is-recovered").textContent(), "Fausse alerte");
      assert.equal(monitor.payload(7).components.find(component => component.id === "database").status, "operational");
      assert.equal(monitor.detections.history(monitor.detections.list({ state: "all" }).rows[0].id)[0].created_by, "fixture-admin");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(directory, `${viewport.width}-corrected.png`) });
    } catch (error) {
      await page.screenshot({ path: path.join(directory, `${viewport.width}-failure.png`) });
      console.error(JSON.stringify({ errors, text: (await page.locator("body").innerText()).slice(0, 3000), output: output.slice(-2000) })); throw error;
    } finally { await context.close(); monitor.close(); }
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: true, directory }));
} finally {
  await browser?.close();
  if (server.exitCode === null) { const ended = new Promise(resolve => server.once("exit", resolve)); server.kill(); await ended; }
}
