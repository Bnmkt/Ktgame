import bcrypt from "bcryptjs";
import { authLockStatus, recordAuthFailure } from "./account-security.js";
import { emailDeliveryConfigured, sendTransactionalEmail, validEmail } from "./email-verification.js";
import { generatePersonalArchive } from "./data-requests.js";
import { dataRequestEmail } from "./data-request-email.js";

export function playerDataRequest(row) {
  const { id, status, requested_at, due_at, approved_at, sent_at, extension_reason, extended_at } = row;
  return { id, status, requested_at, due_at, approved_at, sent_at, extension_reason, extended_at };
}

export function registerDataRequestRoutes({ app, auth, requireAdmin, store, readDb, updateDb, paths, siteName, notifyContact = () => {}, exportArchive = generatePersonalArchive, sendEmail = sendTransactionalEmail }) {
  const changing = new Set();
  const jobs = [];
  let running = 0;
  function drain() {
    while (running < 2 && jobs.length) {
      running++;
      jobs.shift()().finally(() => { running--; drain(); });
    }
  }
  const userFor = (id) => readDb().users.find((entry) => entry.id === id && !entry.guest);
  const scoped = (req, res) => {
    const request = store.get(req.params.requestId);
    if (!request || request.user_id !== req.params.id) { res.status(404).json({ error: "Demande introuvable." }); return null; }
    return request;
  };
  const eligible = (user) => Boolean(user && validEmail(user.email) && user.emailVerifiedAt);
  const mail = (user, request, kind, extra = {}) => ({ ...dataRequestEmail({ user, request, kind, siteName: siteName(), reason: request.extension_reason }), ...extra });
  app.get("/api/me/data-requests", auth, (req, res) => {
    const user = userFor(req.auth.id);
    if (!user) return res.status(403).json({ error: "Un compte joueur est nécessaire." });
    res.json({ requests: store.list(user.id).map(playerDataRequest), emailReady: eligible(user), contactEmail: process.env.CONTACT_EMAIL || "contact@netdis.org" });
  });
  app.post("/api/me/data-requests", auth, async (req, res) => {
    const user = userFor(req.auth.id);
    if (!eligible(user)) return res.status(400).json({ error: "Vérifie ton adresse email avant de demander un envoi. Tu peux également exercer ce droit par email auprès du responsable du site." });
    const lock = authLockStatus(user);
    if (lock.locked) return res.status(429).json({ error: "Confirmation temporairement bloquée après plusieurs échecs.", retryAfterSeconds: lock.retryAfterSeconds });
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!password || password.length > 128 || !await bcrypt.compare(password, user.passwordHash || "")) {
      updateDb((db) => { const current = db.users.find((entry) => entry.id === user.id); if (current) recordAuthFailure(current); });
      return res.status(403).json({ error: "Le mot de passe actuel est incorrect." });
    }
    // Re-read after password verification: changing the account must invalidate this confirmation.
    const current = userFor(user.id);
    if (!eligible(current) || current.email !== user.email || current.passwordHash !== user.passwordHash) return res.status(409).json({ error: "Le compte a changé. Reconnecte-toi avant de confirmer." });
    const { request, created } = store.create(user.id, user.email);
    if (created) notifyContact(`data-request:${request.id}`, { kind: "data-request", reference: request.id, at: request.requested_at, dueAt: request.due_at });
    let acknowledgmentSent = false;
    if (created && emailDeliveryConfigured()) {
      try { await sendEmail(mail(current, request, "received")); acknowledgmentSent = true; }
      catch { /* The request remains registered even when the acknowledgment fails. */ }
    }
    res.status(created ? 201 : 200).json({ request: playerDataRequest(request), acknowledgmentSent });
  });
  app.get("/api/admin/data-requests", auth, requireAdmin, (_req, res) => res.json({ requests: store.list().filter((row) => row.status !== "sent") }));
  app.get("/api/admin/users/:id/data-requests", auth, requireAdmin, (req, res) => res.json({ requests: store.list(req.params.id), emailAvailable: emailDeliveryConfigured() }));
  app.post("/api/admin/users/:id/data-requests/:requestId/approve", auth, requireAdmin, (req, res) => {
    const request = scoped(req, res);
    if (!request) return;
    const user = userFor(request.user_id);
    if (!eligible(user) || user.email !== request.email) return res.status(409).json({ error: "L’adresse vérifiée doit correspondre à celle de la demande. Une nouvelle adresse nécessite une revue d’identité et un traitement manuel." });
    if (!emailDeliveryConfigured()) return res.status(503).json({ error: "Le service email doit être configuré avant l’envoi." });
    if (jobs.length >= 32) return res.status(503).json({ error: "La file d’exports est momentanément pleine. La demande reste en attente." });
    if (changing.has(request.id)) return res.status(409).json({ error: "Cette demande est déjà en cours de traitement." });
    let approved;
    try { approved = store.approve(request.id, req.auth.id, user.email); }
    catch (error) { return res.status(409).json({ error: error.message }); }
    changing.add(request.id);
    res.status(202).json({ request: approved });
    jobs.push(async () => {
      try {
        const archive = await exportArchive({ userId: user.id, paths, requestId: request.id, contactEmail: process.env.CONTACT_EMAIL || "contact@netdis.org" });
        const recipient = userFor(user.id);
        if (!eligible(recipient) || recipient.email !== approved.email) throw new Error("Le compte ou son adresse vérifiée a changé pendant la génération. Revue manuelle nécessaire.");
        await sendEmail(mail(recipient, approved, "sent", { messageId: `<rights-${request.id}@ktga.me>`, attachments: [{ filename: `mes-donnees-${request.id}.zip`, content: archive.content, contentType: "application/zip" }] }));
        store.sent(request.id);
      } catch (error) { store.fail(request.id, error.message); }
      finally { changing.delete(request.id); }
    });
    drain();
  });
  app.post("/api/admin/users/:id/data-requests/:requestId/extend", auth, requireAdmin, async (req, res) => {
    const request = scoped(req, res);
    if (!request) return;
    if (changing.has(request.id)) return res.status(409).json({ error: "Cette demande est déjà en cours de traitement." });
    changing.add(request.id);
    try {
      const user = userFor(request.user_id);
      if (!eligible(user) || user.email !== request.email) throw new Error("L’adresse du demandeur doit être vérifiée et inchangée.");
      const extended = store.extend(request.id, req.body.reason);
      await sendEmail(mail(user, extended, "extended"));
      store.commitExtension(extended);
      res.json({ request: store.get(request.id) });
    } catch (error) { res.status(400).json({ error: error.message }); }
    finally { changing.delete(request.id); }
  });
}
