import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defaultMidnightContracts, normalizeMidnightContracts } from "../src/features/games/midnightDice/contracts.js";
import { createGameState, applyAction } from "../../server/src/games/engines.js";

const root = fileURLToPath(new URL("../../", import.meta.url)), external = createRequire(path.join(process.env.KTGA_BROWSER_TOOLS, "package.json"));
const { chromium } = external("playwright"), { PlaywrightBlocker } = external("@ghostery/adblocker-playwright");
const listener = http.createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port; await new Promise(resolve => listener.close(resolve)); const origin = `http://127.0.0.1:${port}`;
const directory = path.join(root, "docs/previews/midnight-contracts-20261104", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, stdio: "pipe", env: { ...process.env, VITE_BASE_PATH: "/", VITE_API_URL: origin } });
let output = "", browser, saves = 0, game = { id: "midnight-dice", name: "Dés de Minuit", type: "dice", description: "Choisir des dés et réussir son mandat secret.", position: 1, enabled: true, minPlayers: 2, maxPlayers: 8, midnightContracts: structuredClone(defaultMidnightContracts), defaultModifiers: { rounds: 5, marketExtra: 2, discardsPerRound: 1, individualContracts: true, uniqueContracts: true } }, state;
const errors = []; vite.stdout.on("data", data => output += data); vite.stderr.on("data", data => output += data);
function html() { return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import '/src/styles.css';import '/src/navigation/casino.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{GameEditor}=await import('/src/components/admin/GameEditor.jsx'),{MidnightDiceBoard}=await import('/src/components/game/GameBoards.jsx'),{api}=await import('/src/api.js');
const h=React.createElement,initial=${JSON.stringify(game).replaceAll("<", "\\u003c")};
function Fixture(){const [draft,setDraft]=React.useState(initial),[view,setView]=React.useState('editor'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[state,setState]=React.useState(null);window.draft=draft;
async function save(){setBusy(true);setError('');try{await api('/api/admin/games/midnight-dice',{method:'PATCH',body:JSON.stringify(draft)});window.saved=true;}catch(e){setError(e.message)}finally{setBusy(false)}}
async function board(){setState(await api('/api/preview-midnight'));setView('board')}
return h(LocaleProvider,null,h('main',{className:'app-shell'},h('button',{onClick:board},'Voir la table'),view==='editor'&&h(GameEditor,{game:draft,games:[initial],saving:busy,error,onChange:(key,value)=>setDraft(current=>({...current,[key]:value})),onSave:save,onClose:()=>setView('closed'),onEditImage:()=>{}}),view==='board'&&state&&h(MidnightDiceBoard,{state,user:{id:'me'},onAction:async action=>setState(await api('/api/preview-midnight',{method:'POST',body:JSON.stringify(action)}))})));}
ReactDOM.createRoot(document.getElementById('root')).render(h(Fixture));window.ready=true;
</script></body></html>`; }
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (i === 149) throw Error(output); await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader", "--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets"] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }); page.on("pageerror", error => errors.push(error.message));
  await PlaywrightBlocker.deserialize(fs.readFileSync(process.env.KTGA_BLOCKER_CACHE)).enableBlockingInPage(page);
  await page.route("**/__midnight", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: html() }));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname === "/api/admin/games/midnight-dice" && method === "PATCH") {
      try { const next = route.request().postDataJSON(); const midnightContracts = normalizeMidnightContracts(next.midnightContracts); game = { ...next, midnightContracts }; saves++; return route.fulfill({ json: { ok: true } }); }
      catch (error) { return route.fulfill({ status: 400, json: { error: error.message } }); }
    }
    if (url.pathname === "/api/preview-midnight") {
      if (method === "GET") {
        state = createGameState("midnight-dice", [{ id: "me", pseudo: "Bnmkt" }, { id: "other", pseudo: "Camille" }], { midnightContracts: game.midnightContracts, gameModifiers: { individualContracts: false } });
        state.contractOffers = game.midnightContracts.slice(-4).map(entry => entry.id);
      } else {
        applyAction(state, "me", route.request().postDataJSON());
        if (state.phase === "contract") applyAction(state, "other", { type: "choose-contract", contract: state.contractOffers[1] });
      }
      const visible = structuredClone(state); visible.secretContracts.other = null; return route.fulfill({ json: visible });
    }
    return route.fulfill({ json: { messages: {} } });
  });
  await page.goto(origin + "/__midnight"); await page.getByRole("tab", { name: "Règles", exact: true }).click(); await page.locator(".midnight-config").waitFor();
  assert.equal(await page.locator(".midnight-config-list > button").count(), 12);
  async function add(label, type, tier) {
    await page.getByRole("button", { name: "Créer un mandat", exact: true }).click(); await page.getByLabel("Nom du mandat", { exact: true }).fill(label);
    await page.getByLabel("Type de condition", { exact: true }).selectOption(type); await page.getByLabel("Palier du mandat", { exact: true }).selectOption(tier);
  }
  async function dice(values) { for (let i = 0; i < 3; i++) await page.getByLabel(`Dé test ${i + 1}`, { exact: true }).selectOption(String(values[i])); }
  const status = page.locator(".midnight-config-preview [role=status]");
  await add("421 chronologique", "ordered", "gold"); await dice([4, 2, 1]); assert.match(await status.textContent(), /Mandat réussi.*7 \+ 45 = 52/);
  await dice([1, 2, 4]); assert.match(await status.textContent(), /Mandat non réalisé.*7 \+ 0 = 7/);
  await add("421 libre", "unordered", "silver"); await dice([1, 2, 4]); assert.match(await status.textContent(), /Mandat réussi.*30/);
  await add("Somme 9 à 12", "sum", "platinum"); await page.getByLabel("Comparaison de la somme", { exact: true }).selectOption("between");
  await page.getByLabel("Somme cible ou minimum", { exact: true }).fill("9"); await page.getByLabel("Somme maximum", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click(); assert.equal(saves, 0);
  await page.getByLabel("Somme maximum", { exact: true }).fill("12"); await dice([3, 3, 3]); assert.match(await status.textContent(), /Mandat réussi.*65/);
  await dice([6, 6, 6]); assert.match(await status.textContent(), /Mandat non réalisé/);
  await add("Deux font le troisième", "special", "diamond");
  for (const values of [[2, 4, 2], [5, 2, 3], [1, 2, 3]]) { await dice(values); assert.match(await status.textContent(), /Mandat réussi.*100/); }
  await page.locator(".midnight-config-preview .dice-throw-tray").scrollIntoViewIfNeeded();
  await page.locator(".midnight-config-preview .dice-solid-scene canvas").first().waitFor();
  await page.screenshot({ path: path.join(directory, "condition-speciale-desktop.png"), fullPage: true });
  await page.locator(".midnight-config-list > button").filter({ hasText: /^Duo/ }).click();
  await page.getByLabel("Nom du mandat", { exact: true }).fill("Duo admin"); await page.getByLabel("Palier du mandat", { exact: true }).selectOption("gold");
  await page.locator(".midnight-config-list > button").filter({ hasText: /^Cave/ }).click();
  await page.getByRole("button", { name: "Supprimer le mandat", exact: true }).click(); await page.getByRole("button", { name: "Annuler", exact: true }).last().click();
  assert.equal(await page.locator(".midnight-config-list > button").count(), 16);
  await page.getByRole("button", { name: "Supprimer le mandat", exact: true }).click(); await page.getByRole("dialog", { name: "Supprimer ce mandat ?", exact: true }).getByRole("button", { name: "Supprimer le mandat", exact: true }).click();
  assert.equal(await page.locator(".midnight-config-list > button").count(), 15);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click(); await page.waitForFunction(() => window.saved); assert.equal(saves, 1);
  assert.equal(game.midnightContracts.find(entry => entry.id === "duo").tier, "gold"); assert.ok(!game.midnightContracts.some(entry => entry.id === "cellar"));
  await page.reload(); await page.getByRole("tab", { name: "Règles", exact: true }).click(); assert.equal(await page.locator(".midnight-config-list > button").count(), 15);
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator(".midnight-config").scrollIntoViewIfNeeded();
  assert.equal(await page.locator(".midnight-config").isVisible(), true); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(directory, "mandats-mobile.png"), fullPage: true });
  await page.getByLabel("Nom du mandat", { exact: true }).fill("Modification annulée"); await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(game.midnightContracts[0].label, "Spectre");
  await page.setViewportSize({ width: 1366, height: 768 }); await page.getByRole("button", { name: "Voir la table", exact: true }).click();
  await page.getByRole("dialog", { name: "Choisis ton mandat", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Choisir", exact: true }).count(), 4);
  await page.locator(".midnight-codex-panel article").filter({ hasText: "421 chronologique" }).getByRole("button", { name: "Choisir", exact: true }).click(); await page.locator(".midnight-market").waitFor();
  assert.match(await page.locator(".midnight-current-contract").textContent(), /421 chronologique/);
  await page.getByRole("button", { name: "Voir les 15 mandats", exact: true }).click();
  await page.getByRole("dialog", { name: "Codex des mandats", exact: true }).waitFor();
  assert.match(await page.locator(".midnight-codex-panel").textContent(), /Deux font le troisième/); assert.equal(await page.locator(".midnight-codex-panel article").count(), 15);
  await page.screenshot({ path: path.join(directory, "codex-personnalise.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, directory, saves, catalogue: game.midnightContracts.length, blocker: true, customTable: true, predicates: ["ordered", "unordered", "sum", "sum-two"] }));
} finally { await browser?.close(); if (vite.exitCode === null) { const exited = new Promise(resolve => vite.once("exit", resolve)); vite.kill(); await exited; } }
