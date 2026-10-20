import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCommunicationStore } from "../src/services/communication-store.js";
import { normalizePlatform, exploreJson, createPlatformMetrics, PLATFORM_TTL, registerPlatformRoutes } from "../src/services/platforms.js";
const input = () => ({ name: "Annuaire", url: "https://provider.com/ktga", description: "Jeux gratuits", apiUrl: "https://provider.com/api/ktga", position: 0, metrics: [{ path: ["stats", "views"], label: "Vues" }] });

test("JSON paths remain unambiguous and bounded, without prototype traversal", () => {
  assert.deepEqual(exploreJson({ stats: { views: 0 }, "stats.views": false }).map(row => row.path), [["stats", "views"], ["stats.views"]]);
  assert.ok(exploreJson(JSON.parse('{"__proto__":{"secret":1},"ok":2}')).every(row => !row.path.includes("__proto__")));
  assert.ok(exploreJson(Array.from({ length: 10000 }, () => ({ x: 1 }))).length <= 300);
  assert.throws(() => normalizePlatform({ ...input(), metrics: [{ path: ["constructor"], label: "No" }] }));
  assert.throws(() => normalizePlatform({ ...input(), metrics: [input().metrics[0], input().metrics[0]] }));
});
test("15-minute persistent cache single-flights requests and retains last valid values on errors", async () => {
  const store = createCommunicationStore(":memory:"); let time = 10000, calls = 0, fail = false;
  const platform = store.save("platform", null, normalizePlatform(input()));
  const engine = createPlatformMetrics({ store, now: () => time, fetchJson: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); if (fail) throw new Error("Indisponible"); return { stats: { views: 42 } }; } });
  try {
    await Promise.all([engine.refresh(platform), engine.refresh(platform)]); assert.equal(calls, 1);
    time += PLATFORM_TTL - 1; await engine.refresh(platform); assert.equal(calls, 1);
    fail = true; time += 2; await engine.refresh(platform);
    const view = engine.view(platform); assert.equal(view.cache.leaves[0].value, 42); assert.equal(view.cache.fetchedAt, 10000); assert.equal(view.cache.error, "Indisponible");
    await engine.refresh(platform); assert.equal(calls, 2);
    const changed = { ...platform, apiUrl: "https://provider.com/other" }; assert.equal(engine.view(changed).cache, null);
  } finally { store.close(); }
});
test("platform CRUD uses back-office permissions and optimistic transactional ordering", async () => {
  const store = createCommunicationStore(":memory:"), app = express(); app.use(express.json());
  const auth = (req, res, next) => req.get("X-Role") ? next() : res.sendStatus(401);
  const requireBackOffice = (req, res, next) => ["admin", "editor"].includes(req.get("X-Role")) ? next() : res.sendStatus(403);
  const requireAdmin = (req, res, next) => req.get("X-Role") === "admin" ? next() : res.sendStatus(403);
  registerPlatformRoutes({ app, store, auth, requireAdmin, requireBackOffice, validateRemote: async () => {}, fetchJson: async () => ({ stats: { views: 42 } }) });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const request = (suffix = "", method = "GET", body, role = "admin") => fetch(`http://127.0.0.1:${server.address().port}/api/admin/communication/platforms${suffix}`, { method, headers: { ...(role ? { "X-Role": role } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await request("", "GET", null, "")).status, 401); assert.equal((await request("", "GET", null, "player")).status, 403);
    const first = await (await request("", "POST", input(), "editor")).json(); const second = await (await request("", "POST", { ...input(), name: "Second" })).json();
    const refreshed = await (await request(`/${first.id}/refresh`, "POST", {})).json(); assert.equal(refreshed.cache.leaves[0].value, 42);
    assert.equal((await request("/order", "POST", { items: [{ id: second.id, revision: second.revision }, { id: first.id, revision: first.revision }] })).status, 200);
    assert.equal((await request(`/${first.id}`, "PUT", first)).status, 409);
    assert.equal((await request(`/${first.id}`, "DELETE", { revision: 2 }, "editor")).status, 403);
    assert.equal((await request(`/${first.id}`, "DELETE", { revision: 2 })).status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); }
});

test("cached metrics survive reopening the store and limit simultaneous external calls", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-platforms-"));
  const filename = path.join(directory, "communication.sqlite");
  let store = createCommunicationStore(filename);
  try {
    const platform = store.save("platform", null, normalizePlatform(input()));
    await createPlatformMetrics({ store, fetchJson: async () => ({ views: 123 }) }).refresh(platform);
    store.close(); store = createCommunicationStore(filename);
    const restored = createPlatformMetrics({ store, fetchJson: () => { throw new Error("Cache should be used"); } });
    assert.equal((await restored.refresh(platform)).leaves[0].value, 123);
    const gates = [], engine = createPlatformMetrics({ store, fetchJson: () => new Promise(resolve => gates.push(resolve)) });
    const pending = Array.from({ length: 4 }, (_, n) => engine.refresh({ id: String(n), apiUrl: input().apiUrl }));
    await assert.rejects(engine.refresh({ id: "fifth", apiUrl: input().apiUrl }), error => error.status === 429);
    gates.forEach(resolve => resolve({ ok: true })); await Promise.all(pending);
  } finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
