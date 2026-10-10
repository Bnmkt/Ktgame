import { randomUUID } from "node:crypto";
import { games } from "../games/shared.js";
import { normalizeBattleModifiers, normalizeGameModifiers } from "../games/modifiers.js";
import { paidRerollPrice421 } from "../games/engines/four-twenty-one.js";
import { beloteSeats, chooseBeloteTeam } from "../games/belote-seats.js";
import { roomCredentialsError } from "./room-credentials.js";
import { roomLevelError, roomLevelLimits } from "./game-progression.js";
import { validateRankedAction } from "./ranked.js";

export function createRoomCommands(dependencies) {
  const { actionAchievementSnapshot, addTokens, advanceRoomPacing, appendRoomAchievementUnlocks, applyAction, bcrypt, blackjackHandTotal, broadcastRooms, cashOutPokerPlayer, configuredGames, consumeRoomAchievementUnlocks, didRoundFinish, displayNameFor, emitRoomUpdate, finishRoomIfNeeded, gameActionAchievementEvent, getTokenBalance, getUser, grantSpectatorAccess, io, maySpectate, platformSettings, pokerBlindsFromBigBlind, processAchievementEvent, progressionConfig, pushNotification, rankedRuntime, readDb, rejectFeature, removePlayerFromRoomState, roomCode, roomPacingActive, roomPlayerFor, roomPresence, roomTiming, roundProgressSnapshot, runBotTurns, sanitizeRoom, saveRoom, startRoomPacing, startRoomRound, startRoundResultsIfNeeded, syncRoomPlayerTokens, tableFeatureAccess, triggerRandomAchievement, unlockEligibleAchievements, userFeatureAccess, writeRoomDb } = dependencies;
  return new Map([
    ["POST /api/rooms", async (req, res) => {
  if (req.body.ranked || req.body.mode === "ranked") return res.status(403).json({ error: "Le classé passe exclusivement par la file d'attente." });
  const user = getUser(req.auth.id);
  const game = configuredGames().find((g) => g.id === req.body.gameId);
  if (!user || !game || game.enabled === false) return res.status(400).json({ error: "Création impossible." });
  const roomAccess = userFeatureAccess(user, "rooms:create");
  if (!roomAccess.allowed) return rejectFeature(res, roomAccess);
  const gameAccess = userFeatureAccess(user, `game:${game.id}`);
  if (!gameAccess.allowed) return rejectFeature(res, gameAccess);
  const settings = platformSettings();
  const name = String(req.body.name ?? "").trim();
  let limits;
  try { limits = roomLevelLimits(req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const levelError = roomLevelError(user, { gameId: game.id, ...limits }, settings.gameProgression);
  if (levelError) return res.status(400).json({ error: levelError });
  const password = String(req.body.password ?? "");
  const credentialsError = await roomCredentialsError({ name, password, user }, bcrypt.compare);
  if (credentialsError) return res.status(400).json({ error: credentialsError });
  const minimumStake = Math.max(game.id === "texas-holdem" ? settings.minPokerBuyIn : settings.minRoomStake, Number(game.entryPot) || 0);
  const stake = Math.max(minimumStake, Number(req.body.stake || minimumStake));
  if (user.tokens < stake) return res.status(400).json({ error: "Jetons insuffisants." });
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const room = {
    id: req.roomId ?? randomUUID(),
    code: roomCode(),
    gameId: game.id,
    name: name || (displayNameFor(user).includes("@") ? game.name : `${game.name} de ${displayNameFor(user)}`),
    ...limits,
    passwordHash,
    isPublic: req.body.isPublic !== false,
    stake,
    pokerBlinds: game.id === "texas-holdem" ? { ...pokerBlindsFromBigBlind(settings.pokerDefaultBigBlind), maximumBet: stake } : undefined,
    pokerTurnSeconds: game.id === "texas-holdem" ? settings.pokerTurnSeconds : undefined,
    battleModifiers: game.id === "bataille" ? normalizeBattleModifiers(game.defaultModifiers) : undefined,
    gameModifiers: normalizeGameModifiers(game.id, game.defaultModifiers),
    readyPlayerIds: [user.id],
    ownerId: user.id,
    players: [roomPlayerFor(user)],
    state: null,
    finished: false,
    createdAt: new Date().toISOString()
  };
  saveRoom(room);
  broadcastRooms();
  res.json(sanitizeRoom(room, req.auth.id));
}],
    ["POST /api/rooms/:code/join", async (req, res) => {
  const user = getUser(req.auth.id);
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase());
  const game = room && games.find((g) => g.id === room.gameId);
  if (room?.ranked && !room.ranked.config.spectators && !room.ranked.roster.some((p)=>p.id===req.auth.id)) return res.status(403).json({error:"Spectateurs désactivés pour cette partie classée."});
  if (!user || !room || !game) return res.status(404).json({ error: "Table introuvable." });
  const roomAccess = userFeatureAccess(user, "rooms:join", db);
  if (!roomAccess.allowed) return rejectFeature(res, roomAccess);
  const gameAccess = userFeatureAccess(user, `game:${room.gameId}`, db);
  if (!gameAccess.allowed) return rejectFeature(res, gameAccess);
  if (room.players.some((p) => p.id === user.id)) return res.json(sanitizeRoom(room, req.auth.id));
  if (room.passwordHash && !maySpectate(room, user.id) && !(await bcrypt.compare(String(req.body.password ?? ""), room.passwordHash))) return res.status(403).json({ error: "Mot de passe de table requis ou invalide." });
  if (room.state) {
    grantSpectatorAccess(room, user.id);
    return res.json(sanitizeRoom(room, user.id, db, true));
  }
  if (room.players.length >= game.maxPlayers) return res.status(400).json({ error: "Table complète." });
  if (user.tokens < room.stake) return res.status(400).json({ error: "Jetons insuffisants." });
  const levelError = roomLevelError(user, room, progressionConfig(db));
  if (levelError) return res.status(403).json({ error: levelError });
  room.players.push(roomPlayerFor(user));
  if (room.gameId === "belote") room.beloteSeats = beloteSeats(room);
  writeRoomDb(db, room);
  broadcastRooms();
  emitRoomUpdate(room);
  res.json(sanitizeRoom(room, req.auth.id));
}],
    ["POST /api/rooms/:code/spectate", async (req, res) => {
  const room = readDb().rooms.find((entry) => entry.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const user = getUser(req.auth.id);
  const roomAccess = userFeatureAccess(user, "rooms:join");
  if (!roomAccess.allowed) return rejectFeature(res, roomAccess);
  const gameAccess = userFeatureAccess(user, `game:${room.gameId}`);
  if (!gameAccess.allowed) return rejectFeature(res, gameAccess);
  if (!maySpectate(room, req.auth.id) && room.passwordHash && !(await bcrypt.compare(String(req.body.password ?? ""), room.passwordHash))) return res.status(403).json({ error: "Mot de passe de table requis ou invalide." });
  grantSpectatorAccess(room, req.auth.id);
  res.json(sanitizeRoom(room, req.auth.id, undefined, true));
}],
    ["POST /api/rooms/:code/belote-team", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  try {
    chooseBeloteTeam(room, req.auth.id, String(req.body.playerId ?? req.auth.id), req.body.team);
    writeRoomDb(db, room); emitRoomUpdate(room, db);
    res.json(sanitizeRoom(room, req.auth.id, db));
  } catch (error) { res.status(400).json({ error: error.message }); }
}],
    ["DELETE /api/rooms/:code", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  if (room.ownerId !== req.auth.id) return res.status(403).json({ error: "Seul le créateur peut fermer cette table." });
  if (room.state?.gameId === "texas-holdem") {
    for (const player of [...room.players]) cashOutPokerPlayer(room, db, player.id, "poker-table-closed");
  }
  db.rooms = db.rooms.filter((r) => r.id !== room.id);
  writeRoomDb(db, room);
  io.to(room.id).emit("room-closed", { code: room.code });
  broadcastRooms();
  res.json({ ok: true });
}],
    ["POST /api/rooms/:code/kick", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && !r.finished);
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  if (room.ownerId !== req.auth.id) return res.status(403).json({ error: "Seul le maître peut exclure un joueur." });
  const playerId = String(req.body.playerId ?? "");
  if (!playerId || playerId === room.ownerId) return res.status(400).json({ error: "Joueur impossible à exclure." });
  if (!room.players.some((p) => p.id === playerId)) return res.status(404).json({ error: "Joueur introuvable à cette table." });
  const excludedUser = db.users.find((entry) => entry.id === playerId);
  const exclusion = { type: "room-exclusion", title: "Vous avez été exclu", message: `Le maître vous a exclu de la table « ${room.name} ».`, actorId: room.ownerId, roomCode: room.code };
  const notification = excludedUser ? pushNotification(excludedUser, exclusion) : { ...exclusion, id: randomUUID(), createdAt: new Date().toISOString() };
  if (room.state?.gameId === "texas-holdem") cashOutPokerPlayer(room, db, playerId, "poker-kicked-cash-out");
  else {
    room.players = room.players.filter((p) => p.id !== playerId);
    removePlayerFromRoomState(room, playerId);
  }
  if (!room.state) {
    const humans = room.players.filter((player) => !player.isBot);
    if (humans.length === 1) room.readyPlayerIds = [...new Set([...(room.readyPlayerIds ?? []), humans[0].id])];
  }
  if (room.state && !room.state.finished) runBotTurns(room, db);
  finishRoomIfNeeded(room, db);
  writeRoomDb(db, room, [playerId]);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  // Notify before the room update and revoke every live subscription of this player.
  for (const socketId of [...(roomPresence.get(room.id) ?? [])]) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.data.userId !== playerId) continue;
    socket.emit("room-player-kicked", { code: room.code, playerId, reason: "owner", notification });
    socket.leave(room.id);
    roomPresence.get(room.id)?.delete(socketId);
    delete socket.data.roomId;
  }
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(safeRoom);
}],
    ["POST /api/rooms/:code/bot", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && r.ownerId === req.auth.id && !r.state);
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const game = games.find((g) => g.id === room.gameId);
  if (room.players.length >= game.maxPlayers) return res.status(400).json({ error: "Table complète." });
  room.players.push({ id: randomUUID(), pseudo: `Bot ${room.players.length}`, tokens: platformSettings(db).signupTokens, isBot: true, guest: true });
  if (room.gameId === "belote") room.beloteSeats = beloteSeats(room);
  writeRoomDb(db, room);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(sanitizeRoom(room, req.auth.id));
}],
    ["POST /api/rooms/:code/poker-settings", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && !entry.state && entry.gameId === "texas-holdem");
  if (!room) return res.status(404).json({ error: "Réglages de table indisponibles." });
  const requestedBigBlind = Math.floor(Number(req.body.bigBlind));
  if (!Number.isFinite(requestedBigBlind) || requestedBigBlind < 2) return res.status(400).json({ error: "La grosse blinde doit être d'au moins 2 jetons." });
  if (requestedBigBlind % 2) return res.status(400).json({ error: "La grosse blinde doit être paire afin que la petite blinde vaille exactement sa moitié." });
  const { smallBlind, bigBlind } = pokerBlindsFromBigBlind(requestedBigBlind);
  const maximumBet = Math.floor(Number(req.body.maximumBet));
  if (!Number.isFinite(maximumBet) || maximumBet < bigBlind) return res.status(400).json({ error: "La mise maximale doit être supérieure ou égale à la grosse blinde." });
  room.pokerBlinds = { smallBlind, bigBlind, maximumBet };
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  res.json(safeRoom);
}],
    ["POST /api/rooms/:code/battle-settings", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && !entry.state && entry.gameId === "bataille");
  if (!room) return res.status(404).json({ error: "Modificateurs de Bataille indisponibles." });
  room.battleModifiers = normalizeBattleModifiers(req.body);
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(safeRoom);
}],
    ["POST /api/rooms/:code/game-settings", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && !entry.state);
  if (!room) return res.status(404).json({ error: "Réglages de table indisponibles." });
  room.gameModifiers = normalizeGameModifiers(room.gameId, req.body);
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  res.json(safeRoom);
}],
    ["POST /api/rooms/:code/level-settings", (req, res) => {
  try {
    const db = readDb(), room = db.rooms.find((row) => row.code === req.params.code.toUpperCase() && row.ownerId === req.auth.id && !row.state);
    if (!room) return res.status(404).json({ error: "Table en attente introuvable." });
    const access = tableFeatureAccess(getUser(req.auth.id), room, db);
    if (!access.allowed) return rejectFeature(res, access);
    const limits = roomLevelLimits(req.body), config = progressionConfig(db);
    for (const player of room.players.filter((row) => !row.isBot)) {
      const error = roomLevelError(db.users.find((user) => user.id === player.id) ?? player, { ...room, ...limits }, config);
      if (error) return res.status(400).json({ error: `${player.pseudo} : ${error}` });
    }
    Object.assign(room, limits); writeRoomDb(db, room); emitRoomUpdate(room); broadcastRooms();
    res.json(sanitizeRoom(room, req.auth.id, db));
  } catch (error) { res.status(400).json({ error: error.message }); }
}],
    ["POST /api/rooms/:code/leave", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && !entry.finished);
  if (!room || !room.players.some((entry) => entry.id === req.auth.id)) return res.status(404).json({ error: "Table introuvable." });
  if (room.ranked) {
    rankedRuntime.forfeit(room,db,req.auth.id);writeRoomDb(db,room,[req.auth.id]);emitRoomUpdate(room);broadcastRooms();return res.json({ok:true});
  }
  if (room.state?.gameId === "texas-holdem") cashOutPokerPlayer(room, db, req.auth.id);
  else {
    room.players = room.players.filter((entry) => entry.id !== req.auth.id);
    removePlayerFromRoomState(room, req.auth.id);
  }
  if (room.gameId === "belote" && room.state && !room.state.finished) {
    if (room.ownerId === req.auth.id) room.ownerId = room.players.find((player) => !player.isBot)?.id ?? room.ownerId;
    runBotTurns(room, db);
  }
  if (!room.state) {
    const humans = room.players.filter((player) => !player.isBot);
    if (humans.length === 1) room.readyPlayerIds = [...new Set([...(room.readyPlayerIds ?? []), humans[0].id])];
  }
  finishRoomIfNeeded(room, db);
  writeRoomDb(db, room, [req.auth.id]);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json({ ok: true });
}],
    ["POST /api/rooms/:code/ready", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && !entry.state && !entry.finished);
  if (!room || !room.players.some((player) => player.id === req.auth.id && !player.isBot)) return res.status(404).json({ error: "Table introuvable." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  room.readyPlayerIds ??= [];
  room.readyPlayerIds = room.readyPlayerIds.includes(req.auth.id) ? room.readyPlayerIds.filter((id) => id !== req.auth.id) : [...room.readyPlayerIds, req.auth.id];
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  res.json(safeRoom);
}],
    ["POST /api/rooms/:code/start", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && r.ownerId === req.auth.id && !r.state);
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  const game = configuredGames(db).find((entry) => entry.id === room.gameId);
  if (!game) return res.status(404).json({ error: "Jeu introuvable." });
  const humans = room.players.filter((player) => !player.isBot);
  if (humans.length === 1) room.readyPlayerIds = [...new Set([...(room.readyPlayerIds ?? []), humans[0].id])];
  while (room.players.length < game.minPlayers && room.players.length < game.maxPlayers) {
    room.players.push({ id: randomUUID(), pseudo: `Bot ${room.players.filter((player) => player.isBot).length + 1}`, tokens: platformSettings(db).signupTokens, isBot: true, guest: true });
  }
  const waitingHumans = room.players.filter((player) => !player.isBot && player.id !== room.ownerId && !(room.readyPlayerIds ?? []).includes(player.id));
  if (waitingHumans.length) return res.status(400).json({ error: `Tous les joueurs doivent être prêts (${waitingHumans.map((player) => player.pseudo).join(", ")}).` });
  const error = startRoomRound(room, db);
  if (error === "missing") return res.status(404).json({ error: "Jeu introuvable." });
  if (error) return res.status(400).json({ error });
  const achievementUnlocks = consumeRoomAchievementUnlocks(room, req.auth.id);
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json({ ...safeRoom, achievementUnlocks });
}],
    ["POST /api/rooms/:code/replay", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && r.ownerId === req.auth.id && r.finished);
  if (!room) return res.status(404).json({ error: "Replay indisponible." });
  room.state = null;
  room.pacing = null;
  const humans = room.players.filter((player) => !player.isBot);
  room.readyPlayerIds = humans.length === 1 ? [humans[0].id] : [];
  room.finished = false;
  room.createdAt = new Date().toISOString();
  syncRoomPlayerTokens(room, db);
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(safeRoom);
}],
    ["POST /api/rooms/:code/replay-now", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && entry.finished && entry.gameId === "blackjack");
  if (!room) return res.status(404).json({ error: "Nouvelle manche de Blackjack indisponible." });
  const error = startRoomRound(room, db);
  if (error === "missing") return res.status(404).json({ error: "Jeu introuvable." });
  if (error) return res.status(400).json({ error });
  room.createdAt = new Date().toISOString();
  const achievementUnlocks = consumeRoomAchievementUnlocks(room, req.auth.id);
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json({ ...safeRoom, achievementUnlocks });
}],
    ["POST /api/rooms/:code/action", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase());
  if (!room?.state) return res.status(404).json({ error: "Partie non démarrée." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  if (!room.players.some((player) => player.id === req.auth.id && !player.isBot) || !room.state.players.some((player) => player.id === req.auth.id && !player.isBot)) return res.status(403).json({ error: "Un spectateur ne peut pas jouer." });
  if (room.finished && !(room.state.gameId === "texas-holdem" && req.body.type === "show")) return res.status(404).json({ error: "Cette partie est terminée." });
  const pacingAdvanced = room.pacing && !roomPacingActive(room) ? advanceRoomPacing(room, db) : false;
  const actionAllowedDuringPacing = (room.state.gameId === "texas-holdem" && req.body.type === "show")
    || (room.pacing?.kind === "turn-end" && room.pacing.actorIsBot && room.state.gameId === "midnight-dice" && room.state.phase === "contract" && req.body.type === "choose-contract");
  if (roomPacingActive(room) && !actionAllowedDuringPacing) {
    if (pacingAdvanced) {
      writeRoomDb(db, room);
      emitRoomUpdate(room, db);
    }
    const pacingError = room.pacing.kind === "round-results"
      ? "La manche suivante commencera après les résultats."
      : room.pacing.kind === "bot-thinking"
        ? "L'IA prépare encore son coup."
        : "Le tour précédent est encore affiché.";
    return res.status(409).json({ error: pacingError });
  }
  try {
    if (room.ranked) validateRankedAction(room.state, req.auth.id, req.body);
    const actionPlayer = room.state.players?.find((player) => player.id === req.auth.id);
    const turnBeforeActionPlayerId = room.state.players?.[room.state.currentPlayerIndex]?.id ?? "";
    const achievementSnapshot = actionAchievementSnapshot(room.state, req.auth.id);
    const roundBeforeAction = roundProgressSnapshot(room.state);
    const actionNow = Date.now();
    if (req.body.type === "roll" && !actionPlayer?.isBot && (room.state.rollAvailableAt?.[req.auth.id] ?? 0) > actionNow) throw new Error("Laisse les dés terminer leur lancer avant de relancer.");
    if (room.state.gameId === "blackjack" && req.body.type === "bet") {
      const minimumBet = Math.max(1, Number(room.state.modifiers?.minimumBet) || 1);
      const maximumBet = Math.max(minimumBet, Number(room.state.modifiers?.maximumBet) || minimumBet);
      const amount = Math.floor(Number(req.body.amount) || 0);
      if (amount < minimumBet) throw new Error(`La mise minimale est de ${minimumBet} jetons.`);
      if (amount > maximumBet) throw new Error(`La mise maximale est de ${maximumBet} jetons.`);
      if (room.state.bets[req.auth.id]) throw new Error("Mise déjà placée.");
      if (getTokenBalance(db, req.auth.id) < amount) throw new Error("Jetons insuffisants.");
      addTokens(db, req.auth.id, -amount, { gameId: room.gameId, roomId: room.id, reason: "blackjack-bet" });
      appendRoomAchievementUnlocks(room, req.auth.id, unlockEligibleAchievements(db.users.find((u) => u.id === req.auth.id), db));
      triggerRandomAchievement(db, req.auth.id, room);
      syncRoomPlayerTokens(room, db);
    }
    if (room.state.gameId === "blackjack" && req.body.type === "double") {
      const originalBet = Number(room.state.bets?.[req.auth.id]) || 0;
      const hand = room.state.hands?.[req.auth.id] ?? [];
      if (!originalBet || hand.length !== 2) throw new Error("Le doublement est disponible uniquement sur les deux cartes initiales.");
      if (Object.keys(room.state.bets ?? {}).length < room.state.players.filter((player) => !player.isBot).length) throw new Error("Toutes les mises doivent être placées avant de doubler.");
      if ((room.state.completedPlayerIds ?? []).includes(req.auth.id)) throw new Error("Ta main est déjà terminée.");
      if (blackjackHandTotal(hand) === 21) throw new Error("Une main de 21 ne peut pas être doublée.");
      if (getTokenBalance(db, req.auth.id) < originalBet) throw new Error("Jetons insuffisants pour doubler la mise.");
      addTokens(db, req.auth.id, -originalBet, { gameId: room.gameId, roomId: room.id, reason: "blackjack-double" });
      appendRoomAchievementUnlocks(room, req.auth.id, unlockEligibleAchievements(db.users.find((u) => u.id === req.auth.id), db));
      triggerRandomAchievement(db, req.auth.id, room);
      syncRoomPlayerTokens(room, db);
    }
    if (room.state.gameId === "421" && req.body.type === "buy-reroll") {
      if (!room.state.modifiers?.paidRerollsEnabled) throw new Error("Les relances payantes sont désactivées.");
      if (room.state.players?.[room.state.currentPlayerIndex]?.id !== req.auth.id) throw new Error("Ce n'est pas ton tour.");
      if (room.state.rollsLeft > 0 || room.state.dice?.length !== 3) throw new Error("Cette relance sera disponible après les lancers gratuits.");
      const used = Number(room.state.paidRerollsUsed?.[req.auth.id]) || 0;
      if (used >= (room.state.modifiers?.paidRerollsPerTurn ?? 2)) throw new Error("Limite de relances payantes atteinte pour ce tour.");
      const amount = paidRerollPrice421(room.state, req.auth.id);
      if (getTokenBalance(db, req.auth.id) < amount) throw new Error("Jetons insuffisants pour acheter cette relance.");
      addTokens(db, req.auth.id, -amount, { gameId: room.gameId, roomId: room.id, reason: "421-paid-reroll" });
      syncRoomPlayerTokens(room, db);
    }
    room.state = applyAction(room.state, req.auth.id, req.body);
    if (room.ranked && !["show","auto-check-fold"].includes(req.body.type)) rankedRuntime.action(room);
    processAchievementEvent(db, req.auth.id, gameActionAchievementEvent(room, req.auth.id, req.body, achievementSnapshot), room);
    if (req.body.type === "roll" && !actionPlayer?.isBot) room.state.rollAvailableAt = { ...(room.state.rollAvailableAt ?? {}), [req.auth.id]: Date.now() + 700 };
    const showingRoundResults = startRoundResultsIfNeeded(room, roundBeforeAction, actionPlayer);
    if (!showingRoundResults) {
      const turnAfterActionPlayerId = room.state.players?.[room.state.currentPlayerIndex]?.id ?? "";
      const humanTurnEnded = !room.state.finished
        && room.state.gameId !== "bataille"
        && turnBeforeActionPlayerId === req.auth.id
        && (turnAfterActionPlayerId !== turnBeforeActionPlayerId || didRoundFinish(roundBeforeAction, room.state));
      if (humanTurnEnded && !roomPacingActive(room)) {
        const timing = roomTiming(room);
        startRoomPacing(room, "turn-end", timing.turnEndDelayMs, {
          actorId: actionPlayer?.id ?? req.auth.id,
          actorName: actionPlayer?.pseudo ?? "Le joueur",
          actorIsBot: false
        });
      } else {
        runBotTurns(room, db);
      }
    }
    finishRoomIfNeeded(room, db);
    const achievementUnlocks = consumeRoomAchievementUnlocks(room, req.auth.id);
    writeRoomDb(db, room);
    const safeRoom = sanitizeRoom(room, req.auth.id, db);
    emitRoomUpdate(room, db);
    res.json({ ...safeRoom, achievementUnlocks });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}],
    ["POST /api/rooms/:code/pacing/skip", (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase());
  if (!room?.state || !room.pacing) return res.status(404).json({ error: "Aucune attente à passer." });
  if (!room.players.some((player) => player.id === req.auth.id && !player.isBot)) return res.status(403).json({ error: "Seuls les joueurs assis peuvent accélérer la partie." });
  if (req.body?.pacingId && req.body.pacingId !== room.pacing.id) return res.status(409).json({ error: "Cette attente est déjà terminée." });
  room.pacing.endsAt = Date.now();
  advanceRoomPacing(room, db, Date.now());
  finishRoomIfNeeded(room, db);
  writeRoomDb(db, room);
  const safeRoom = sanitizeRoom(room, req.auth.id, db);
  emitRoomUpdate(room, db);
  res.json(safeRoom);
}]
  ]);
}
