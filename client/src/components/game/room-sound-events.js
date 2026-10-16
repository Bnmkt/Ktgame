export function roomSoundSnapshot(room) {
  return { match: room?.activityMatchId ?? "", playing: Boolean(room?.state && !room.state.finished), logs: (room?.state?.logs ?? []).map(({ id }) => id) };
}

export function roomSoundEvent(previous, room, now = Date.now()) {
  if (!previous || !room) return null;
  const next = roomSoundSnapshot(room);
  if (next.playing && (!previous.playing || next.match !== previous.match)) return "start";
  // Old logs can arrive after reconnecting; never play those as live actions.
  return [...(room.state?.logs ?? [])].reverse().find(log => !previous.logs.includes(log.id) &&
    ["dice", "card"].includes(log.cue) && Math.abs(now - Date.parse(log.at)) < 10000)?.cue ?? null;
}
