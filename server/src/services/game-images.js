import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { sanitizeBugImage } from "./bug-images.js";
import { gameArtworkFormats } from "../../../client/src/features/games/artwork-crop.js";

export function createGameImageStore(directory) {
  const targetFor = (id) => /^[a-f0-9]{64}\.png$/.test(id ?? "") ? path.join(directory, id) : null;
  const has = (id) => { const target = targetFor(id); return Boolean(target && fs.existsSync(target) && fs.statSync(target).isFile()); };
  function save(body, field) {
    if (!Object.hasOwn(gameArtworkFormats, field)) throw new Error("Type d’image inconnu.");
    const format = gameArtworkFormats[field];
    let data;
    try { data = sanitizeBugImage(body); } catch { throw new Error("Une image PNG valide de 3 Mo maximum est nécessaire."); }
    if (data.readUInt32BE(16) !== format.width || data.readUInt32BE(20) !== format.height) throw new Error("Les dimensions de l’image ne correspondent pas au recadrage.");
    const id = `${createHash("sha256").update(data).digest("hex")}.png`;
    if (!has(id)) {
      fs.mkdirSync(directory, { recursive: true });
      const bytes = fs.readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.png$/.test(name)).reduce((sum, name) => sum + fs.statSync(path.join(directory, name)).size, 0);
      if (bytes + data.length > 200 * 1024 * 1024) throw new Error("Le stockage des images des jeux est plein.");
      fs.writeFileSync(targetFor(id), data, { flag: "wx" });
    }
    return { image: `/api/game-images/${id}`, width: format.width, height: format.height };
  }
  return { save, has, targetFor };
}

export function registerGameImageRoutes({ app, auth, requireAdmin, directory, games }) {
  const store = createGameImageStore(directory);
  app.post("/api/admin/games/:id/images/:field", auth, requireAdmin, express.raw({ type: "image/png", limit: "3mb" }), (req, res) => {
    if (!games.some((game) => game.id === req.params.id)) return res.status(404).json({ error: "Jeu introuvable." });
    try { res.status(201).json(store.save(req.body, req.params.field)); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.get("/api/game-images/:id", (req, res) => {
    if (!store.has(req.params.id)) return res.status(404).json({ error: "Image introuvable." });
    res.set("X-Content-Type-Options", "nosniff").set("Cache-Control", "public, max-age=31536000, immutable").type("png").sendFile(store.targetFor(req.params.id));
  });
  return store;
}
