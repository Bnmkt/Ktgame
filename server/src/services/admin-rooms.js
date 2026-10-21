export function adminRoomList(db, displayNameFor) {
  const users = new Map(db.users.map((user) => [user.id, user]));
  return db.rooms.map((room) => ({
    id: room.id,
    code: room.code,
    name: room.name,
    gameId: room.gameId,
    ownerName: users.has(room.ownerId) ? displayNameFor(users.get(room.ownerId)) : room.players.find((player) => player.id === room.ownerId)?.pseudo ?? "Casino",
    players: room.players.map(({ id, pseudo, isBot }) => ({ id, pseudo, isBot: Boolean(isBot) })),
    isPublic: Boolean(room.isPublic),
    protected: Boolean(room.passwordHash),
    ranked: Boolean(room.ranked),
    status: room.finished ? "finished" : room.state ? "playing" : "waiting",
    createdAt: room.createdAt
  }));
}
