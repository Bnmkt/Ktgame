import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { discordAgeAllowed } from "./discord-oauth.js";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");

export function discordActivityFor({ user, online, room, game }) {
  if (!online || !user?.discordPresenceEnabled || user.guest || user.active === false) return null;
  // An explicit allowlist: never include a room name/code, identity, hand, chat or private rank.
  return {
    details: room && game ? String(game.name).slice(0, 128) : "KTGA.ME",
    state: room ? room.finished ? "Partie terminée" : room.state ? "En partie" : "En salle d’attente" : "Au casino",
    type: 0
  };
}

export function createDiscordPresence({ now = Date.now, limit = 1000, filename } = {}) {
  const pending = new Map(), sessions = new Map();
  let database = null, lastPruneAt = 0;
  if (filename) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    database = new DatabaseSync(filename);
    database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS companion_sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_version INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS companion_user ON companion_sessions(user_id);`);
  }
  const getSession = database?.prepare("SELECT user_id AS userId, session_version AS sessionVersion, expires_at AS expiresAt FROM companion_sessions WHERE token_hash=? AND expires_at>?");
  const insertSession = database?.prepare("INSERT INTO companion_sessions VALUES(?,?,?,?)");
  const deleteUser = database?.prepare("DELETE FROM companion_sessions WHERE user_id=?");
  const deleteToken = database?.prepare("DELETE FROM companion_sessions WHERE token_hash=?");
  const countSessions = database?.prepare("SELECT count(*) AS count FROM companion_sessions");
  const deleteExpired = database?.prepare("DELETE FROM companion_sessions WHERE expires_at<=?");
  function prune() {
    for (const store of [pending, sessions]) for (const [key, value] of store) if (value.expiresAt <= now()) store.delete(key);
    if (database && (!lastPruneAt || now() - lastPruneAt >= 60000)) { deleteExpired.run(now()); lastPruneAt = now(); }
  }
  function revoke(userId) {
    for (const store of [pending, sessions]) for (const [key, value] of store) if (value.userId === userId) store.delete(key);
    deleteUser?.run(userId);
  }
  function pair(user, remember = false) {
    prune(); revoke(user.id);
    if (pending.size + sessions.size + (countSessions?.get().count ?? 0) >= limit) throw new Error("PRESENCE_BUSY");
    const code = randomBytes(9).toString("hex").toUpperCase();
    const expiresAt = now() + 5 * 60000;
    pending.set(hash(code), { userId: user.id, sessionVersion: Number(user.sessionVersion) || 0, expiresAt, remember });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }
  function connect(code) {
    prune();
    const key = hash(String(code ?? "").replace(/\s|-/g, "").toUpperCase());
    const entry = pending.get(key);
    if (!entry) return null;
    pending.delete(key);
    const token = randomBytes(32).toString("base64url"), expiresAt = now() + (entry.remember ? 30 * 86400000 : 12 * 3600000);
    if (entry.remember && database) insertSession.run(hash(token), entry.userId, entry.sessionVersion, expiresAt);
    else sessions.set(hash(token), { ...entry, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString(), remember: entry.remember };
  }
  function session(token) {
    prune();
    return sessions.get(hash(token)) ?? getSession?.get(hash(token), now()) ?? null;
  }
  function disconnect(token) { sessions.delete(hash(token)); deleteToken?.run(hash(token)); }
  return { pair, connect, session, revoke, disconnect, close: () => database?.close() };
}

export function registerDiscordPresence({ app, auth, readDb, writeDb, isUnder13, onlinePresence,
  io, roomPresence, configuredGames, configuration, accountBlocked, presence = createDiscordPresence() }) {
  function eligible(user) { return user && !user.guest && !isUnder13(user) && discordAgeAllowed(user) && user.active !== false && !accountBlocked(user); }
  app.get("/api/me/discord/presence", auth, (req, res) => {
    const user = readDb().users.find((entry) => entry.id === req.auth.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({ enabled: Boolean(user?.discordPresenceEnabled), available: Boolean(eligible(user) && configuration().available), transport: "companion" });
  });
  app.patch("/api/me/discord/presence", auth, (req, res) => {
    const db = readDb(), user = db.users.find((entry) => entry.id === req.auth.id);
    if (!eligible(user)) return res.status(403).json({ error: "La présence Discord est réservée aux comptes de 13 ans et plus." });
    if (typeof req.body.enabled !== "boolean") return res.status(400).json({ error: "Choisis d’activer ou de désactiver la présence." });
    if (req.body.enabled && !configuration().available) return res.status(503).json({ error: "L’application Discord n’est pas configurée." });
    user.discordPresenceEnabled = req.body.enabled;
    presence.revoke(user.id);
    writeDb(db, { users: [user.id], rooms: [] });
    res.json({ enabled: user.discordPresenceEnabled });
  });
  app.post("/api/me/discord/presence/pair", auth, (req, res) => {
    const user = readDb().users.find((entry) => entry.id === req.auth.id);
    if (!eligible(user) || !user.discordPresenceEnabled || !configuration().available) return res.status(403).json({ error: "Active d’abord la présence Discord dans ton profil." });
    if (req.body.remember !== undefined && typeof req.body.remember !== "boolean") return res.status(400).json({ error: "Choix de mémorisation invalide." });
    try { res.setHeader("Cache-Control", "no-store"); res.json(presence.pair(user, req.body.remember === true)); }
    catch { res.status(503).json({ error: "La connexion au compagnon est temporairement indisponible." }); }
  });
  app.post("/api/auth/discord/presence/connect", (req, res) => {
    if (!configuration().available) return res.status(503).json({ error: "L’application Discord n’est pas configurée." });
    const connected = presence.connect(req.body.code);
    if (!connected) return res.status(401).json({ error: "Code invalide ou expiré." });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ...connected, clientId: configuration().clientId });
  });
  app.get("/api/discord/presence/activity", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const header = String(req.headers.authorization ?? "");
    const session = presence.session(header.startsWith("Bearer ") ? header.slice(7) : "");
    if (!session) return res.status(401).json({ error: "Compagnon déconnecté." });
    const db = readDb(), user = db.users.find((entry) => entry.id === session.userId);
    if (!eligible(user) || !user.discordPresenceEnabled || (Number(user.sessionVersion) || 0) !== session.sessionVersion || !configuration().available) {
      presence.revoke(session.userId);
      return res.status(401).json({ error: "Compagnon déconnecté." });
    }
    const room = db.rooms.find((entry) => [...(roomPresence.get(entry.id) ?? [])].some((id) => io.sockets.sockets.get(id)?.data.userId === user.id));
    res.json({ activity: discordActivityFor({ user, online: onlinePresence.has(user.id), room, game: configuredGames(db).find((entry) => entry.id === room?.gameId) }) });
  });
  app.delete("/api/discord/presence/session", (req, res) => {
    const header = String(req.headers.authorization ?? "");
    presence.disconnect(header.startsWith("Bearer ") ? header.slice(7) : "");
    res.setHeader("Cache-Control", "no-store"); res.json({ ok: true });
  });
}
