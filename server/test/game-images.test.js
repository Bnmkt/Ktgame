import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import express from "express";
import { createGameImageStore, registerGameImageRoutes } from "../src/services/game-images.js";

function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length); bytes.copy(output, 4); output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
function png(width = 1280, height = 560, metadata = false) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), ...(metadata ? [chunk("tEXt", Buffer.from("Author\0private@example.com"))] : []), chunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk("IEND", Buffer.alloc(0))]);
}
function removeTestDirectory(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("ktga-game-images-"));
  fs.rmSync(directory, { recursive: true, force: true });
}

test("game images remove metadata, deduplicate and reject invalid formats", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-game-images-"));
  try {
    const store = createGameImageStore(directory), saved = store.save(png(1280, 560, true), "coverImage");
    const id = saved.image.split("/").at(-1);
    assert.match(id, /^[a-f0-9]{64}\.png$/);
    assert.deepEqual(fs.readFileSync(store.targetFor(id)), png());
    assert.deepEqual(store.save(png(), "coverImage"), saved);
    assert.equal(fs.readdirSync(directory).length, 1);
    assert.equal(store.save(png(960, 720), "descriptiveImage").height, 720);
    assert.equal(store.has("../secret"), false);
    assert.equal(store.targetFor("../secret"), null);
    for (const field of ["constructor", "__proto__", "unknown"]) assert.throws(() => store.save(png(), field), /inconnu/);
    for (const body of [png(1, 1), Buffer.from("<svg onload='alert(1)'/>"), Buffer.alloc(3 * 1024 * 1024 + 1)]) assert.throws(() => store.save(body, "coverImage"));
    const corrupt = png(); corrupt[32] ^= 1;
    assert.throws(() => store.save(corrupt, "coverImage"));
  } finally { removeTestDirectory(directory); }
});

test("image upload is admin-only; public reads are immutable and safely addressed", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-game-images-"));
  const app = express();
  registerGameImageRoutes({ app, directory, games: [{ id: "yahtzee" }], auth: (req, res, next) => req.get("Authorization") ? next() : res.sendStatus(401), requireAdmin: (req, res, next) => req.get("Authorization") === "admin" ? next() : res.sendStatus(403) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const upload = (authorization, game = "yahtzee", field = "coverImage") => fetch(`${origin}/api/admin/games/${game}/images/${field}`, { method: "POST", headers: { "Content-Type": "image/png", ...(authorization ? { Authorization: authorization } : {}) }, body: png() });
  try {
    assert.equal((await upload()).status, 401);
    assert.equal((await upload("player")).status, 403);
    assert.equal((await upload("admin", "missing")).status, 404);
    assert.equal((await upload("admin", "yahtzee", "constructor")).status, 400);
    const uploaded = await upload("admin"); assert.equal(uploaded.status, 201);
    const { image } = await uploaded.json();
    const response = await fetch(`${origin}${image}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
    assert.match(response.headers.get("cache-control"), /immutable/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png());
    assert.equal((await fetch(`${origin}/api/game-images/invalid.png`)).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); removeTestDirectory(directory); }
});
