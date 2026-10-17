import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { games } from "../../server/src/games/shared.js";
import { applyAction, createGameState } from "../../server/src/games/engines.js";
import { defaultPublicSettings } from "../src/config/site.js";

const root = fileURLToPath(new URL("../../", import.meta.url)), dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const dist = path.join(root, "client/dist"), directory = path.join(root, "docs/previews/discord-app-20261017", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
const origin = "https://123456789012345678.discordsays.com", errors = [], results = [];
const user = { id: "fixture", pseudo: "ActivityPlayer", tokens: 10000, active: true, guest: false, profile: { displayName: "ActivityPlayer", birthDate: "1990-01-01", favoriteGames: ["yahtzee"], locale: "fr" }, cosmetics: { equipped: {} }, achievements: { unlocked: [], suppressed: [], unlockedAt: {} }, gameProgression: [], friendCount: 0, mfa: {}, dailyBonus: { nextReward: 1000, multiplier: 1, nextMultiplier: 1.1, streak: 0 } };
const parentHtml = `<!doctype html><html><body style="margin:0"><script>
window.commands=[];window.addEventListener('message',event=>{
 if(event.origin!=='${origin}'||!Array.isArray(event.data))return;
 const[opcode,payload]=event.data;
 if(opcode===0)event.source.postMessage([1,{cmd:'DISPATCH',evt:'READY',nonce:null,data:{v:1,config:{api_endpoint:'//discord.com/api',environment:'production'}}}],event.origin);
 if(opcode===1){window.commands.push(payload);const data=payload.cmd==='AUTHORIZE'?{code:'fixture-authorization-code'}:payload.cmd==='OPEN_EXTERNAL_LINK'?{opened:true}:{};event.source.postMessage([1,{cmd:payload.cmd,evt:null,nonce:payload.nonce,data}],event.origin);}
});
</script><iframe title="KTGA Activity" style="display:block;border:0;width:100vw;height:100dvh" src="${origin}/?frame_id=fixture-frame&instance_id=fixture-instance&platform=desktop" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe></body></html>`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for (const scenario of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 900, height: 800, unlinked: true }]) {
    const { width, height, unlinked = false } = scenario, viewport = { width, height };
    const context = await browser.newContext({ viewport }), page = await context.newPage(), requests = [];
    let associated = !unlinked;
    const table = { id: "fixture-room", code: "ABC123", name: "Yahtzee entre amis", gameId: "yahtzee", ownerId: user.id, players: [user, { id: "bot", pseudo: "Bot 1", isBot: true, tokens: 10000, cosmetics: { equipped: {} } }], readyPlayerIds: [user.id], minPlayers: 1, maxPlayers: 6, stake: 10, gameModifiers: {}, state: null, finished: false };
    await context.addInitScript(() => {
      window.ktgaFixtureNotes = [];
      window.ktgaFixtureSamples = [];
      const proto = window.AudioContext?.prototype;
      if (!proto) return;
      const create = proto.createOscillator;
      proto.createOscillator = function(...args) {
        const node = create.apply(this, args), start = node.start.bind(node);
        node.start = (...values) => { window.ktgaFixtureNotes.push(node.frequency.value); return start(...values); };
        return node;
      };
      const bufferSource = proto.createBufferSource;
      proto.createBufferSource = function(...args) {
        const node = bufferSource.apply(this, args), start = node.start.bind(node), stop = node.stop.bind(node);
        let record;
        node.start = (...values) => { record = { loop: node.loop, duration: node.buffer?.duration, offset: values[1] ?? 0, stopped: false }; window.ktgaFixtureSamples.push(record); return start(...values); };
        node.stop = (...values) => { if (record) record.stopped = true; return stop(...values); };
        return node;
      };
    });
    page.on("pageerror", error => errors.push(error.message)); await blocker.enableBlockingInPage(page);
    await page.route("https://discord.com/ktga-fixture", route => route.fulfill({ contentType: "text/html", body: parentHtml }));
    await page.route(`${origin}/**`, async route => {
      const request = route.request(), url = new URL(request.url()); requests.push({ path: url.pathname, authorization: request.headers().authorization ?? "", method: request.method() });
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/discord/activity/config") return json({ available: true, clientId: "123456789012345678", websiteUrl: "https://www.ktga.me" });
      if (url.pathname === "/api/auth/discord/activity") { assert.deepEqual(request.postDataJSON(), { code: "fixture-authorization-code" }); return associated ? json({ token: "fixture-token-in-memory", user }) : json({ code: "DISCORD_NOT_LINKED", error: "Ce Discord n’est pas encore associé." }, 404); }
      if (url.pathname === "/api/config") return json({ ...defaultPublicSettings, discordLoginEnabled: true, discordLoginAvailable: true });
      if (url.pathname === "/api/games") return json(games.map((game, index) => ({ ...game, description: "Une partie entre amis.", position: index + 1, enabled: true, entryPot: 10, coverImage: "", descriptiveImage: "", discordIconImage: "" })));
      if (["/api/shop", "/api/rooms", "/api/notifications"].includes(url.pathname)) return json([]);
      if (url.pathname === "/api/rooms/ABC123") return json(table);
      if (url.pathname === "/api/rooms/ABC123/start") { table.state = createGameState("yahtzee", table.players); table.activityMatchId = "fixture-match"; return json(table); }
      if (url.pathname === "/api/rooms/ABC123/action") {
        table.state = applyAction(table.state, user.id, request.postDataJSON());
        table.pacing = { id: "fixture-pacing", kind: "turn-end", actorId: user.id, startedAt: Date.now(), endsAt: Date.now() + 1100 };
        return json(table);
      }
      if (url.pathname === "/api/me") return request.headers().authorization === "Bearer fixture-token-in-memory" ? json(user) : json({ error: "Session absente" }, 401);
      if (url.pathname === "/api/community-events/carousel") return json({ events: [], focusIndex: 0 });
      if (url.pathname === "/api/friends") return json({ friends: [], requests: [] });
      if (url.pathname === "/api/me/help") return json({ showOnboarding: false });
      if (url.pathname === "/api/ranked") return json({ games: [], queue: null, proposal: null });
      if (url.pathname.startsWith("/api/locales/")) return json({ messages: {} });
      if (url.pathname.startsWith("/api/")) return json({ available: false, channels: [], messages: [], unread: 0 });
      if (url.pathname.startsWith("/socket.io/")) return json({ error: "Mock transport" }, 400);
      let filename = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (filename !== dist && !filename.startsWith(dist + path.sep)) return route.abort();
      if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = path.join(dist, "discord-activity/index.html");
      const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
      return route.fulfill({ contentType: types[path.extname(filename)] ?? "application/octet-stream", body: fs.readFileSync(filename) });
    });
    await page.goto("https://discord.com/ktga-fixture"); const frame = page.frameLocator('iframe[title="KTGA Activity"]');
    if (unlinked) {
      await frame.getByRole("button", { name: "Tout refuser", exact: true }).click();
      await frame.getByRole("button", { name: "Se connecter avec Discord", exact: true }).waitFor();
      assert.equal(await frame.getByLabel("Adresse email", { exact: true }).count(), 0);
      await frame.getByRole("button", { name: "Autre méthode de connexion", exact: true }).click();
      await frame.getByLabel("Adresse email", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(directory, "unlinked-signin.png") });
      associated = true;
      await frame.getByRole("button", { name: "Se connecter avec Discord", exact: true }).click();
    }
    await frame.locator(".casino-header").waitFor();
    if (!unlinked) {
      assert.equal(requests.some(request => request.path === "/audio/lounge-loop.mp3"), false, "music waits for the first interaction");
      await frame.getByRole("button", { name: "Tout refuser", exact: true }).click();
    }
    assert.equal(await frame.locator(".casino-mobile-navigation").isVisible(), true);
    assert.equal(await frame.locator(".casino-navigation").isVisible(), false);
    await frame.getByRole("button", { name: "Ouvrir dans le navigateur", exact: true }).click();
    await page.waitForFunction(() => window.commands.some(command => command.cmd === "OPEN_EXTERNAL_LINK"));
    assert.equal((await page.evaluate(() => window.commands.find(command => command.cmd === "OPEN_EXTERNAL_LINK"))).args.url, "https://www.ktga.me/");
    await frame.locator(".casino-header").waitFor(); assert.equal(await frame.locator(".activity-toolbar").isVisible(), true);
    assert.equal(requests.filter(request => request.path === "/api/auth/discord/activity").length, unlinked ? 2 : 1);
    await frame.getByRole("button", { name: "Réglages audio", exact: true }).click();
    const mixer = frame.getByRole("dialog", { name: "Audio", exact: true });
    assert.equal(await mixer.getByRole("slider").count(), 3);
    await page.screenshot({ path: path.join(directory, `${viewport.width}-audio.png`) });
    const activityFrame = page.frames().find(frame => frame.url().startsWith(origin));
    await activityFrame.waitForFunction(() => window.ktgaFixtureSamples.some(sample => sample.loop));
    await mixer.getByRole("slider", { name: /Musique/ }).press("Home");
    assert.ok(await activityFrame.evaluate(() => window.ktgaFixtureSamples.filter(sample => sample.loop).every(sample => sample.stopped)));
    await mixer.getByRole("button", { name: "Rétablir les volumes", exact: true }).click();
    await activityFrame.waitForFunction(() => window.ktgaFixtureSamples.some(sample => sample.loop && !sample.stopped));
    await activityFrame.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    assert.ok(await activityFrame.evaluate(() => window.ktgaFixtureSamples.filter(sample => sample.loop).every(sample => sample.stopped)));
    await activityFrame.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await activityFrame.waitForFunction(() => window.ktgaFixtureSamples.some(sample => sample.loop && !sample.stopped));
    await mixer.getByRole("button", { name: "Tout couper", exact: true }).click();
    await mixer.getByRole("button", { name: "Réactiver le son", exact: true }).click();
    await mixer.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.screenshot({ path: path.join(directory, `${viewport.width}-casino.png`) });
    assert.ok(requests.some(request => request.path === "/api/auth/discord/activity"));
    assert.deepEqual((await page.evaluate(() => window.commands.find(command => command.cmd === "AUTHORIZE"))).args.scope, ["identify"]);
    assert.equal((await page.evaluate(() => window.commands.some(command => command.cmd === "CAPTURE_LOG"))), false);
    const activity = page.frames().find(frame => frame.url().startsWith(origin));
    await activity.evaluate(() => { history.pushState({}, "", "/table/ABC123?frame_id=fixture-frame&instance_id=fixture-instance&platform=desktop"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await frame.getByRole("button", { name: "Démarrer la partie", exact: true }).waitFor();
    await page.screenshot({ path: path.join(directory, `${viewport.width}-waiting.png`) });
    await frame.getByRole("button", { name: "Démarrer la partie", exact: true }).click();
    await frame.locator(".board-yahtzee").waitFor();
    assert.equal(await frame.getByRole("button", { name: "Scores", exact: true }).isVisible(), true);
    await frame.getByRole("button", { name: /^Lancer/ }).click();
    await page.waitForTimeout(1400);
    const notes = await activity.evaluate(() => window.ktgaFixtureNotes);
    assert.ok(notes.includes(523.25), "game start chime");
    assert.ok(requests.some(request => request.path.startsWith("/audio/dice-throw-")), "real dice sample requested");
    assert.ok(await activity.evaluate(() => window.ktgaFixtureSamples.some(sample => !sample.loop && sample.duration > .1)), "real sample decoded and played");
    assert.equal(requests.filter(request => request.path === "/audio/lounge-loop.mp3").length, 1, "music buffer is reused");
    assert.ok(notes.includes(440), "timer limit cue");
    assert.ok(await activity.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(directory, `${viewport.width}-playing.png`) });
    await frame.getByRole("button", { name: "Scores", exact: true }).click();
    await frame.getByRole("dialog").waitFor();
    await page.screenshot({ path: path.join(directory, `${viewport.width}-scores.png`) });
    await frame.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
    await frame.locator('.legal-footer a[href="/conditions"]').click(); await page.waitForTimeout(100);
    assert.ok(new URL(activity.url()).searchParams.has("frame_id"));
    await activity.evaluate(() => history.replaceState({}, "", "/table/ABC123?frame_id=private&token=never-forward#private"));
    await frame.getByRole("button", { name: "Ouvrir dans le navigateur", exact: true }).click();
    await page.waitForFunction(() => window.commands.filter(command => command.cmd === "OPEN_EXTERNAL_LINK").length === 2);
    assert.equal((await page.evaluate(() => window.commands.filter(command => command.cmd === "OPEN_EXTERNAL_LINK").at(-1))).args.url, "https://www.ktga.me/table/ABC123");
    assert.ok(await activity.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(directory, `${viewport.width}-navigation.png`) });
    results.push({ width: viewport.width, login: true, externalTable: true }); await context.close();
  }
  const directContext = await browser.newContext({ viewport: { width: 1280, height: 800 } }), direct = await directContext.newPage();
  direct.on("pageerror", error => errors.push(error.message)); await blocker.enableBlockingInPage(direct);
  await direct.route("https://www.ktga.me/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/discord/activity/config") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ available: true, clientId: "123456789012345678", websiteUrl: "https://www.ktga.me" }) });
    if (url.pathname.startsWith("/api/locales/")) return route.fulfill({ contentType: "application/json", body: '{"messages":{}}' });
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Classic casino</h1>" });
    const filename = url.pathname === "/discord-activity/" ? path.join(dist, "discord-activity/index.html") : path.resolve(dist, `.${url.pathname}`);
    if (!filename.startsWith(dist + path.sep) || !fs.existsSync(filename)) return route.abort();
    return route.fulfill({ contentType: { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(filename)] ?? "application/octet-stream", headers: path.extname(filename) === ".html" ? { "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" } : {}, body: fs.readFileSync(filename) });
  });
  await direct.goto("https://www.ktga.me/discord-activity/"); await direct.getByRole("button", { name: "Ouvrir dans le navigateur", exact: true }).click();
  await direct.getByRole("heading", { name: "Classic casino", exact: true }).waitFor(); await directContext.close();
  assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: true, results, directEntry: true, directory }));
} finally { await browser.close(); }
