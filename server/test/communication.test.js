import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import express from "express";
import { createCommunicationStore } from "../src/services/communication-store.js";
import { registerCommunicationRoutes, normalizePressKit, normalizeCampaign, publicDestinations, pressKitArchive, seoReport } from "../src/services/communication.js";
import { campaignUrl, suggestedKit } from "../../client/src/features/communication/config.js";

const site = { siteName: "KTGA.ME", supportEmail: "contact@example.test" };
const website = "https://www.ktga.me/";
const destinations = () => publicDestinations({ settings: site, website, games: [{ id: "yahtzee", name: "Yahtzee", description: "Des dés entre amis" }], notes: [{ version: "0.2.1", status: "published", title: "Nouveautés" }, { version: "9", status: "draft", title: "Privé" }], pages: [{ slug: "club", title: "Club", description: "Bonjour", indexable: true }] });
const draft = () => ({ name: "Club", destination: "/jeux/yahtzee", source: "club", medium: "qr", campaign: "beta", content: "affiche-a", notes: "Interne", color: "#102820" });

test("campaigns only target existing public pages and never retain private parameters", () => {
  assert.equal(normalizeCampaign(draft(), website, destinations()).url, "https://www.ktga.me/jeux/yahtzee?utm_source=club&utm_medium=qr&utm_campaign=beta&utm_content=affiche-a");
  for (const destination of ["https://evil.test/", "//evil.test/", "/admin", "/profil", "/?token=secret", "/?room=ABC", "/pages/missing", "/patchnotes?version=9"]) assert.throws(() => normalizeCampaign({ ...draft(), destination }, website, destinations()));
  assert.throws(() => campaignUrl({ ...draft(), source: "my secret/email" }, website));
  assert.throws(() => normalizeCampaign({ ...draft(), color: "#ffffff" }, website, destinations()), /sombre/);
  assert.ok(seoReport(destinations()).every(page => Array.isArray(page.suggestions)));
  assert.equal(new Set(destinations().map(page => page.url)).size, destinations().length);
});

test("documents persist, lists remain light and stale updates/deletes cannot replace newer work", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-comms-"));
  const filename = path.join(dir, "communication.sqlite");
  let store = createCommunicationStore(filename);
  try {
    const kit = store.save("kit", null, suggestedKit(site));
    assert.equal(store.list("kit")[0].longDescription, undefined);
    const updated = store.save("kit", kit.id, { ...kit, name: "Updated" }, kit.revision);
    assert.throws(() => store.save("kit", kit.id, kit, kit.revision), error => error.status === 409);
    assert.throws(() => store.remove("kit", kit.id, kit.revision), error => error.status === 409);
    store.close(); store = createCommunicationStore(filename);
    assert.equal(store.get("kit", kit.id).name, "Updated");
    store.remove("kit", kit.id, updated.revision);
    assert.equal(store.list("kit").length, 0);
  } finally { store.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

function zipFiles(buffer) {
  const end = buffer.length - 22, entries = buffer.readUInt16LE(end + 10), files = new Map();
  let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < entries; i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const compression = buffer.readUInt16LE(offset + 10), size = buffer.readUInt32LE(offset + 20), nameLength = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files.set(name, compression === 8 ? inflateRawSync(data) : data);
    offset += 46 + nameLength + extra + comment;
  }
  return files;
}

test("press ZIP includes actual assets, standalone escaped HTML, texts and a PNG QR without internal paths", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-kit-"));
  const id = `${"a".repeat(64)}.png`, filename = path.join(directory, id);
  const row = { id, name: "Image / spéciale", image: `/api/media/${id}` };
  const media = { get: key => key === id ? row : null, target: () => filename };
  await fs.writeFile(filename, Buffer.from("actual image file"));
  try {
    const kit = normalizePressKit({ ...suggestedKit(site), title: '<script>alert("x")</script>', assets: [{ id, caption: "Une image", credit: "KTGA" }] }, media);
    const stream = await pressKitArchive(kit, website, media), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const files = zipFiles(Buffer.concat(chunks));
    assert.ok(files.has("kit-presse.md"));
    assert.ok(files.has("kit-presse.json"));
    assert.ok(files.get("qr-site.png").subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    assert.match(files.get("index.html").toString(), /&lt;script&gt;/);
    assert.doesNotMatch(files.get("index.html").toString(), /<script>/);
    const manifest = JSON.parse(files.get("kit-presse.json"));
    assert.equal(files.get(manifest.assets[0].image).toString(), "actual image file");
    assert.equal(manifest.assets[0].target, undefined);
    assert.throws(() => normalizePressKit({ ...kit, assets: [{ id: "../../secret" }] }, media));
    row.archived = true;
    await assert.rejects(pressKitArchive(kit, website, media), /disponible/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("routes protect all tools, generate QR PNG/SVG, retain revisions and reserve deletion to admins", async () => {
  const app = express(), store = createCommunicationStore(":memory:");
  app.use(express.json());
  const auth = (req, res, next) => req.get("X-Role") ? next() : res.sendStatus(401);
  const requireBackOffice = (req, res, next) => ["admin", "editor"].includes(req.get("X-Role")) ? next() : res.sendStatus(403);
  const requireAdmin = (req, res, next) => req.get("X-Role") === "admin" ? next() : res.sendStatus(403);
  registerCommunicationRoutes({ app, auth, requireAdmin, requireBackOffice, store, settings: () => site, website: () => website, mediaLibrary: { list: () => [], get: () => null }, games: () => [{ id: "yahtzee", name: "Yahtzee" }], pages: () => [], notes: () => [] });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const request = (suffix = "", method = "GET", body, role = "admin") => fetch(`http://127.0.0.1:${server.address().port}/api/admin/communication${suffix}`, { method, headers: { ...(role ? { "X-Role": role } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await request("", "GET", null, "")).status, 401);
    assert.equal((await request("", "GET", null, "player")).status, 403);
    const kit = await (await request("/kits", "POST", suggestedKit(site), "editor")).json();
    assert.equal((await request(`/kits/${kit.id}`, "DELETE", kit, "editor")).status, 403);
    const saved = await (await request("/campaigns", "POST", draft())).json();
    assert.ok(saved.id);
    assert.equal((await request(`/campaigns/${saved.id}`, "PUT", { ...saved, revision: 0 })).status, 409);
    const svg = await (await request("/qr", "POST", { ...draft(), format: "svg" })).json();
    assert.match(svg.content, /^<svg/);
    assert.equal(svg.url, saved.url);
    const png = await (await request("/qr", "POST", { ...draft(), format: "png" })).json();
    assert.ok(Buffer.from(png.content, "base64").readUInt32BE(16) >= 1000);
    assert.equal((await request("/qr", "POST", { ...draft(), destination: "https://evil.test", format: "svg" })).status, 400);
    assert.equal((await request(`/kits/${kit.id}`, "DELETE", kit)).status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); }
});
