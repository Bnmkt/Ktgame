import fs from "node:fs";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { queueGameplayReset, resetPendingPath, resetSummary, RESET_CONFIRMATION } from "./gameplay-reset.js";

const fingerprint = ({ lastReset, ...summary }) => JSON.stringify(summary);

export function registerGameplayResetRoutes({ app, auth, requireAdmin, filename, readUser, verifyCredential, onQueued, now = Date.now }) {
  const challenges = new Map();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Trop de tentatives de réinitialisation. Réessaie dans quinze minutes." } });
  app.get("/api/admin/gameplay-reset", auth, requireAdmin, (req, res) => {
    const user = readUser(req.auth.id), time = now();
    for (const [key, value] of challenges) if (value.expiresAt <= time || value.userId === user.id) challenges.delete(key);
    if (challenges.size >= 100) return res.status(429).json({ error: "Trop de confirmations en attente." });
    const summary = resetSummary(filename), token = randomBytes(32).toString("hex"), expiresAt = time + 5 * 60 * 1000;
    challenges.set(token, { userId: user.id, sessionVersion: user.sessionVersion ?? 0, expiresAt, fingerprint: fingerprint(summary) });
    res.set("Cache-Control", "no-store").json({ summary, token, expiresAt, confirmation: RESET_CONFIRMATION, pending: fs.existsSync(resetPendingPath(filename)), methods: [...(user.passwordHash ? ["password"] : []), ...(user.mfa?.totpSecret ? ["totp"] : [])] });
  });
  app.post("/api/admin/gameplay-reset", auth, requireAdmin, limiter, async (req, res, next) => {
    const challenge = challenges.get(req.body?.token);
    const user = readUser(req.auth.id);
    if (!challenge || challenge.userId !== user?.id || challenge.sessionVersion !== (user.sessionVersion ?? 0) || challenge.expiresAt <= now()) return res.status(409).json({ error: "La confirmation a expiré. Recharge le récapitulatif." });
    if (req.body.confirmation !== RESET_CONFIRMATION || req.body.acknowledge !== true) return res.status(400).json({ error: "Recopie la confirmation et accepte la remise à zéro." });
    try {
      if (!await verifyCredential(user, req.body.method, req.body.credential)) return res.status(403).json({ error: "Vérification administrateur incorrecte." });
      const current = readUser(req.auth.id);
      if (!current?.admin || current.active === false || (current.sessionVersion ?? 0) !== challenge.sessionVersion) return res.status(403).json({ error: "Les accès du compte ont changé." });
      const summary = resetSummary(filename);
      if (fingerprint(summary) !== challenge.fingerprint) return res.status(409).json({ error: "Les données ont changé. Recharge le récapitulatif avant de confirmer." });
      challenges.delete(req.body.token);
      const job = queueGameplayReset(filename, user.id, summary, now());
      res.once("finish", () => onQueued(job));
      res.status(202).json({ id: job.id, status: "restart-pending", message: "Réinitialisation programmée au redémarrage. Les sessions seront fermées." });
    } catch (error) {
      if (error.code === "EEXIST") return res.status(409).json({ error: "Une réinitialisation est déjà programmée." });
      next(error);
    }
  });
}
