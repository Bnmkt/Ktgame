import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGameState, applyAction } from "../../server/src/games/engines.js";
import { games } from "../../server/src/games/shared.js";
import { midnightContractOffers } from "../../server/src/games/engines/midnight-dice.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dependencyRoot = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencyRoot, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencyRoot, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory = path.join(root, "docs/previews/mobile-casino-20261014", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "client"), windowsHide: true, env: { ...process.env, VITE_API_URL: origin, VITE_BASE_PATH: "/" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "", browser, room, sequence = 0;
const errors = [], checks = [];
child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
const players = [{ id: "self", pseudo: "BnmktAvecUnPseudoTresLong", tokens: 20300123, admin: true, cosmetics: { equipped: { icon: "chip", nameEffect: "gold" } }, profile: {}, gameTitle: { title: "Ultimate Yahtzee IV" } },
  { id: "other", pseudo: "Partenaire", tokens: 10000, cosmetics: { equipped: { icon: "dice" } } }, { id: "third", pseudo: "Un pseudo particulièrement long", tokens: 10000 }, { id: "fourth", pseudo: "Joueur quatre", tokens: 10000 }];
function fixture(game, waiting = false) {
  const seats = players.slice(0, game.id === "belote" ? 4 : Math.min(3, game.maxPlayers));
  const state = waiting ? null : createGameState(game.id, seats, { buyIn: 1000, bigBlind: 100, turnDurationMs: 300000 });
  if (state && ["yahtzee", "421", "cul-de-chouette", "farkle", "shut-the-box"].includes(game.id)) applyAction(state, "self", { type: "roll", keepIndexes: [] });
  if (state?.gameId === "midnight-dice") state.contractOffers = midnightContractOffers(state, "self");
  return { id: `fixture-${++sequence}`, activityMatchId: `match-${sequence}`, code: "123456", name: `${game.name} de Bnmkt`, gameId: game.id, ownerId: "self", players: seats, state, stake: 1000, readyPlayerIds: seats.map(row => row.id), minPlayers: game.minPlayers, maxPlayers: game.maxPlayers, minLevel: 1, maxLevel: null, gameModifiers: state?.modifiers ?? {}, pokerBlinds: { bigBlind: 100, smallBlind: 50, maximumBet: 1000 } };
}
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {Coins,Users,Shield} from '/node_modules/.vite/deps/lucide-react.js';
import '/src/styles.css';import '/src/navigation/casino.css';import '/src/navigation/mobile-casino.css';import '/src/features/bugs/bugs.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{CasinoHeader}=await import('/src/components/navigation/CasinoHeader.jsx'),{Room}=await import('/src/pages/RoomPage.jsx');
const {DailyBonusButton}=await import('/src/components/navigation/DailyBonusButton.jsx'),{DisplayName}=await import('/src/components/cosmetics/Cosmetics.jsx'),{NotificationCenter}=await import('/src/components/feedback/Feedback.jsx'),{CompactNumber}=await import('/src/utils/presentation.jsx');
const h=React.createElement,root=ReactDOM.createRoot(document.getElementById('root'));
function Demo({room,user}){const[notifications,setNotifications]=React.useState(false);return h(LocaleProvider,null,h(CasinoHeader,{user,siteName:'KTGA.ME',siteIcon:'chip',view:'room',roomCode:'123456',eventSlug:'communaute',tribunalAvailable:true,onNavigate:view=>window.lastNavigate=view,onLogout:()=>window.loggedOut=true},
h('div',{className:'casino-wallet'},h(CompactNumber,{value:user.tokens}),h(Coins,{size:18})),
h(DailyBonusButton,{user,settings:{dailyTokens:1000},setUser:()=>{},onFeedback:()=>{}}),
h('div',{className:'identity-pill'},h(DisplayName,{user}),h('a',{href:'/admin',className:'casino-management-link','aria-label':'Administration'},h(Shield,{size:18}))),
!user.guest&&h('button',{className:'secondary icon-toggle conversation-toggle','aria-label':'Ouvrir Social'},h(Users,{size:18})),
!user.guest&&h(NotificationCenter,{items:[],open:notifications,onToggle:()=>setNotifications(!notifications),onDelete:()=>{},onClear:()=>{}})),
h(Room,{key:room.id,code:room.code,user,setUser:()=>{},onBack:()=>{},onExcluded:()=>{}}),h('button',{className:'issue-launcher','aria-label':'Signaler un bug'},'?'))}
window.renderRoom=(room,guest=false)=>root.render(h(Demo,{key:room.id,room,user:{...room.players[0],guest}}));window.ready=true;
</script></body></html>`;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); if (i === 199) throw new Error(output); }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 740, height: 390 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage();
    await blocker.enableBlockingInPage(page); page.on("pageerror", error => errors.push(error.message));
    await page.route("**/__mobile", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.route("**/api/**", route => { const key = new URL(route.request().url()).pathname;
      if (key === "/api/rooms/123456/action") { const body = route.request().postDataJSON(); applyAction(room.state, "self", body); }
      const value = key.startsWith("/api/rooms/123456") ? room : key === "/api/friends" ? { friends: [] } : { messages: {} };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(value) }); });
    await page.goto(`${origin}/__mobile`, { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => window.ready, undefined, { timeout: 60000 }).catch(error => {throw new Error(`${error.message}\n${JSON.stringify(errors)}\n${output.slice(-1600)}`);});
    room = fixture(games.find(game => game.id === "yahtzee"), true); await page.evaluate(value => window.renderRoom(value), room); await page.locator('.table-status-card').waitFor();
    const compact = viewport.width <= 760;
    assert.equal(await page.locator('.casino-mobile-navigation').isVisible(), compact);
    async function noOverflow(label) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) { const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => {const box=node.getBoundingClientRect();return box.width>0&&box.right>innerWidth+1}).slice(0,12).map(node=>({tag:node.tagName,class:node.className,width:node.getBoundingClientRect().width}))); throw new Error(`${label}: ${JSON.stringify(offenders)}`); }
    }
    await noOverflow(`waiting-${viewport.width}`);
    if (compact) {
      assert.equal(await page.locator('.room-setup-summary').isVisible(), true);
      assert.ok((await page.locator('.casino-header').boundingBox()).height < 150);
      const dock = await page.locator('.casino-mobile-navigation').boundingBox(); assert.ok(dock.y >= viewport.height - 85);
      const launcher = await page.locator('.issue-launcher').boundingBox(); assert.ok(launcher.y + launcher.height <= dock.y);
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      const menu = page.getByRole('dialog', { name: 'Menu du casino' }); await menu.waitFor();
      await menu.getByRole('link', { name: 'Ma table', exact: true }).click(); assert.equal(await page.evaluate(() => window.lastNavigate), 'room');
      await page.locator('.room-setup-summary').getByRole('button', { name: 'Modifier', exact: true }).click(); await page.locator('.room-settings-modal').waitFor();
      await page.locator('.room-settings-modal').getByRole('button', { name: 'Annuler', exact: true }).click();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(directory, `waiting-${viewport.width}.png`) });
    const selectedGames = viewport.width === 320 ? games : games.filter(game => ['yahtzee','texas-holdem','midnight-dice','belote'].includes(game.id));
    for (const game of selectedGames) {
      room = fixture(game); await page.evaluate(value => window.renderRoom(value), room); await page.locator('.board').waitFor(); await page.waitForTimeout(850);
      const contracts = page.locator('.midnight-contract-dialog');
      if (await contracts.count()) await contracts.getByRole('button', { name: 'Choisir', exact: true }).first().click();
      await noOverflow(`${game.id}-${viewport.width}`);
      if (compact) {
        assert.equal(await page.locator('.layout > section > .table-status-card').count(), 0);
        await page.getByRole('toolbar').getByRole('button', { name: 'Scores', exact: true }).click();
        const scores = page.getByRole('dialog', { name: 'Scores', exact: true }); await scores.waitFor(); await noOverflow(`scores-${game.id}-${viewport.width}`);
        await scores.getByRole('button', { name: 'Fermer', exact: true }).click();
        await page.getByRole('toolbar').getByRole('button', { name: 'Table', exact: true }).click();
        const table = page.getByRole('dialog', { name: 'Informations de la table' }); await table.waitFor();
        assert.equal(await table.getByRole('button', { name: 'Fermer la table', exact: true }).count(), 1);
        await table.getByRole('button', { name: 'Fermer', exact: true }).click();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      if (['yahtzee','texas-holdem','midnight-dice','belote'].includes(game.id)) await page.screenshot({ path: path.join(directory, `${game.id}-${viewport.width}.png`) });
      if (compact && ['texas-holdem','midnight-dice'].includes(game.id)) {
        await page.getByRole('button', { name: 'Plein écran', exact: true }).click(); await noOverflow(`fullscreen-${game.id}-${viewport.width}`);
        await page.getByRole('toolbar').getByRole('button', { name: 'Scores', exact: true }).click(); const panel = page.getByRole('dialog', { name: 'Scores', exact: true }); await panel.waitFor();
        assert.equal(await panel.evaluate(node => !!node.closest(':fullscreen')), true); await panel.getByRole('button', { name: 'Fermer', exact: true }).click(); await page.evaluate(() => document.exitFullscreen());
      }
      checks.push({ gameId: game.id, width: viewport.width });
    }
    if (compact) {
      await page.getByRole('button', { name: 'Plein écran', exact: true }).click(); await page.getByRole('toolbar').getByRole('button', { name: 'Scores', exact: true }).click();
      const scores = page.getByRole('dialog', { name: 'Scores', exact: true }); assert.equal(await scores.evaluate(node => !!node.closest(':fullscreen')), true);
      await scores.getByRole('button', { name: 'Fermer', exact: true }).click(); await page.evaluate(() => document.exitFullscreen());
      room = fixture(games.find(game => game.id === 'yahtzee'), true); await page.evaluate(value => window.renderRoom(value, true), room); await page.locator('.table-status-card').waitFor(); await noOverflow(`guest-${viewport.width}`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []); fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ ok: true, checks, errors }, null, 2)); console.log(JSON.stringify({ ok: true, checks: checks.length, directory }));
} finally { await browser?.close(); if (child.exitCode === null) {const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit;} }
