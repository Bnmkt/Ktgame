export const ROOM_INACTIVITY_MS = 60 * 60 * 1000;

export function lastRoomActionAt(room) {
  const recorded = Date.parse(room.lastActionAt);
  if (Number.isFinite(recorded)) return recorded;
  const humans = new Set([...(room.players ?? []), ...(room.state?.players ?? [])].filter((player) => !player.isBot).map(({ id }) => id));
  return Math.max(0, ...[room.createdAt, ...(room.state?.logs ?? []).filter((log) => humans.has(log.actorId)).map((log) => log.at)].map(Date.parse).filter(Number.isFinite));
}

export function roomIsInactive(room, now = Date.now()) {
  const last = lastRoomActionAt(room);
  return last > 0 && now - last >= ROOM_INACTIVITY_MS;
}

export function touchRoom(room, now = Date.now()) {
  room.lastActionAt = new Date(now).toISOString();
}

export function releaseRoomPresence(roomId, io, presence) {
  for (const id of presence.get(roomId) ?? []) {
    const socket = io.sockets.sockets.get(id);
    socket?.leave(roomId);
    socket?.leave(`chat:room:${roomId}`);
    if (socket?.data.roomId === roomId) delete socket.data.roomId;
  }
  presence.delete(roomId);
}

export function closeRoom(room, db, dependencies, { reason = "owner", actorId = "", now = Date.now() } = {}) {
  if (!db.rooms.some((target) => target.id === room.id)) return false;
  const { addTokens, cashOutPokerPlayer, finishRoomIfNeeded, writeRoomDb, io, roomPresence, broadcastRooms, pushNotification, getUser } = dependencies;
  const participants = [...room.players];
  const unfinished = !room.finished && !room.state?.finished;
  if (room.state?.finished && !room.finished) finishRoomIfNeeded(room, db);
  if (room.ranked && room.state && unfinished && reason !== "owner") {
    room.ranked.cancelled = { reason: reason === "inactivity" ? "Table fermée après une heure d'inactivité." : "Table fermée par un administrateur.", by: actorId || "system", at: new Date(now).toISOString() };
    for (const player of room.ranked.roster.filter((row) => !row.isBot)) {
      const refund = room.stake - (room.state.departedPayouts?.[player.id] ?? 0);
      if (refund > 0 && getUser(player.id)) addTokens(db, player.id, refund, { gameId: room.gameId, roomId: room.id, reason: "ranked-technical-refund" });
    }
    room.state.finished = true;
    room.state.winners = [];
    room.pacing = null;
    finishRoomIfNeeded(room, db);
  } else if (room.state?.gameId === "texas-holdem" && unfinished) {
    for (const player of [...room.players]) if (player.isBot || getUser(player.id)) cashOutPokerPlayer(room, db, player.id, "poker-table-closed");
  } else if (reason === "inactivity" && room.state && unfinished) {
    for (const player of room.players.filter((row) => !row.isBot)) {
      const refund = (Number(room.stake) || 0) + (room.gameId === "blackjack" ? Number(room.state.bets?.[player.id]) || 0 : 0);
      if (refund > 0 && getUser(player.id)) addTokens(db, player.id, refund, { gameId: room.gameId, roomId: room.id, reason: "room-inactivity-refund" });
    }
  }
  if (reason === "inactivity" && unfinished) {
    for (const player of participants.filter((row) => !row.isBot)) {
      const user = getUser(player.id);
      if (user && !user.guest) pushNotification(user, { type: "room-inactivity", title: "Table fermée pour inactivité", message: `La table « ${room.name} » a été fermée automatiquement après une heure sans action des joueurs.`, roomCode: room.code });
    }
  }
  db.rooms = db.rooms.filter((target) => target.id !== room.id);
  writeRoomDb(db, room);
  io.to(room.id).emit("room-closed", { code: room.code, ...(reason === "inactivity" ? { reason, unfinished } : {}) });
  releaseRoomPresence(room.id, io, roomPresence);
  broadcastRooms();
  return true;
}
