export function applyRoomPatch(rooms, patch) {
  const next = new Map(rooms.map((room) => [room.id, room]));
  for (const id of patch.remove ?? []) next.delete(id);
  for (const room of patch.upsert ?? []) next.set(room.id, room);
  return [...next.values()];
}
