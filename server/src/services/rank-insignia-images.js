import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { sanitizeBugImage } from "./bug-images.js";

export function createRankInsigniaStore(directory) {
  const targetFor = (id) => /^[a-f0-9]{64}$/.test(id ?? "") ? path.join(directory, `${id}.png`) : null;
  function has(id) {
    const target = targetFor(id);
    return Boolean(target && fs.existsSync(target) && fs.statSync(target).isFile());
  }
  function save(body) {
    if (!Buffer.isBuffer(body) || body.length > 2 * 1024 * 1024) throw new Error("L’insigne doit être une image PNG de 2 Mo maximum.");
    let data;
    try { data = sanitizeBugImage(body); } catch { throw new Error("L’image de l’insigne est invalide ou endommagée."); }
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    if (width !== height || width > 512) throw new Error("L’insigne doit être carré, de 512 pixels maximum.");
    const id = createHash("sha256").update(data).digest("hex");
    if (!has(id)) {
      fs.mkdirSync(directory, { recursive: true });
      const bytes = fs.readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.png$/.test(name)).reduce((sum, name) => sum + fs.statSync(path.join(directory, name)).size, 0);
      if (bytes + data.length > 100 * 1024 * 1024) throw new Error("Le stockage des insignes est plein.");
      fs.writeFileSync(targetFor(id), data, { flag: "wx" });
    }
    return { id, width, height };
  }
  return { has, save, targetFor };
}

export function registerRankInsigniaRoutes({ app, auth, requireAdmin, directory }) {
  const store = createRankInsigniaStore(directory);
  app.post("/api/admin/ranked/insignia-images", auth, requireAdmin, express.raw({ type: "image/png", limit: "2mb" }), (req, res) => {
    try { res.status(201).json(store.save(req.body)); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.get("/api/ranked/insignia-images/:id", (req, res) => {
    if (!store.has(req.params.id)) return res.status(404).json({ error: "Insigne introuvable." });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.type("png").sendFile(store.targetFor(req.params.id));
  });
  return store;
}
