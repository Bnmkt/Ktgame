// Gateway projections are immutable between owner commits. Re-index only on
// collection replacement/rollback; normal commits update one room's memberships.
export function createRoomDirectory(readRooms) {
  let source, length;
  const rooms = new Map(), codes = new Map(), users = new Map();
  const members = (room) => new Set([...(room.players ?? []), ...(room.ranked?.roster ?? [])].map(({ id }) => id));
  function add(room) {
    rooms.set(room.id, room); codes.set(room.code, room);
    for (const id of members(room)) { if (!users.has(id)) users.set(id, new Set()); users.get(id).add(room.id); }
  }
  function refresh() {
    const rows = readRooms();
    if (rows === source && rows.length === length) return;
    source = rows; length = rows.length; rooms.clear(); codes.clear(); users.clear();
    for (const room of rows) add(room);
  }
  return {
    get(id) { refresh(); return rooms.get(id); },
    code(value) { refresh(); return codes.get(value); },
    related(ids) {
      refresh(); const selected = new Set();
      for (const id of ids) for (const roomId of users.get(id) ?? []) selected.add(roomId);
      return [...selected].map((id) => rooms.get(id));
    },
    committed(room) {
      const previous = rooms.get(room?.id); refresh();
      if (!room || source !== readRooms()) return;
      if (previous) {
        codes.delete(previous.code);
        for (const id of members(previous)) { users.get(id)?.delete(previous.id); if (!users.get(id)?.size) users.delete(id); }
      }
      add(room);
    }
  };
}
