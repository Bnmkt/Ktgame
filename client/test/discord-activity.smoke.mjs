import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { games } from "../../server/src/games/shared.js";
import { defaultPublicSettings } from "../src/config/site.js";

const root = fileURLToPath(new URL("../../", import.meta.url)), dependencies = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(dependencies, "playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(dependencies, "@ghostery/adblocker-playwright/dist/esm/index.js")));
const dist = path.join(root, "client/dist"), directory = path.join(root, "docs/previews/discord-activity-20261016", String(Date.now())); fs.mkdirSync(directory, { recursive: true });
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
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), requests = [];
    page.on("pageerror", error => errors.push(error.message)); await blocker.enableBlockingInPage(page);
    await page.route("https://discord.com/ktga-fixture", route => route.fulfill({ contentType: "text/html", body: parentHtml }));
    await page.route(`${origin}/**`, async route => {
      const request = route.request(), url = new URL(request.url()); requests.push({ path: url.pathname, authorization: request.headers().authorization ?? "", method: request.method() });
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/discord/activity/config") return json({ available: true, clientId: "123456789012345678", websiteUrl: "https://www.ktga.me" });
      if (url.pathname === "/api/auth/discord/activity") { assert.deepEqual(request.postDataJSON(), { code: "fixture-authorization-code" }); return json({ token: "fixture-token-in-memory", user }); }
      if (url.pathname === "/api/config") return json({ ...defaultPublicSettings, discordLoginEnabled: true, discordLoginAvailable: true });
      if (url.pathname === "/api/games") return json(games.map((game, index) => ({ ...game, description: "Une partie entre amis.", position: index + 1, enabled: true, entryPot: 10, coverImage: "", descriptiveImage: "", discordIconImage: "" })));
      if (["/api/shop", "/api/rooms", "/api/notifications"].includes(url.pathname)) return json([]);
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
      const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
      return route.fulfill({ contentType: types[path.extname(filename)] ?? "application/octet-stream", body: fs.readFileSync(filename) });
    });
    await page.goto("https://discord.com/ktga-fixture"); const frame = page.frameLocator('iframe[title="KTGA Activity"]');
    await frame.getByRole("button", { name: "Jouer dans Discord", exact: true }).waitFor();
    await frame.getByRole("button", { name: "Jouer dans Discord", exact: true }).click({ trial: true });
    await page.waitForFunction(() => window.commands); await page.waitForTimeout(300);
    assert.equal(await frame.getByRole("button", { name: "Jouer dans Discord", exact: true }).isEnabled(), true);
    await page.screenshot({ path: path.join(directory, `${viewport.width}-choice.png`) });
    await frame.getByRole("button", { name: "Ouvrir dans le navigateur", exact: true }).click();
    await page.waitForFunction(() => window.commands.some(command => command.cmd === "OPEN_EXTERNAL_LINK"));
    assert.equal((await page.evaluate(() => window.commands.find(command => command.cmd === "OPEN_EXTERNAL_LINK"))).args.url, "https://www.ktga.me/");
    await frame.getByRole("button", { name: "Jouer dans Discord", exact: true }).click();
    await frame.getByRole("button", { name: "Tout refuser", exact: true }).click();
    await frame.getByRole("button", { name: "Se connecter avec Discord", exact: true }).click();
    await frame.locator(".casino-header").waitFor(); assert.equal(await frame.locator(".activity-toolbar").isVisible(), true);
    await page.screenshot({ path: path.join(directory, `${viewport.width}-casino.png`) });
    assert.ok(requests.some(request => request.path === "/api/auth/discord/activity"));
    assert.deepEqual((await page.evaluate(() => window.commands.find(command => command.cmd === "AUTHORIZE"))).args.scope, ["identify"]);
    assert.equal((await page.evaluate(() => window.commands.some(command => command.cmd === "CAPTURE_LOG"))), false);
    await frame.locator('.legal-footer a[href="/conditions"]').click(); await page.waitForTimeout(100);
    const activity = page.frames().find(frame => frame.url().startsWith(origin));
    assert.ok(new URL(activity.url()).searchParams.has("frame_id"));
    await activity.evaluate(() => history.replaceState({}, "", "/table/ABC123?frame_id=private&token=never-forward#private"));
    await frame.getByRole("button", { name: "Ouvrir dans le navigateur", exact: true }).click();
    await page.waitForFunction(() => window.commands.filter(command => command.cmd === "OPEN_EXTERNAL_LINK").length === 2);
    assert.equal((await page.evaluate(() => window.commands.filter(command => command.cmd === "OPEN_EXTERNAL_LINK").at(-1))).args.url, "https://www.ktga.me/table/ABC123");
    assert.ok(await activity.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(directory, `${viewport.width}-navigation.png`) });
    results.push({ width: viewport.width, login: true, externalTable: true }); await context.close();
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: true, results, directory }));
} finally { await browser.close(); }
