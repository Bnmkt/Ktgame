export function friendRoomPresence(rooms, friendId, viewer, isPresent) {
  const room = rooms.find((entry) => !entry.finished && entry.players.some((player) => player.id === friendId) && isPresent(entry.id, friendId));
  if (!room) return { inRoom: false, activeRoom: null };
  const allowed = room.isPublic || room.players.some((player) => player.id === viewer.id) || viewer.roomInvites?.some((invite) => invite.code === room.code);
  return {
    inRoom: true,
    activeRoom: allowed ? { code: room.code, name: room.name, gameId: room.gameId, playing: Boolean(room.state), hasPassword: Boolean(room.passwordHash) } : null
  };
}
