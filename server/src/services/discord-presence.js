import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { discordAgeAllowed } from "./discord-oauth.js";
import { gameImageUrl } from "../../../client/src/features/games/presentation.js";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");

function publicImage(value, websiteUrl, apiUrl) {
  const source = gameImageUrl(value);
  if (!source) return "";
  try {
    const url = new URL(source, source.startsWith("/api/") ? apiUrl : `${websiteUrl.replace(/\/$/, "")}/`);
    return url.protocol === "https:" && !url.username && !url.password && url.href.length <= 512 ? url.href : "";
  } catch { return ""; }
}

export function discordActivityFor({ user, online, room, game, websiteUrl = "https://www.ktga.me", apiUrl = "https://api.ktga.me" }) {
  if (!online || !user?.discordPresenceEnabled || user.guest || user.active === false) return null;
  // Public progress only: never spread game state, identities, cards, chat or ratings.
  const seated = Boolean(room?.players?.some((player) => player.id === user.id));
  const finished = room?.finished || room?.state?.finished;
  const labels = [room ? finished ? "Partie terminée" : room.state ? seated ? "En partie" : "Spectateur" : "En salle d’attente" : "Au casino"];
  if (room) labels.push(room.ranked ? "Classé" : "Classique");
  if (room?.state && !finished) {
    const state = room.state;
    if (Number.isSafeInteger(state.round) && state.round > 0) {
      const rounds = state.modifiers?.rounds;
      labels.push(`Manche ${state.round}${Number.isSafeInteger(rounds) && rounds >= state.round ? `/${rounds}` : ""}`);
    } else if (room.gameId === "texas-holdem") {
      const street = { preflop: "Préflop", flop: "Flop", turn: "Turn", river: "River", showdown: "Abattage" }[state.street];
      if (street) labels.push(street);
    }
    if (seated && state.players?.[state.currentPlayerIndex]?.id === user.id) labels.push("À mon tour");
  }
  const activity = {
    details: room && game ? String(game.name).slice(0, 128) : "KTGA.ME",
    state: labels.join(" · ").slice(0, 128),
    type: 0
  };
  const logo = publicImage("/pwa/icon-512.png", websiteUrl, apiUrl);
  const artwork = game && (publicImage(game.coverImage, websiteUrl, apiUrl) || publicImage(game.descriptiveImage, websiteUrl, apiUrl));
  const icon = game && publicImage(game.discordIconImage, websiteUrl, apiUrl);
  if (artwork || icon || logo) activity.assets = {
    large_image: artwork || icon || logo, large_text: room && game ? String(game.name).slice(0, 128) : "KTGA.ME",
    ...((icon || logo) && { small_image: icon || logo, small_text: room?.ranked ? "KTGA.ME · Classé" : "KTGA.ME" })
  };
  const count = room?.players?.length, maximum = room?.ranked?.roster?.length || game?.maxPlayers;
  if (Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(maximum) && maximum >= count) activity.party = { size: [count, maximum] };
  try {
    const website = new URL(websiteUrl);
    if (website.protocol === "https:" && !website.username && !website.password) {
      website.search = ""; website.hash = "";
      const base = website.href.replace(/\/$/, "");
      activity.buttons = [{ label: "Jouer sur KTGA.ME", url: base }];
      // Invitations are opt-in and never expose a protected, private or ranked room.
      if (user.discordPresenceJoinEnabled === true && seated && !finished && !room.state && room.isPublic === true && !room.passwordHash && !room.ranked && count < maximum && /^[A-Z0-9]{4,12}$/.test(room.code ?? "")) {
        activity.buttons.unshift({ label: "Rejoindre la table", url: `${base}/table/${room.code}` });
      }
    }
  } catch {}
  return activity;
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
  io, roomPresence, configuredGames, configuration, publicWebsiteUrl = () => "https://www.ktga.me", accountBlocked, presence = createDiscordPresence() }) {
  function eligible(user) { return user && !user.guest && !isUnder13(user) && discordAgeAllowed(user) && user.active !== false && !accountBlocked(user); }
  app.get("/api/me/discord/presence", auth, (req, res) => {
    const user = readDb().users.find((entry) => entry.id === req.auth.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({ enabled: Boolean(user?.discordPresenceEnabled), joinEnabled: user?.discordPresenceJoinEnabled === true, available: Boolean(eligible(user) && configuration().available), transport: "companion" });
  });
  app.patch("/api/me/discord/presence", auth, (req, res) => {
    const db = readDb(), user = db.users.find((entry) => entry.id === req.auth.id);
    if (!eligible(user)) return res.status(403).json({ error: "La présence Discord est réservée aux comptes de 13 ans et plus." });
    if ((!Object.hasOwn(req.body, "enabled") && !Object.hasOwn(req.body, "joinEnabled")) || ["enabled", "joinEnabled"].some((field) => Object.hasOwn(req.body, field) && typeof req.body[field] !== "boolean")) return res.status(400).json({ error: "Choisis d’activer ou de désactiver la présence." });
    if (req.body.enabled && !configuration().available) return res.status(503).json({ error: "L’application Discord n’est pas configurée." });
    if (Object.hasOwn(req.body, "enabled")) { user.discordPresenceEnabled = req.body.enabled; presence.revoke(user.id); }
    if (Object.hasOwn(req.body, "joinEnabled")) user.discordPresenceJoinEnabled = req.body.joinEnabled;
    writeDb(db, { users: [user.id], rooms: [] });
    res.json({ enabled: Boolean(user.discordPresenceEnabled), joinEnabled: user.discordPresenceJoinEnabled === true });
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
    const activity = discordActivityFor({ user, online: onlinePresence.has(user.id), room, game: configuredGames(db).find((entry) => entry.id === room?.gameId), websiteUrl: publicWebsiteUrl(), apiUrl: configuration().redirectUri });
    res.json({ activity, context: activity ? hash(room ? `${room.id}:${room.activityMatchId ?? (room.state ? "playing" : "waiting")}` : "casino") : "" });
  });
  app.delete("/api/discord/presence/session", (req, res) => {
    const header = String(req.headers.authorization ?? "");
    presence.disconnect(header.startsWith("Bearer ") ? header.slice(7) : "");
    res.setHeader("Cache-Control", "no-store"); res.json({ ok: true });
  });
}
