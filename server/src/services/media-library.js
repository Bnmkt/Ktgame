import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import { sanitizeBugImage } from "./bug-images.js";

const filePattern = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
export const mediaPath = value => typeof value === "string" && /^\/api\/media\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(value) ? value : "";
const dimensions = (width, height) => {
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16777216) throw new Error("Dimensions maximales : 4 096 pixels par côté.");
  return { width, height };
};

export function sanitizeMedia(body, mime) {
  if (!Buffer.isBuffer(body) || body.length < 20 || body.length > 3 * 1024 * 1024) throw new Error("Une image de 3 Mo maximum est requise.");
  if (mime === "image/png") {
    const data = sanitizeBugImage(body);
    return { data, mime, extension: "png", ...dimensions(data.readUInt32BE(16), data.readUInt32BE(20)) };
  }
  if (mime === "image/gif" && ["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6)) && body.at(-1) === 0x3b) {
    // Animated GIFs are kept intact; the import explicitly warns about original metadata.
    return { data: body, mime, extension: "gif", ...dimensions(body.readUInt16LE(6), body.readUInt16LE(8)) };
  }
  if (mime === "image/jpeg" && body.readUInt16BE(0) === 0xffd8 && body.readUInt16BE(body.length - 2) === 0xffd9) {
    const chunks = [body.subarray(0, 2)]; let cursor = 2, size;
    while (cursor + 4 <= body.length) {
      const start = cursor;
      if (body[cursor++] !== 0xff) break;
      while (body[cursor] === 0xff) cursor++;
      const marker = body[cursor++], length = body.readUInt16BE(cursor), end = cursor + length;
      if (length < 2 || end > body.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) size = dimensions(body.readUInt16BE(cursor + 5), body.readUInt16BE(cursor + 3));
      if (marker === 0xda && size) { chunks.push(body.subarray(start)); return { data: Buffer.concat(chunks), mime, extension: "jpg", ...size }; }
      if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) chunks.push(body.subarray(start, end));
      cursor = end;
    }
  }
  if (mime === "image/webp" && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP" && body.readUInt32LE(4) + 8 === body.length) {
    const chunks = []; let cursor = 12, size, pixels = false;
    while (cursor + 8 <= body.length) {
      const type = body.toString("ascii", cursor, cursor + 4), length = body.readUInt32LE(cursor + 4), end = cursor + 8 + length + length % 2;
      if (end > body.length) break;
      const chunk = Buffer.from(body.subarray(cursor, end)), data = chunk.subarray(8);
      if (type === "VP8X" && length === 10) { size = dimensions(1 + data.readUIntLE(4, 3), 1 + data.readUIntLE(7, 3)); data[0] &= ~(0x20 | 0x08 | 0x04); }
      if (type === "VP8 " && length >= 10 && data.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) { size ??= dimensions(data.readUInt16LE(6) & 0x3fff, data.readUInt16LE(8) & 0x3fff); pixels = true; }
      if (type === "VP8L" && length >= 5 && data[0] === 0x2f) { const bits = data.readUInt32LE(1); size ??= dimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)); pixels = true; }
      if (["VP8X", "VP8 ", "VP8L", "ALPH"].includes(type)) chunks.push(chunk);
      cursor = end;
    }
    if (cursor === body.length && size && pixels) { const header = Buffer.from(body.subarray(0, 12)), data = Buffer.concat([header, ...chunks]); data.writeUInt32LE(data.length - 8, 4); return { data, mime, extension: "webp", ...size }; }
  }
  throw new Error("Image invalide. Formats acceptés : PNG, JPEG, WebP et GIF.");
}

export async function createMediaLibrary(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o750 });
  const filename = path.join(directory, "catalog.json");
  let rows;
  try { rows = JSON.parse(await fs.readFile(filename, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; rows = []; }
  let queue = Promise.resolve();
  const change = operation => { const task = queue.then(async () => { const next = structuredClone(rows), result = await operation(next); const temporary = `${filename}.${randomUUID()}.tmp`; await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o640 }); await fs.rename(temporary, filename); rows = next; return result; }); queue = task.catch(() => {}); return task; };
  return {
    list: () => rows.filter(row => !row.archived),
    get: id => rows.find(row => row.id === id),
    target: id => filePattern.test(id ?? "") ? path.join(directory, id) : null,
    save: (body, mime, name, actor) => change(async next => {
      const image = sanitizeMedia(body, mime), id = `${createHash("sha256").update(image.data).digest("hex")}.${image.extension}`;
      let row = next.find(entry => entry.id === id);
      if (!row) {
        if (next.length >= 2000 || next.reduce((sum, entry) => sum + entry.bytes, 0) + image.data.length > 200 * 1024 * 1024) throw new Error("La médiathèque est pleine.");
        await fs.writeFile(path.join(directory, id), image.data, { mode: 0o640, flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
        row = { id, image: `/api/media/${id}`, mime: image.mime, width: image.width, height: image.height, bytes: image.data.length, name: String(name || "Image").slice(0, 120), alt: "", createdAt: new Date().toISOString(), createdBy: actor }; next.unshift(row);
      }
      row.archived = false; return row;
    }),
    update: (id, input) => change(next => { const row = next.find(entry => entry.id === id); if (!row) throw new Error("Image introuvable."); for (const key of ["name", "alt"]) if (typeof input[key] === "string") row[key] = input[key].trim().slice(0, key === "name" ? 120 : 300); if (typeof input.archived === "boolean") row.archived = input.archived; return row; })
  };
}

export async function registerMediaRoutes({ app, auth, requireAdmin, requireBackOffice, directory }) {
  const store = await createMediaLibrary(directory);
  app.get("/api/admin/media", auth, requireBackOffice, (_req, res) => res.set("Cache-Control", "no-store").json(store.list()));
  app.post("/api/admin/media", auth, requireBackOffice, express.raw({ type: ["image/png", "image/jpeg", "image/webp", "image/gif"], limit: "3mb" }), async (req, res) => {
    try { res.status(201).json(await store.save(req.body, req.get("Content-Type")?.split(";")[0], req.query.name, req.auth.id)); } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.patch("/api/admin/media/:id", auth, requireBackOffice, async (req, res) => {
    if (req.body.archived !== undefined && !req.backOfficeUser?.admin) return res.status(403).json({ error: "Accès administrateur requis." });
    try { res.json(await store.update(req.params.id, req.body)); } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.get("/api/media/:id", (req, res) => {
    const row = store.get(req.params.id), target = store.target(req.params.id);
    if (!row || !target) return res.status(404).end();
    res.set("Cache-Control", "public, max-age=31536000, immutable").set("X-Content-Type-Options", "nosniff").type(row.mime).sendFile(target);
  });
  return store;
}
