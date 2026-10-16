import express from "express";
import fs from "node:fs";
import path from "node:path";
import { discordAgeAllowed, discordConfiguration, exchangeDiscordCode } from "./discord-oauth.js";

export const activityPrefix = "/discord-activity";
export const activityAncestors = "https://discord.com https://canary.discord.com https://ptb.discord.com https://*.discordsays.com";
export const activityCsp = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors ${activityAncestors}; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'`;
export function discordActivityOrigin(config = discordConfiguration()) {
  return config.available && /^\d{16,22}$/.test(config.clientId) ? `https://${config.clientId}.discordsays.com` : "";
}
export function activityPageCsp(config = discordConfiguration()) {
  const origin = discordActivityOrigin(config);
  return activityCsp + (origin ? ` ${origin.replace(/^https:/, "wss:")}` : "");
}

export function registerDiscordActivity({ app, clientDist, platformSettings, readDb, publicWebsiteUrl, beginAccountLogin, authFailureKey, authLockStatus, sendAuthLocked,
  configuration = discordConfiguration, exchangeCode = exchangeDiscordCode }) {
  const available = () => platformSettings().discordLoginEnabled && configuration().available;
  app.get("/api/discord/activity/config", (_req, res) => {
    const website = new URL(publicWebsiteUrl()); website.search = ""; website.hash = "";
    res.set("Cache-Control", "no-store").json({ available: available(), clientId: configuration().clientId, websiteUrl: website.origin });
  });
  app.post("/api/auth/discord/activity", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!available()) return res.status(503).json({ error: "La connexion Discord est indisponible." });
    if (req.headers.origin !== discordActivityOrigin(configuration())) return res.status(403).json({ error: "Cette connexion doit être lancée depuis l’activité Discord." });
    if (typeof req.body?.code !== "string" || !req.body.code || req.body.code.length > 2048) return res.status(400).json({ error: "Autorisation Discord invalide." });
    let identity;
    try { identity = await exchangeCode(req.body.code, { configuration, embedded: true }); }
    catch { return res.status(400).json({ error: "La connexion Discord a expiré ou échoué. Réessaie." }); }
    // Never match on email or accept an account identifier supplied by the client.
    const db = readDb(), user = db.users.find(entry => !entry.guest && entry.discord?.id === identity.id);
    if (!user) return res.status(404).json({ code: "DISCORD_NOT_LINKED", error: "Ce Discord n’est pas encore associé. Crée un compte ou connecte-toi avec ton email, puis associe Discord dans Profil > Connexion et sécurité." });
    if (!discordAgeAllowed(user)) return res.status(403).json({ error: "La connexion Discord est réservée aux comptes de 13 ans et plus avec une date de naissance renseignée." });
    const key = authFailureKey(user.email || user.pseudo, req), lock = authLockStatus(user, key);
    if (lock.locked) return sendAuthLocked(res, lock);
    return beginAccountLogin(req, res, db, user, "discord", key);
  });
  if (!clientDist) return;
  const html = path.resolve(clientDist, "discord-activity/index.html");
  const router = express.Router();
  router.use((_req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.set({ "Content-Security-Policy": activityPageCsp(configuration()), "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  const document = (_req, res) => fs.existsSync(html) ? res.sendFile(html) : res.status(503).type("text/plain").send("L’activité Discord est temporairement indisponible.");
  router.get(["/", "/index.html"], document);
  router.use(express.static(path.resolve(clientDist), { index: false, redirect: false, dotfiles: "deny" }));
  router.use((req, res, next) => ["GET", "HEAD"].includes(req.method) && (!/\.[a-z0-9]+$/i.test(req.path) || req.path.startsWith("/patchnotes/")) ? document(req, res) : next());
  app.use(activityPrefix, router);
}
