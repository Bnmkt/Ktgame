import { randomUUID } from "node:crypto";
import { createGameWorkers } from "./game-workers.js";

const conflict = () => Object.assign(new Error("La table a change pendant le traitement. Reessaie."), { code: "GAME_CONFLICT" });
const userFields = ["id", "pseudo", "tokens", "guest", "active", "profile", "cosmetics", "gameXp", "moderation", "registrationAuthorization", "parentalAccess"];

// The Gateway supplies a sparse account view and commits effects against fresh
// revisions. A Game Worker never opens SQLite or writes an account directly.
export function createGameGateway(dependencies) {
  const { readDb, updateDb, revision, settingsRevision, configuration, getUser, sessions,
    addTokens, processAchievementEvent, unlockEligibleAchievements, appendRoomAchievementUnlocks,
    triggerRandomAchievement, finishRoomIfNeeded, consumeRoomAchievementUnlocks,
    roomWriteScope, sanitizeRoom, emitRoomUpdate, broadcastRooms, grantSpectatorAccess,
    maySpectate, ensureUserSocial, invalidateInbox, io, roomPresence, validateActor } = dependencies;
  const snapshot = (id) => readDb().rooms.find((room) => room.id === id);
  let writeLease;
  dependencies.setRoomMutationGuard?.((id) => { if (writeLease !== id) throw Object.assign(new Error("Room write requires its owner."), { code: "GAME_FENCED" }); });
  const relatedMatches = (roomId, ids) => readDb().rooms.filter((other) => other.id !== roomId && other.ranked && !other.finished && other.ranked.roster.some((player) => ids.has(player.id) && !other.ranked.forfeits?.[player.id]));
  const activeTables = (roomId, ids) => readDb().rooms.filter((other) => other.id !== roomId && other.state && !other.finished && other.players.some((player) => ids.has(player.id))).map(({ id }) => id).sort().join("|");
  const tickPending = new Set();
  const pool = createGameWorkers({ size: dependencies.size, configuration, snapshot,
    context(roomId, input) {
      const db = readDb(), room = snapshot(roomId) ?? input.template;
      const ids = new Set([input.actor?.id, input.body?.playerId, room?.ownerId,
        ...(room?.players ?? []).map((player) => player.id), ...(room?.state?.players ?? []).map((player) => player.id),
        ...(room?.ranked?.roster ?? []).map((player) => player.id)].filter(Boolean));
      const users = [...ids].map(getUser).filter(Boolean);
      const payload = { actor: input.actor,
        users: users.map((user) => ({ ...Object.fromEntries(userFields.filter((field) => user[field] !== undefined).map((field) => [field, user[field]])), profile: { displayName: user.profile?.displayName, birthDate: user.profile?.birthDate }, cosmetics: { equipped: user.cosmetics?.equipped }, roomPlayer: dependencies.roomPlayerFor(user) })),
        spectatorAccess: [...ids].filter((id) => room && (maySpectate(room, id) || input.inviteId && id === input.actor?.id && getUser(id)?.roomInvites?.some((invite) => invite.id === input.inviteId && invite.code === room.code))),
        sockets: [...(roomPresence.get(roomId) ?? [])].flatMap((id) => {
          const socket = io.sockets.sockets.get(id); return socket ? [{ id, data: { userId: socket.data.userId, roomId, spectator: socket.data.spectator } }] : [];
        }),
        conflicts: relatedMatches(roomId, ids)
          .map((other) => ({ id: other.id, finished: false, ranked: { roster: other.ranked.roster.map(({ id }) => ({ id })), forfeits: other.ranked.forfeits } })) };
      return { payload, guard: { room: revision("rooms", roomId), configuration: settingsRevision(),
        conflicts: payload.conflicts.map(({ id }) => id).sort().join("|"),
        activeTables: activeTables(roomId, ids),
        users: users.map((user) => ({ id: user.id, revision: revision("users", user.id), guest: Boolean(user.guest), tokens: user.tokens })) } };
    },
    commit({ roomId, commandId, epoch, result, guard, workerId, actor, command, inviteId }) {
      if (guard.configuration !== settingsRevision() || guard.room !== revision("rooms", roomId)) throw conflict();
      if (guard.conflicts !== relatedMatches(roomId, new Set(guard.users.map(({ id }) => id))).map(({ id }) => id).sort().join("|")) throw conflict();
      if (command === "start-ranked" && (guard.activeTables || activeTables(roomId, new Set(guard.users.map(({ id }) => id))))) throw conflict();
      if (command === "expire" && (roomPresence.get(roomId)?.size ?? 0) > 0) throw conflict();
      if (actor) validateActor?.(actor);
      for (const row of guard.users) {
        if (row.revision !== revision("users", row.id) || row.guest && row.tokens !== getUser(row.id)?.tokens) throw conflict();
      }
      const guestBefore = guard.users.filter((row) => row.guest).map((row) => [row.id, structuredClone(sessions.get(row.id))]);
      let room = result.room ?? result.deletedRoom;
      try {
        writeLease = roomId;
        updateDb((db) => {
          const index = db.rooms.findIndex((target) => target.id === roomId);
          if (index >= 0) db.rooms[index] = room;
          else if (room) db.rooms.push(room);
          for (const effect of result.effects) {
            const user = db.users.find((target) => target.id === effect.userId);
            if (effect.kind === "tokens") {
              const balance = getUser(effect.userId)?.tokens;
              if (!Number.isFinite(effect.amount) || balance === undefined || balance + effect.amount < 0 || effect.meta?.roomId !== roomId) throw conflict();
              addTokens(db, effect.userId, effect.amount, effect.meta);
            } else if (effect.kind === "achievement") {
              const unlocked = processAchievementEvent(db, effect.userId, effect.event, effect.room === false ? null : room);
              if (command === "activity") result.response.unlocked.push(...unlocked);
            }
            else if (effect.kind === "unlock") appendRoomAchievementUnlocks(room, effect.userId, unlockEligibleAchievements(user, db));
            else if (effect.kind === "random") triggerRandomAchievement(db, effect.userId, room);
            else if (effect.kind === "settle") finishRoomIfNeeded(room, db, { ranking: effect.ranking });
            else if (effect.kind === "notification" && user) {
              ensureUserSocial(user); user.notifications.unshift(effect.notification); user.notifications = user.notifications.slice(0, 100);
            }
          }
          if (room) {
            room.gameWorker = { version: result.version, commandId, epoch, workerId };
            if (Object.hasOwn(result.response ?? {}, "achievementUnlocks")) result.response.achievementUnlocks = consumeRoomAchievementUnlocks(room, actor.id);
          }
          if (inviteId && actor) {
            const user = db.users.find((target) => target.id === actor.id);
            if (!user?.roomInvites?.some((invite) => invite.id === inviteId && invite.code === room?.code)) throw conflict();
            user.roomInvites = user.roomInvites.filter((invite) => invite.id !== inviteId);
          }
          if (!result.room) db.rooms = db.rooms.filter((target) => target.id !== roomId);
        }, (db) => {
          const scope = roomWriteScope(db, room ? [room] : []);
          scope.users = [...new Set([...scope.users, ...guard.users.filter((row) => !row.guest).map((row) => row.id)])];
          scope.rooms = [roomId]; return scope;
        });
      } catch (error) { for (const [id, user] of guestBefore) if (user) sessions.set(id, user); throw error; }
      finally { writeLease = undefined; }
      for (const effect of result.effects) if (effect.kind === "notification") invalidateInbox(effect.userId);
      return room ? { finished: room.finished, ranked: room.ranked, players: room.players,
        achievementUnlocksByUser: room.achievementUnlocksByUser ?? {}, achievementRuleProgress: room.achievementRuleProgress ?? {},
        ...(room.state ? { ranking: room.state.ranking, roomPayouts: room.state.roomPayouts } : {}) } : {};
    },
    onDue(id) {
      if (tickPending.has(id)) return;
      tickPending.add(id);
      execute(id, "tick").catch((error) => dependencies.onError?.(error)).finally(() => tickPending.delete(id));
    }
  });
  async function execute(id, command, input = {}) {
    let result;
    for (let attempt = 0; ; attempt++) {
      try { result = await pool.execute(id, command, input); break; }
      catch (error) { if (!error.gameRetryable || attempt >= 2 || !["activity", "tick", "expire"].includes(command)) throw error; }
    }
    const room = snapshot(id);
    if (result.duplicate) return { status: 200, response: room ? sanitizeRoom(room, input.actor?.id) : { ok: true } };
    if (result.written || result.status < 400) {
      for (const event of result.events) {
        if (event.kind === "spectator" && room) grantSpectatorAccess(room, event.userId);
        else if (event.kind === "leave") {
          const socket = io.sockets.sockets.get(event.socketId);
          socket?.leave(id); roomPresence.get(id)?.delete(event.socketId); if (socket) delete socket.data.roomId;
        } else if (event.event) io.to(event.target).emit(event.event, event.payload);
      }
      if (room) emitRoomUpdate(room); broadcastRooms();
    }
    let response = result.response;
    if (response?.roomView) {
      const { roomView, ...additional } = response;
      response = { ...sanitizeRoom(room, roomView.viewerId, undefined, roomView.spectator), ...additional };
    }
    return { status: result.status, response };
  }
  return {
    async dispatch(key, req, res) {
      const room = req.params.code && readDb().rooms.find((target) => target.code === req.params.code.toUpperCase());
      if (req.params.code && !room) return res.status(404).json({ error: "Table introuvable." });
      const id = room?.id ?? randomUUID();
      const result = await execute(id, key, { params: req.params, body: req.body, actor: req.auth });
      return res.status(result.status).json(result.response);
    },
    async recover() { for (const room of [...readDb().rooms]) await execute(room.id, "tick"); },
    expire(id, forceExpired = false) {
      if (tickPending.has(id)) return;
      tickPending.add(id);
      execute(id, "expire", { forceExpired }).catch((error) => dependencies.onError?.(error)).finally(() => tickPending.delete(id));
    },
    execute, health: pool.health, owner: pool.owner, close: pool.close
  };
}
