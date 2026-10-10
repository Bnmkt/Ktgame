import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createInstallController, installationHelp, INSTALL_CHOICE_KEY, registerOfflineWorker } from "../src/pwa/install.js";

function fixture({ choice = "", agent = "Chrome", standalone = false, secure = true, blocked = false } = {}) {
  const window = new EventTarget(), modes = new Map(), values = new Map(choice ? [[INSTALL_CHOICE_KEY, choice]] : []);
  window.navigator = { userAgent: agent, standalone };
  window.isSecureContext = secure; window.location = { origin: "https://www.ktga.me" }; window.self = window.top = window;
  window.matchMedia = (query) => {
    if (!modes.has(query)) modes.set(query, Object.assign(new EventTarget(), { matches: false }));
    return modes.get(query);
  };
  window.localStorage = { getItem(key) { if (blocked) throw Error("Storage blocked"); return values.get(key) ?? null; }, setItem(key, value) { if (blocked) throw Error("Storage blocked"); values.set(key, value); } };
  const controller = createInstallController(window); controller.start();
  let prompted = 0;
  const offer = (outcome = "dismissed", prompt = async () => {}) => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => { prompted++; await prompt(); }, userChoice: Promise.resolve({ outcome }) });
    window.dispatchEvent(event); assert.equal(event.defaultPrevented, true); return event;
  };
  return { controller, window, values, modes, offer, prompted: () => prompted };
}

