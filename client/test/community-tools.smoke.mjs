// Real UI + Socket.IO smoke check. Point KTGA_BROWSER_TOOLS to installed Playwright/Ghostery packages.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
const external = createRequire(path.join(process.env.KTGA_BROWSER_TOOLS, "package.json"));
const { chromium } = external("playwright");
const { PlaywrightBlocker } = external("@ghostery/adblocker-playwright");
const { Server } = createRequire(new URL("../../server/package.json", import.meta.url))("socket.io");
const network = http.createServer();
const sockets = new Server(network, { cors: { origin: true, credentials: true } });
await new Promise(resolve => network.listen(0, "127.0.0.1", resolve));
const socketOrigin = `http://127.0.0.1:${network.address().port}`;
const available = http.createServer();
await new Promise(resolve => available.listen(0, "127.0.0.1", resolve));
const port = available.address().port;
await new Promise(resolve => available.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const directory = path.join(root, "docs/previews/community-tools-20261030", String(Date.now()));
fs.mkdirSync(directory, { recursive: true });
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: path.join(root, "client"), windowsHide: true, stdio: "pipe",
  env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: origin, VITE_SOCKET_URL: socketOrigin, VITE_SOCKET_PATH: "/socket.io" }
});
let output = "";
child.stdout.on("data", value => output += value); child.stderr.on("data", value => output += value);
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import '/src/styles.css';import '/src/navigation/casino.css';import '/src/components/social/social.css';import '/src/features/bugs/bugs.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{SocialPanel}=await import('/src/components/social/SocialPanel.jsx'),{BugReportForm}=await import('/src/features/bugs/BugReportForm.jsx');
const h=React.createElement,user={id:'tester',pseudo:'Tester',admin:!location.search.includes('player'),cosmetics:{},profile:{}};
function Fixture(){const [bug,setBug]=React.useState(false);return h(LocaleProvider,null,h('main',{className:'app-shell'},h('h1',null,'Outils de communauté'),h('button',{onClick:()=>setBug(true)},'Ouvrir le formulaire'),h(SocialPanel,{user,open:true,onClose:()=>{},onFriends:()=>{},onUnreadChange:()=>{}}),h(BugReportForm,{user,open:bug,detectedContext:{page:'/',zone:'casino'},onClose:()=>setBug(false),onFollow:(event,id)=>{event.preventDefault();window.followed=id;}})));}
ReactDOM.createRoot(document.getElementById('root')).render(h(Fixture));window.ready=true;
</script></body></html>`;
let revision = 0, deletes = 0, submissions = 0, delayedGet, delayedSend, holdGet = false, holdSend = false;
const message = (id, rev = revision) => ({ id, channelType: "global", channelId: "global", senderId: "tester", sender: { id: "tester", pseudo: "Tester" }, content: id, revision: rev, createdAt: new Date().toISOString() });
let rows = [message("Message avant purge")];
const snapshot = () => ({ channel: { type: "global", id: "global" }, revision, messages: [...rows], readAt: new Date().toISOString() });
let browser;
const errors = [];
const networkErrors = [];
try {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (i === 149) throw Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // The intercepted fixture document is classified as public by recent Chrome builds.
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets"] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const admin = await context.newPage(), player = await context.newPage();
  for (const page of [admin, player]) {
    page.on("pageerror", error => errors.push(error.message));
    page.on("requestfailed", request => networkErrors.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on("console", entry => { if (entry.type() === "error") networkErrors.push(entry.text()); });
    const blocker = PlaywrightBlocker.deserialize(fs.readFileSync(process.env.KTGA_BLOCKER_CACHE));
    await blocker.enableBlockingInPage(page);
    await page.route("**/__community*", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      const reply = (json, status = 200) => route.fulfill({ status, json });
      if (url.pathname === "/api/admin/chat/global") {
        assert.equal(method, "DELETE"); assert.equal(route.request().postDataJSON().confirm, true);
        deletes++; const removed = rows.length; rows = []; revision++;
        const reset = { channelType: "global", channelId: "global", removed, revision, clearedAt: new Date().toISOString() };
        sockets.emit("chat-reset", reset); return reply(reset);
      }
      if (url.pathname === "/api/chat/messages" && method === "GET") {
        const payload = snapshot();
        if (page === admin && holdGet) { holdGet = false; delayedGet = () => reply(payload); return; }
        return reply(payload);
      }
      if (url.pathname === "/api/chat/messages" && method === "POST") {
        const payload = message("Réponse d'envoi antérieure");
        if (holdSend) { holdSend = false; delayedSend = () => reply(payload, 201); return; }
        return reply(payload, 201);
      }
      if (url.pathname === "/api/bugs/metadata") return reply({ categories: { interface: "Interface" }, frequencies: { intermittent: "Parfois" }, impacts: { minor: "Mineur" } });
      if (url.pathname === "/api/bugs" && method === "POST") {
        submissions++;
        await new Promise(resolve => setTimeout(resolve, 150));
        return submissions === 1 ? reply({ error: "Patiente avant un nouvel envoi.", code: "BUG_INTAKE_LIMIT", retryAfter: 2 }, 429) : reply({ error: "Signalement déjà reçu.", code: "BUG_INTAKE_DUPLICATE", bugId: 42 }, 409);
      }
      return reply({ messages: {}, friends: [], channels: [] });
    });
  }
  await admin.goto(origin + "/__community"); await player.goto(origin + "/__community?player");
  await admin.getByText("Message avant purge", { exact: true }).waitFor();
  await player.getByText("Message avant purge", { exact: true }).waitFor();
  await admin.waitForFunction(() => document.querySelector(".conversation-global-tools")?.getBoundingClientRect().height > 0);
  assert.equal(await player.getByRole("button", { name: "Purger le chat global", exact: true }).count(), 0);
  for (let i = 0; sockets.engine.clientsCount < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(sockets.engine.clientsCount, 2, JSON.stringify({networkErrors,config:await admin.evaluate(async () => { const api = await import('/src/api.js'); return { socket: api.SOCKET_URL, path: api.SOCKET_PATH }; })}));
  const purge = admin.getByRole("button", { name: "Purger le chat global", exact: true });
  await purge.click(); await admin.getByRole("button", { name: "Annuler", exact: true }).click(); assert.equal(deletes, 0);
  holdGet = true; await admin.evaluate(() => window.dispatchEvent(new Event("focus")));
  await admin.waitForTimeout(100); assert.ok(delayedGet);
  holdSend = true; await admin.getByRole("textbox", { name: "Message", exact: true }).fill("Envoi retardé");
  await admin.getByRole("button", { name: "Envoyer", exact: true }).click();
  await admin.waitForTimeout(100); assert.ok(delayedSend);
  await purge.click(); await admin.getByRole("button", { name: "Purger", exact: true }).click();
  await admin.getByText("Le chat global a été purgé.", { exact: true }).waitFor();
  await player.getByText("Aucun message dans ce canal.", { exact: true }).waitFor();
  const fresh = message("Nouveau message après purge"); rows.push(fresh); sockets.emit("chat-message", fresh);
  await player.getByText(fresh.content, { exact: true }).waitFor();
  await delayedGet(); await delayedSend();
  await admin.getByText(fresh.content, { exact: true }).waitFor();
  assert.equal(await admin.getByText("Message avant purge", { exact: true }).count(), 0);
  assert.equal(await admin.getByText("Réponse d'envoi antérieure", { exact: true }).count(), 0);
  assert.equal(deletes, 1);
  await admin.screenshot({ path: path.join(directory, "chat-global-desktop.png"), fullPage: true });
  await admin.getByRole("button", { name: "Ouvrir le formulaire", exact: true }).click();
  await admin.getByRole("textbox", { name: "Titre", exact: true }).fill("Bouton de test bloqué");
  await admin.getByRole("textbox", { name: "Description", exact: true }).fill("Le bouton ne répond plus après la sélection du jeu.");
  await admin.evaluate(() => { const form = document.querySelector(".issue-form"); form.requestSubmit(); form.requestSubmit(); });
  const retry = admin.getByRole("button", { name: /Réessaie dans/ }); await retry.waitFor();
  assert.equal(await retry.isDisabled(), true); assert.equal(submissions, 1);
  assert.equal(await admin.getByRole("textbox", { name: "Titre", exact: true }).inputValue(), "Bouton de test bloqué");
  await admin.screenshot({ path: path.join(directory, "bug-rate-limit.png"), fullPage: true });
  const send = admin.getByRole("button", { name: "Envoyer le signalement", exact: true }); await send.waitFor();
  await send.click(); await admin.getByRole("button", { name: "Ouvrir le signalement existant" }).click();
  assert.equal(await admin.evaluate(() => window.followed), 42); assert.equal(submissions, 2);
  await admin.setViewportSize({ width: 390, height: 844 });
  assert.equal(await admin.locator(".conversation-global-tools").isVisible(), true);
  await admin.screenshot({ path: path.join(directory, "bug-duplicate-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, directory, blockerEnabled: true, socketReset: true, staleResponsesRejected: true, confirmation: true, adminOnly: true, draftPreserved: true, duplicateFollowup: true }));
} finally {
  await browser?.close(); await new Promise(resolve => sockets.close(resolve));
  if (child.exitCode === null) { const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited; }
}
