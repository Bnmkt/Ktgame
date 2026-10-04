import express from "express";
import rateLimit from "express-rate-limit";
import { bugMetadata } from "./bug-reports.js";

export function registerBugReportRoutes({ app, auth, requireBackOffice, store, identify, staff, version }) {
  const submissions = rateLimit({ windowMs: 3600000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Trop de signalements. Réessaie dans une heure." } });
  const uploads = rateLimit({ windowMs: 900000, limit: 36, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Trop de captures. Réessaie dans 15 minutes." } });
  const comments = rateLimit({ windowMs: 60000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Patiente avant d'envoyer un autre commentaire." } });
  const viewer = (req) => identify(req);
  const access = (req) => {
    const user = viewer(req);
    return { viewer: user, receipt: req.get("X-Bug-Receipt"), admin: Boolean(user?.admin || user?.editor) };
  };
  const wrap = (handler) => (req, res) => {
    try { return handler(req, res); }
    catch (error) {
      if (error.code && !String(error.code).startsWith("ERR_SQLITE")) return res.status(500).json({ error: "Le dossier ne peut pas être traité pour le moment." });
      if (String(error.code).startsWith("ERR_SQLITE")) return res.status(400).json({ error: "Modification invalide. Vérifie les champs et les relations." });
      return res.status(400).json({ error: error.message || "Signalement invalide." });
    }
  };
  const assigned = (input) => {
    if (input.assignee && !staff().some((user) => user.id === input.assignee)) throw new Error("Choisis un administrateur ou un éditeur pour l'assignation.");
    return input;
  };
  app.get("/api/bugs/metadata", (_req, res) => res.json({ ...bugMetadata, limits: { images: 6, imageBytes: 3145728, totalImageBytes: 12582912 } }));
  app.get("/api/bugs/diagnostic-version", (_req, res) => res.json({ version: version() }));
  app.post("/api/bugs/uploads", uploads, express.raw({ type: "image/png", limit: "3mb" }), wrap((req, res) => res.status(201).json(store.stageImage(req.body))));
  app.post("/api/bugs", submissions, wrap((req, res) => {
    const user = viewer(req), result = store.create(req.body ?? {}, user);
    res.status(result.created ? 201 : 200).json({ ...result, anonymous: !user?.id });
  }));
  app.get("/api/bugs", wrap((req, res) => {
    const user = viewer(req), mine = req.query.mine === "true";
    if (mine && !user?.id) return res.status(401).json({ error: "Connecte-toi pour consulter tes signalements." });
    res.json(store.list(req.query, { viewer: user, mine }));
  }));
  app.get("/api/bugs/images/:id", wrap((req, res) => {
    const image = store.image(req.params.id, access(req));
    if (!image) return res.status(404).json({ error: "Capture indisponible." });
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).type(image.mimeType).sendFile(image.path);
  }));
  app.get("/api/bugs/:id", wrap((req, res) => {
    const report = store.get(req.params.id, access(req));
    if (!report) return res.status(404).json({ error: "Bug introuvable ou privé." });
    res.set("Cache-Control", "private, no-store").json(report);
  }));
  app.post("/api/bugs/:id/comments", comments, wrap((req, res) => {
    store.addComment(req.params.id, req.body ?? {}, viewer(req), false, req.get("X-Bug-Receipt"));
    res.status(201).json({ ok: true, message: "Commentaire reçu. Il sera publié après relecture." });
  }));
  const guard = [auth, requireBackOffice];
  app.get("/api/admin/bugs/metadata", ...guard, (_req, res) => res.json({ ...bugMetadata, groups: store.groups(), staff: staff(), summary: store.summary() }));
  app.get("/api/admin/bugs", ...guard, wrap((req, res) => res.json(store.list(req.query, { admin: true }))));
  app.post("/api/admin/bugs/groups", ...guard, wrap((req, res) => res.status(201).json(store.createGroup(req.body.name, req.auth.id))));
  app.post("/api/admin/bugs/batch", ...guard, wrap((req, res) => res.json(store.batch(req.body.ids, assigned(req.body.changes ?? {}), req.auth.id))));
  app.get("/api/admin/bugs/:id", ...guard, wrap((req, res) => {
    const report = store.get(req.params.id, { admin: true });
    if (!report) return res.status(404).json({ error: "Bug introuvable." });
    res.json({ ...report, suggestions: store.suggestions(report.id), resolutionPlan: store.resolutionPlan(report.id) });
  }));
  app.patch("/api/admin/bugs/:id", ...guard, wrap((req, res) => res.json(store.update(req.params.id, assigned(req.body ?? {}), req.auth.id))));
  app.post("/api/admin/bugs/:id/publication", ...guard, wrap((req, res) => res.json(store.publish(req.params.id, req.body ?? {}, req.auth.id))));
  app.post("/api/admin/bugs/:id/comments", ...guard, wrap((req, res) => {
    store.addComment(req.params.id, req.body ?? {}, { id: req.auth.id }, true); res.status(201).json({ ok: true });
  }));
  app.patch("/api/admin/bugs/:id/comments/:commentId", ...guard, wrap((req, res) => {
    store.moderateComment(req.params.id, req.params.commentId, req.body.visible, req.auth.id); res.json({ ok: true });
  }));
  app.post("/api/admin/bugs/:id/relations", ...guard, wrap((req, res) => {
    store.relate(req.params.id, req.body.targetId, req.body.type, req.auth.id); res.json({ ok: true });
  }));
  app.delete("/api/admin/bugs/:id/relations", ...guard, wrap((req, res) => {
    const report = store.get(req.params.id, { admin: true });
    if (!report?.links.some((link) => link.sourceId === Number(req.body.sourceId) && link.targetId === Number(req.body.targetId) && link.type === req.body.type)) throw new Error("Relation introuvable.");
    store.unlink(req.body.sourceId, req.body.targetId, req.body.type, req.auth.id); res.json({ ok: true });
  }));
  app.post("/api/admin/bugs/:id/resolution", ...guard, wrap((req, res) => res.json(store.resolve(req.params.id, req.body ?? {}, req.auth.id))));
}