test("installation waits for browser capability and an explicit click", async () => {
  const f = fixture(); assert.equal(f.controller.getSnapshot().visible, false);
  f.offer("accepted"); assert.equal(f.controller.getSnapshot().visible, true); assert.equal(f.prompted(), 0);
  assert.equal(await f.controller.install(), "accepted"); assert.equal(f.prompted(), 1);
  assert.equal(f.controller.getSnapshot().visible, false); assert.equal(f.values.get(INSTALL_CHOICE_KEY), "installed");
});
test("ignoring persists across visits and browser installation events do not revive it", () => {
  const f = fixture(); f.offer(); f.controller.ignore(); f.offer();
  assert.equal(f.controller.getSnapshot().visible, false);
  const next = fixture({ choice: f.values.get(INSTALL_CHOICE_KEY) }); next.offer(); assert.equal(next.controller.getSnapshot().visible, false);
});
test("a dismissed native dialog keeps the proposal and uses manual help without reusing the event", async () => {
  const f = fixture(); f.offer(); assert.equal(await f.controller.install(), "dismissed");
  assert.equal(f.controller.getSnapshot().visible, true); assert.equal(await f.controller.install(), "manual"); assert.equal(f.prompted(), 1);
  f.offer(); assert.equal(f.controller.getSnapshot().native, true);
});
test("installation outside the site button and standalone windows suppress the proposal", () => {
  const f = fixture(); f.offer(); f.window.dispatchEvent(new Event("appinstalled")); assert.equal(f.controller.getSnapshot().visible, false);
  const standalone = fixture({ standalone: true }); standalone.offer(); assert.equal(standalone.controller.getSnapshot().visible, false);
  const mode = fixture(); mode.offer(); const display = mode.modes.get("(display-mode: standalone)"); display.matches = true; display.dispatchEvent(new Event("change")); assert.equal(mode.controller.getSnapshot().visible, false);
});
test("manual instructions cover iOS, iPad desktop UA, Safari Mac and Firefox Android", () => {
  assert.equal(installationHelp({ userAgent: "iPhone Safari" }), "ios");
  assert.equal(installationHelp({ userAgent: "Macintosh Safari", maxTouchPoints: 5 }), "ios");
  assert.equal(installationHelp({ userAgent: "Macintosh Safari" }), "mac");
  assert.equal(installationHelp({ userAgent: "Android Firefox" }), "android");
  assert.equal(installationHelp({ userAgent: "Macintosh Chrome Safari" }), null);
  const f = fixture({ agent: "iPhone Safari" }); assert.equal(f.controller.getSnapshot().visible, true);
});
test("blocked storage remains usable and insecure contexts never offer installation", () => {
  const f = fixture({ blocked: true }); f.offer(); f.controller.ignore(); f.offer(); assert.equal(f.controller.getSnapshot().visible, false);
  const insecure = fixture({ secure: false }); insecure.offer(); assert.equal(insecure.controller.getSnapshot().visible, false);
});
test("cross-tab choices synchronize and stopped controllers release their listeners", () => {
  const f = fixture(); f.offer(); let changes = 0; const unsubscribe = f.controller.subscribe(() => changes++);
  f.values.set(INSTALL_CHOICE_KEY, "ignored"); f.window.dispatchEvent(Object.assign(new Event("storage"), { key: INSTALL_CHOICE_KEY }));
  assert.equal(f.controller.getSnapshot().visible, false); assert.equal(changes, 1);
  unsubscribe(); f.controller.stop(); f.window.dispatchEvent(new Event("appinstalled")); assert.equal(changes, 1); assert.equal(f.values.get(INSTALL_CHOICE_KEY), "ignored");
});
test("double clicks cannot prompt twice and prompt failures retain a manual installation path", async () => {
  const f = fixture(); let finish; f.offer("dismissed", () => new Promise((resolve) => { finish = resolve; }));
  const first = f.controller.install(); assert.equal(await f.controller.install(), "busy"); finish(); await first; assert.equal(f.prompted(), 1);
  f.offer("dismissed", () => { throw Error("Prompt failed"); }); assert.equal(await f.controller.install(), "manual"); assert.equal(f.controller.getSnapshot().busy, false);
});
test("worker registration uses the app root, bypasses HTTP caches and tolerates failures", async () => {
  const f = fixture(); let call;
  f.window.navigator.serviceWorker = { register: async (...args) => { call = args; } };
  assert.equal(await registerOfflineWorker(f.window), true); assert.deepEqual(call, ["https://www.ktga.me/sw.js", { scope: "/", updateViaCache: "none" }]);
  assert.equal(await registerOfflineWorker(f.window, "/ktga/"), true); assert.equal(call[0], "https://www.ktga.me/ktga/sw.js");
  f.window.navigator.serviceWorker.register = async () => { throw Error("Unavailable"); }; assert.equal(await registerOfflineWorker(f.window), false);
  f.window.isSecureContext = false; assert.equal(await registerOfflineWorker(f.window), false);
});
test("manifest assets have actual PNG dimensions and safe standalone root navigation", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone"); assert.equal(manifest.start_url, "./"); assert.equal(manifest.scope, "./");
  for (const icon of manifest.icons) {
    const data = fs.readFileSync(new URL(`../public/${icon.src}`, import.meta.url));
    assert.equal(data.toString("hex", 0, 8), "89504e470d0a1a0a"); assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  const template = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"); assert.match(template, /rel="manifest"/); assert.match(template, /apple-touch-icon/);
});
test("service worker only caches the static offline page and icons, never navigation responses or API data", async () => {
  const handlers = {}, added = [], deleted = []; let offline = false;
  const fallback = { staticOffline: true };
  const context = {
    URL, Response, self: { registration: { scope: "https://www.ktga.me/" }, location: { origin: "https://www.ktga.me" }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => ({ addAll: async (urls) => added.push(...urls) }), keys: async () => ["ktga-offline-v0", "ktga-offline-v1", "other-cache"], delete: async (key) => deleted.push(key), match: async () => fallback },
    fetch: async () => { if (offline) throw Error("offline"); return { online: true }; }
  };
  vm.runInNewContext(fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), context);
  let task; handlers.install({ waitUntil(promise) { task = promise; } }); await task;
  assert.equal(added.length, 5); assert.ok(added.every((url) => /\/offline\.html$|\/pwa\/icon-[\w-]+\.png$/.test(url)));
  handlers.activate({ waitUntil(promise) { task = promise; } }); await task; assert.deepEqual(deleted, ["ktga-offline-v0"]);
  for (const request of [{ url: "https://www.ktga.me/api/me", mode: "cors", method: "GET" }, { url: "https://api.ktga.me/api/me", mode: "navigate", method: "GET" }, { url: "https://www.ktga.me/api/login", mode: "navigate", method: "POST" }, { url: "https://www.ktga.me/assets/app.js", mode: "cors", method: "GET" }]) {
    let intercepted = false; handlers.fetch({ request, respondWith() { intercepted = true; } }); assert.equal(intercepted, false);
  }
  const request = { url: "https://www.ktga.me/profil?secret=never-cache", mode: "navigate", method: "GET" };
  handlers.fetch({ request, respondWith(promise) { task = promise; } }); assert.equal((await task).online, true);
  offline = true; handlers.fetch({ request, respondWith(promise) { task = promise; } }); assert.equal(await task, fallback);
  assert.equal(added.length, 5);
});
test("production Nginx serves PWA entry files with explicit MIME types and without sticky caching", () => {
  const config = fs.readFileSync(new URL("../../deploy/debian/nginx-https.conf", import.meta.url), "utf8");
  for (const name of ["manifest.webmanifest", "sw.js", "offline.html"]) {
    const block = config.slice(config.indexOf(`location = /${name} {`)); assert.match(block.slice(0, block.indexOf("\n    }")), /expires -1;[\s\S]*try_files \$uri =404;/);
  }
  assert.match(config, /default_type application\/manifest\+json;/); assert.match(config, /default_type application\/javascript;/);
});
