import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { applyAction, tickBattleState, tickPokerState } from "../games/engines.js";
import { createRoomRuntime } from "./room-runtime.js";
import { createRoomCommands } from "./room-commands.js";
import { featureAccess } from "./parental-controls.js";
import { createRankedRoomRuntime } from "./ranked-room-runtime.js";

const fault = (code) => Object.assign(new Error("Room command unavailable."), { code });

// A room has a committed state and at most one prepared transition. Only the
// coordinator's durable receipt can promote a prepared transition to committed.
export function createGameRoomKernel() {
  const rooms = new Map();
  const preparing = new Set();
  let configuration;
  function register({ roomId, epoch, version, room }) {
    if (!roomId || !epoch || !Number.isSafeInteger(version) || version < 0 || room && room.id !== roomId) throw fault("GAME_INVALID");
    const existing = rooms.get(roomId);
    if (existing) {
      if (existing.epoch !== epoch || existing.version !== version) throw fault("GAME_FENCED");
      return { version: existing.version };
    }
    const recovered = structuredClone(room);
    if (recovered?.ranked && !recovered.finished) {
      recovered.ranked.actionAt = Date.now(); recovered.ranked.offline = {}; recovered.ranked.turnActor = null;
      if (recovered.state?.turnDeadline) recovered.state.turnDeadline = Date.now() + recovered.ranked.config.reconnectSeconds * 1000;
    }
    rooms.set(roomId, { epoch, version, room: recovered, receipts: new Map(room?.gameWorker?.commandId ? [[room.gameWorker.commandId, version]] : []) });
    return { version };
  }
  function entryFor(input) {
    const entry = rooms.get(input.roomId);
    if (!entry || entry.epoch !== input.epoch) throw fault("GAME_FENCED");
    return entry;
  }
  async function prepareTransition(input) {
    const entry = entryFor(input);
    if (!input.commandId || typeof input.commandId !== "string") throw fault("GAME_INVALID");
    if (entry.receipts.has(input.commandId)) return { duplicate: true, version: entry.version };
    if (entry.prepared) {
      if (entry.prepared.commandId === input.commandId) return entry.prepared.result;
      throw fault("GAME_ROOM_BUSY");
    }
    if (entry.version !== input.version) throw fault("GAME_CONFLICT");
    if (!configuration || input.configurationId !== configuration.id) throw fault("GAME_CONFIGURATION");
    const activeConfiguration = configuration;
    const context = structuredClone(input.context);
    const room = structuredClone(entry.room);
    const effects = [], events = [];
    const db = { users: context.users, rooms: [...(room ? [room] : []), ...(context.conflicts ?? [])], history: [], transactions: [], settings: {} };
    const player = (id) => db.users.find((user) => user.id === id);
    const settings = () => activeConfiguration.platform;
    const balances = new Map(context.users.map((user) => [user.id, Number(user.tokens) || 0]));
    let written = false, settlement = false, publishRoom = false, publishLobby = false;
    const finish = (target) => {
      if (target.state?.finished && !target.finished && !settlement) { effects.push({ kind: "settle", ranking: runtime.roomRanking(target) }); settlement = true; }
    };
    const emit = (target, event, payload) => events.push({ target, event, payload });
    const sockets = new Map((context.sockets ?? []).map((socket) => [socket.id, { data: socket.data,
      emit: (event, payload) => emit(socket.id, event, payload),
      leave: () => events.push({ kind: "leave", socketId: socket.id }) }]));
    const presence = new Map([[input.roomId, new Set(sockets.keys())]]);
    const syncTokens = (target) => { target.players = target.players.map((row) => ({ ...row, tokens: row.isBot ? row.tokens : balances.get(row.id) ?? row.tokens })); };
    const addTokens = (_db, userId, amount, meta) => {
      if (!Number.isFinite(amount) || !balances.has(userId) || balances.get(userId) + amount < 0) throw fault("GAME_BALANCE");
      const balance = balances.get(userId) + amount;
      balances.set(userId, balance); player(userId).tokens = balance;
      effects.push({ kind: "tokens", userId, amount, meta });
      return balance;
    };
    const feature = (user, name) => featureAccess(user, name, settings().minorRestrictions);
    const rejectFeature = (res, access) => res.status(403).json({ code: access.code, error: access.reason || "Cette action n’est pas disponible pour ce compte.", reason: access.reason ?? "", endsAt: access.until ?? "" });
    const tableAccess = (user, target) => {
      const access = feature(user, target?.ownerId === user?.id ? "rooms:create" : "rooms:join");
      return access.allowed ? feature(user, `game:${target?.gameId}`) : access;
    };
    const unlock = (user) => { if (user) effects.push({ kind: "unlock", userId: user.id }); return []; };
    const random = (_db, userId) => effects.push({ kind: "random", userId });
    const blindSettings = (value, fallback = settings().pokerDefaultBigBlind) => {
      let bigBlind = Math.max(2, Math.floor(Number(value) || Number(fallback) || 100));
      if (bigBlind % 2) bigBlind += 1;
      return { smallBlind: bigBlind / 2, bigBlind };
    };
    const runtime = createRoomRuntime({
      DEFAULT_BOT_THINKING_MS: 1000, DEFAULT_TURN_END_DELAY_MS: 5000, DEFAULT_ROUND_RESULTS_MS: 30000,
      addTokens, appendRoomAchievementUnlocks: () => {}, applyAction,
      battleBotTimers: new Map(Object.entries(room?.state?.botThinking ?? {}).map(([id, thinking]) => [`${input.roomId}:${room.state.round}:${id}:${thinking.phase}`, true])), configuredGames: () => activeConfiguration.games,
      emitRoomUpdate: () => { written = true; publishRoom = true; }, finishRoomIfNeeded: finish,
      getTokenBalance: (_db, id) => balances.get(id) ?? 0, platformSettings: settings,
      pokerBlindsFromBigBlind: blindSettings, readDb: () => db,
      serviceExecution: { measure: (_name, callback) => callback() }, syncRoomPlayerTokens: syncTokens,
      triggerRandomAchievement: random, unlockEligibleAchievements: unlock,
      writeDb: () => { written = true; },
      // Battle timers are represented by botThinking in the authoritative room.
      // The process scheduler requests a transition when its deadline is due.
      scheduleBot: () => ({ scheduled: true })
    });
    const rankedRuntime = { ...createRankedRoomRuntime({ cashOutPokerPlayer: runtime.cashOutPokerPlayer, removePlayerFromRoomState: runtime.removePlayerFromRoomState, finishRoomIfNeeded: finish }),
      action(target) { if (target.ranked) { target.ranked.actionAt = Date.now(); target.ranked.turnActor = target.state.players[target.state.currentPlayerIndex]?.id; } },
    };
    const commands = createRoomCommands({ ...runtime, addTokens, appendRoomAchievementUnlocks: () => {}, applyAction, bcrypt,
      broadcastRooms: () => { publishLobby = true; }, configuredGames: () => activeConfiguration.games,
      consumeRoomAchievementUnlocks: () => [], displayNameFor: (user) => String(user.profile?.displayName || user.pseudo || "Joueur"),
      emitRoomUpdate: () => { written = true; publishRoom = true; }, finishRoomIfNeeded: finish,
      getTokenBalance: (_db, id) => balances.get(id) ?? 0, getUser: player,
      grantSpectatorAccess: (_room, userId) => events.push({ kind: "spectator", userId }),
      io: { sockets: { sockets }, to: (target) => ({ emit: (event, payload) => emit(target, event, payload) }) },
      maySpectate: (target, userId) => target.players.some((row) => row.id === userId) || target.isPublic && !target.passwordHash || context.spectatorAccess?.includes(userId),
      platformSettings: settings, pokerBlindsFromBigBlind: blindSettings,
      processAchievementEvent: (_db, userId, event) => effects.push({ kind: "achievement", userId, event }),
      progressionConfig: () => settings().gameProgression,
      pushNotification: (user, data) => {
        const notification = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
        effects.push({ kind: "notification", userId: user.id, notification }); return notification;
      }, rankedRuntime, readDb: () => db, rejectFeature,
      roomCode: () => randomBytes(3).toString("hex").toUpperCase(),
      roomPlayerFor: (user) => user.roomPlayer ? { ...user.roomPlayer, tokens: Math.max(0, Number(user.tokens) || 0) } : { id: user.id, pseudo: String(user.profile?.displayName || user.pseudo || "Joueur"), tokens: Math.max(0, Number(user.tokens) || 0), guest: Boolean(user.guest), cosmetics: { equipped: user.cosmetics?.equipped ?? {} } },
      roomPresence: presence,
      sanitizeRoom: (target, viewerId, _db, spectator = false) => ({ roomView: { roomId: target.id, viewerId, spectator } }),
      saveRoom: (target) => { db.rooms = [target, ...db.rooms.filter((other) => other.id !== target.id)]; written = true; },
      syncRoomPlayerTokens: syncTokens, tableFeatureAccess: tableAccess,
      triggerRandomAchievement: random, unlockEligibleAchievements: unlock,
      userFeatureAccess: feature, writeRoomDb: () => { written = true; }
    });
    let status = 200, response;
    const res = { status(code) { status = code; return this; }, json(value) { response = value; return this; } };
    if (input.command === "start-ranked") {
      const created = structuredClone(input.template);
      if (!created?.ranked || created.id !== input.roomId || entry.room) throw fault("GAME_INVALID");
      if (created.players.some(({ id }) => !player(id) || player(id).active === false || player(id).guest || !feature(player(id), "rooms:join").allowed || !feature(player(id), `game:${created.gameId}`).allowed)) throw fault("GAME_AUTH_REVOKED");
      db.rooms.unshift(created);
      const error = runtime.startRoomRound(created, db);
      if (error) { status = 400; response = { error }; }
      else { written = true; response = { ok: true }; }
      publishRoom = written; publishLobby = written;
    } else if (input.command === "cancel-ranked") {
      if (!room?.ranked || room.finished || !input.reason) throw fault("GAME_INVALID");
      room.ranked.cancelled = { reason: input.reason, by: context.actor.id, at: new Date().toISOString() };
      for (const player of room.ranked.roster) {
        const refund = room.stake - (room.state.departedPayouts?.[player.id] ?? 0);
        if (refund > 0) addTokens(db, player.id, refund, { gameId: room.gameId, roomId: room.id, reason: "ranked-technical-refund" });
      }
      room.state.finished = true; room.state.winners = []; room.pacing = null; finish(room);
      written = true; response = { ok: true };
      publishRoom = true; publishLobby = true;
    } else if (input.command === "expire") {
      if (room && !room.state && !room.finished && !context.sockets?.length && (input.forceExpired || Date.now() - new Date(room.createdAt).getTime() >= 30000)) {
        db.rooms = db.rooms.filter((target) => target.id !== input.roomId); written = true;
        publishLobby = true;
      }
      response = { ok: true };
    } else if (input.command === "activity") {
      if (!player(context.actor.id)) throw fault("GAME_AUTH_REVOKED");
      for (const event of input.activityEvents ?? []) effects.push({ kind: "achievement", userId: context.actor.id, event, room: ["table.activity", "game.round.activity"].includes(event.type) });
      written = effects.length > 0; response = { unlocked: [] };
    } else if (input.command === "tick") {
      if (room?.state) {
        const now = input.now ?? Date.now();
        let changed = rankedRuntime.tickRoom(room, db, (_roomId, playerId) => (context.sockets ?? []).some((socket) => socket.data.userId === playerId && !socket.data.spectator), now);
        changed = runtime.advanceRoomPacing(room, db, now) || changed;
        if (!room.finished && !runtime.roomPacingActive(room, now)) {
          const before = runtime.roundProgressSnapshot(room.state);
          if (room.gameId === "texas-holdem") changed = tickPokerState(room.state, now) || changed;
          if (room.gameId === "bataille") {
            for (const [id, thinking] of Object.entries(room.state.botThinking ?? {})) {
              if (thinking.until > now) continue;
              const bot = room.state.players.find((row) => row.id === id && row.isBot);
              delete room.state.botThinking[id];
              const action = bot && runtime.botActionFor(room.state, bot);
              if (action) { room.state = applyAction(room.state, id, action); changed = true; }
            }
            changed = tickBattleState(room.state, now) || changed;
          }
          const showingResults = changed && runtime.startRoundResultsIfNeeded(room, before);
          const current = room.state.players[room.state.currentPlayerIndex];
          if (!room.ranked && room.gameId === "texas-holdem" && current && !current.isBot && room.state.turnDeadline && now >= room.state.turnDeadline) {
            runtime.cashOutPokerPlayer(room, db, current.id, "poker-timeout-cash-out");
            emit(room.id, "room-player-kicked", { code: room.code, playerId: current.id, reason: "timeout" }); changed = true;
          }
          if (changed && !showingResults) runtime.runBotTurns(room, db);
        }
        finish(room); written = changed || settlement;
        publishRoom = written; publishLobby = settlement;
      }
      response = { ok: true };
    } else {
      const handler = commands.get(input.command);
      if (!handler) throw fault("GAME_UNSUPPORTED");
      await handler({ roomId: input.roomId, params: input.params ?? {}, body: input.body ?? {}, auth: context.actor }, res);
    }
    const result = { status, response, room: db.rooms.find((target) => target.id === input.roomId) ?? null, deletedRoom: !db.rooms.some((target) => target.id === input.roomId) ? room : null,
      effects: status < 400 || written ? effects : [], events: status < 400 || written ? events : [],
      written, publishRoom, publishLobby, commandId: input.commandId, version: entry.version + 1 };
    entry.prepared = { commandId: input.commandId, result };
    return result;
  }
  return {
    configure(value) { if (!value?.id || !Array.isArray(value.games) || !value.platform) throw fault("GAME_CONFIGURATION"); configuration = structuredClone(value); },
    register,
    async prepare(input) {
      if (preparing.has(input.roomId)) throw fault("GAME_ROOM_BUSY");
      preparing.add(input.roomId);
      try { return await prepareTransition(input); }
      finally { preparing.delete(input.roomId); }
    },
    commit(input) {
      const entry = entryFor(input);
      if (entry.receipts.has(input.commandId)) return { version: entry.version, duplicate: true };
      if (entry.prepared?.commandId !== input.commandId || input.version !== entry.version + 1) throw fault("GAME_CONFLICT");
      const next = entry.prepared.result.room;
      if (next && input.financial) {
        for (const key of ["finished", "ranked", "players", "achievementUnlocksByUser", "achievementRuleProgress"]) {
          if (Object.hasOwn(input.financial, key)) next[key] = structuredClone(input.financial[key]);
        }
        if (next.state) for (const key of ["ranking", "roomPayouts"]) if (Object.hasOwn(input.financial, key)) next.state[key] = structuredClone(input.financial[key]);
      }
      entry.room = next; entry.version = input.version; entry.prepared = null;
      entry.receipts.set(input.commandId, entry.version);
      if (entry.receipts.size > 32) entry.receipts.delete(entry.receipts.keys().next().value);
      if (!next) rooms.delete(input.roomId);
      return { version: entry.version };
    },
    abort(input) { const entry = entryFor(input); if (entry.prepared?.commandId === input.commandId) entry.prepared = null; if (!entry.room) rooms.delete(input.roomId); return { version: entry.version }; },
    health() { return { rooms: [...rooms.values()].filter((entry) => entry.room).length, prepared: [...rooms.values()].filter((entry) => entry.prepared).length }; },
    due(now = Date.now()) {
      return [...rooms].filter(([, entry]) => !entry.prepared && entry.room?.state &&
        (entry.room.pacing?.endsAt <= now || !entry.room.finished && (["texas-holdem", "bataille"].includes(entry.room.gameId) || entry.room.ranked))).map(([roomId]) => roomId);
    }
  };
}
