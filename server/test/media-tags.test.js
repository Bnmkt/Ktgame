import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createMediaLibrary, registerMediaRoutes } from "../src/services/media-library.js";
import { initialMediaTags, normalizeMediaTags } from "../src/services/media-tags.js";

const entries = [
  { id: `${"a".repeat(64)}.png`, name: "Lucky malicieux", alt: "", width: 800, height: 800, tags: undefined },
  { id: `${"b".repeat(64)}.png`, name: "Image", alt: "", width: 800, height: 1200, tags: undefined }
].map(row => ({ ...row, image: `/api/media/${row.id}`, mime: "image/png", bytes: 100, archived: false }));
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-media-tags-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, "catalog.json"), JSON.stringify(entries));
  return { directory, store: await createMediaLibrary(directory) };
}
test("tags normalize Unicode, duplicates and case while rejecting malformed input", () => {
  assert.deepEqual(normalizeMediaTags([" Mascottes ", "mascottes", "DÉCORS", "  série   été "]), ["mascottes", "décors", "série été"]);
  for (const tags of ["lucky", [null], [""], ["x".repeat(41)], ["<script>"], ["a,b"], Array(21).fill("a")]) assert.throws(() => normalizeMediaTags(tags));
  assert.deepEqual(initialMediaTags({ name: "Badge Midnight", width: 100, height: 120 }), ["portrait", "mascottes", "midnight", "insignes"]);
});
test("legacy assets are tagged once and intentional removals persist across restarts", async t => {
  const { directory, store } = await fixture(t);
  assert.deepEqual(store.list()[0].tags, ["carré", "mascottes", "lucky"]);
  assert.deepEqual(store.list()[1].tags, ["portrait"]);
  await store.update(entries[0].id, { tags: [] });
  const reopened = await createMediaLibrary(directory);
  assert.deepEqual(reopened.get(entries[0].id).tags, []);
  assert.equal(reopened.get(entries[0].id).image, entries[0].image);
});
test("bulk changes are atomic, preserve names and links, and serialize alongside individual edits", async t => {
  const { store } = await fixture(t);
  const ids = entries.map(row => row.id);
  await Promise.all([store.update(ids[0], { name: "Lucky révisé" }), store.tagMany({ ids, tags: ["Collection"], operation: "add" })]);
  assert.equal(store.get(ids[0]).name, "Lucky révisé");
  assert.ok(store.list().every(row => row.tags.includes("collection")));
  await store.tagMany({ ids: [ids[1]], tags: ["collection"], operation: "remove" });
  assert.ok(store.get(ids[0]).tags.includes("collection"));
  assert.ok(!store.get(ids[1]).tags.includes("collection"));
  const before = structuredClone(store.list());
  await assert.rejects(store.tagMany({ ids: [ids[0], `${"f".repeat(64)}.png`], tags: ["lost"], operation: "add" }));
  assert.deepEqual(store.list(), before);
  await assert.rejects(store.update(ids[0], { name: "Must not persist", tags: ["<bad>"] }));
  assert.deepEqual(store.list(), before);
});
test("bulk endpoint requires a back-office account and does not bypass archive permissions", async t => {
  const { directory } = await fixture(t), app = express();
  app.use(express.json());
  const auth = (req, res, next) => { if (!req.get("X-Role")) return res.sendStatus(401); req.auth = { id: "test" }; req.backOfficeUser = { admin: req.get("X-Role") === "admin" }; next(); };
  const requireBackOffice = (req, res, next) => ["editor", "admin"].includes(req.get("X-Role")) ? next() : res.sendStatus(403);
  const store = await registerMediaRoutes({ app, directory, auth, requireBackOffice });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (route, body, role) => fetch(origin + route, { method: "PATCH", headers: { "Content-Type": "application/json", ...(role ? { "X-Role": role } : {}) }, body: JSON.stringify(body) });
  const body = { ids: entries.map(row => row.id), tags: ["Jeux"], operation: "add" };
  assert.equal((await request("/api/admin/media/tags", body)).status, 401);
  assert.equal((await request("/api/admin/media/tags", body, "player")).status, 403);
  const result = await request("/api/admin/media/tags", body, "editor");
  assert.equal(result.status, 200); assert.equal((await result.json()).updated.length, 2);
  assert.equal((await request(`/api/admin/media/${entries[0].id}`, { archived: true }, "editor")).status, 403);
  assert.equal(store.list().length, 2);
});
