export function friendTables(rooms, friends) {
  const ids = new Set(friends.map((friend) => friend.id));
  const visible = rooms.filter((room) => room.inProgress && room.players?.some((player) => ids.has(player.id)));
  for (const friend of friends) if (friend.activeRoom?.playing) visible.push(friend.activeRoom);
  return [...new Map(visible.map((room) => [room.code, room])).values()].slice(0, 5);
}
