export function beloteSeats(room) {
  const ids = new Set(room.players.map((player) => player.id));
  const used = new Set();
  const seats = Array.from({ length: 4 }, (_, index) => {
    const id = room.beloteSeats?.[index];
    if (!ids.has(id) || used.has(id)) return null;
    used.add(id); return id;
  });
  for (const player of room.players) if (!used.has(player.id)) {
    const free = seats.indexOf(null);
    if (free < 0) break;
    seats[free] = player.id; used.add(player.id);
  }
  return seats;
}

export function chooseBeloteTeam(room, actorId, playerId, team) {
  if (room.gameId !== "belote" || room.state || room.finished) throw new Error("Les equipes se choisissent avant la partie.");
  const actor = room.players.find((player) => player.id === actorId && !player.isBot);
  if (!actor || (actorId !== playerId && actorId !== room.ownerId)) throw new Error("Tu peux seulement choisir ta propre equipe.");
  if (![0, 1].includes(team)) throw new Error("Equipe invalide.");
  const seats = beloteSeats(room);
  const current = seats.indexOf(playerId);
  if (current < 0) throw new Error("Joueur absent de la table.");
  if (current % 2 === team) return seats;
  const candidates = [team, team + 2];
  const destination = candidates.find((index) => !seats[index])
    ?? candidates.find((index) => room.players.find((player) => player.id === seats[index])?.isBot)
    ?? (actorId === room.ownerId ? candidates[0] : undefined);
  if (destination === undefined) throw new Error("Cette equipe est complete. Le maitre peut echanger les places.");
  [seats[current], seats[destination]] = [seats[destination], seats[current]];
  room.beloteSeats = seats;
  room.readyPlayerIds = [];
  return seats;
}
