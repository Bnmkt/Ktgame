export function roomWriteScope(db, rooms) {
  const users = new Set();
  for (const room of rooms) {
    for (const player of [...(room.players ?? []), ...(room.state?.players ?? []), ...(room.ranked?.roster ?? [])]) {
      if (!player.isBot) users.add(player.id);
    }
  }
  // Include departed players and recipients whose payout is still uncommitted.
  for (const row of db.transactions.pending ?? []) users.add(row.userId);
  for (const row of db.history.pending ?? []) {
    for (const player of row.players ?? []) if (!player.isBot) users.add(player.id);
  }
  return { users: [...users], rooms: rooms.map((room) => room.id) };
}
