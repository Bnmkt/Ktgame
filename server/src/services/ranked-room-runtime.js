export function createRankedRoomRuntime({ cashOutPokerPlayer, removePlayerFromRoomState, finishRoomIfNeeded }) {
function stillPlaying(room,id) {
    if (room.ranked.forfeits[id] || !room.state.players.some((p)=>p.id===id)) return false;
    if (room.gameId === "president" && room.state.finishedOrder.includes(id)) return false;
    if (room.gameId === "liars-dice" && !(room.state.diceCounts[id]>0)) return false;
    if (room.gameId === "texas-holdem" && !(room.state.stacks[id]>0) && !room.state.allInPlayerIds?.includes(id)) return false;
    return true;
  }

function forfeit(room,db,id,reason="abandon") {
    if (!room.ranked || room.finished || room.ranked.forfeits[id]) return false;
    if (!stillPlaying(room,id)) return false;
    room.ranked.forfeits[id]=reason;
    if (room.gameId === "belote") {
      const team=room.ranked.roster.find((p)=>p.id===id).team;
      room.state.finished=true; room.state.winners=room.ranked.roster.filter((p)=>p.team!==team).map((p)=>p.id);
    } else if (room.gameId === "texas-holdem") cashOutPokerPlayer(room,db,id,"ranked-abandon-cash-out");
    else {
      room.players=room.players.filter((p)=>p.id!==id); removePlayerFromRoomState(room,id);
      if (room.gameId === "president") {
        const remaining=room.state.players.filter((p)=>!room.state.finishedOrder.includes(p.id));
        if (remaining.length<=1) {
          if (remaining.length) room.state.finishedOrder.push(remaining[0].id);
          room.state.finished=true;room.state.winners=room.state.finishedOrder.slice(0,1);
        } else if (!remaining.some((p)=>p.id===room.state.players[room.state.currentPlayerIndex]?.id)) {
          room.state.currentPlayerIndex=room.state.players.findIndex((p)=>p.id===remaining[0].id);
        }
      }
    }
    room.pacing=null;
    room.ranked.actionAt=Date.now(); room.ranked.turnActor=null;
    finishRoomIfNeeded(room,db);
    return true;
  }
function tickRoom(room, db, isWatching, now = Date.now()) {
  if (!room.ranked || !room.state || room.finished) return false;
  const rules = room.ranked.config;
  const before = [room.ranked.actionAt, room.ranked.turnActor, room.ranked.paused,
    Object.entries(room.ranked.offline ?? {}).map(([id, at]) => `${id}:${at}`).join("|")];
  let changed = false;
  room.ranked.offline ??= {};
  for (const player of room.ranked.roster) {
    if (!stillPlaying(room, player.id) || room.finished) continue;
    if (isWatching(room.id, player.id)) {
      if (room.ranked.offline[player.id] !== undefined && room.state.players[room.state.currentPlayerIndex]?.id === player.id) {
        room.ranked.actionAt = now;
        if (room.gameId === "texas-holdem") room.state.turnDeadline = now + room.state.turnDurationMs;
      }
      delete room.ranked.offline[player.id];
    } else room.ranked.offline[player.id] ??= now;
    if (room.ranked.offline[player.id] && now - room.ranked.offline[player.id] >= rules.reconnectSeconds * 1000) changed = forfeit(room, db, player.id, "disconnect") || changed;
  }
  if (room.finished || room.state.finished || room.pacing || room.state.nextHandAt) room.ranked.paused = true;
  else {
    if (room.ranked.paused) { room.ranked.paused = false; room.ranked.actionAt = now; }
    const actor = room.state.players[room.state.currentPlayerIndex]?.id;
    if (room.ranked.turnActor !== actor) { room.ranked.turnActor = actor; room.ranked.actionAt = now; }
    const deadline = Math.min(room.ranked.actionAt + rules.afkSeconds * 1000, room.gameId === "texas-holdem" ? room.state.turnDeadline ?? Infinity : Infinity);
    if (actor && !room.ranked.offline[actor] && now >= deadline) changed = forfeit(room, db, actor, "afk") || changed;
  }
  const after = [room.ranked.actionAt, room.ranked.turnActor, room.ranked.paused,
    Object.entries(room.ranked.offline).map(([id, at]) => `${id}:${at}`).join("|")];
  return changed || before.some((value, index) => value !== after[index]);
}
return { stillPlaying, forfeit, tickRoom };
}
