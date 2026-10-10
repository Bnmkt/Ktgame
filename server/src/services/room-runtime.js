import { randomUUID } from "node:crypto";
import { createGameState, tickPokerState } from "../games/engines.js";
import { normalizeGameModifiers } from "../games/modifiers.js";
import { midnightDiceBotAction, resumeMidnightAfterDeparture } from "../games/engines/midnight-dice.js";
import { velvetRuseBotAction } from "../games/engines/velvet-ruse.js";
import { yahtzeeBotAction } from "../games/engines/yahtzee.js";
import { fourTwentyOneBotAction } from "../games/engines/four-twenty-one.js";
import { culDeChouetteBotAction } from "../games/engines/cul-de-chouette.js";
import { farkleBotAction } from "../games/engines/farkle.js";
import { liarsDiceBotAction } from "../games/engines/liars-dice.js";
import { shutTheBoxBotAction } from "../games/engines/shut-the-box.js";
import { presidentBotAction } from "../games/engines/president.js";
import { beloteBotAction, beloteTeam, replaceBelotePlayer } from "../games/engines/belote.js";
import { beloteSeats } from "../games/belote-seats.js";
import { texasHoldemBotAction } from "../games/engines/texas-holdem.js";
import { battleBotAction } from "../games/engines/bataille.js";
import { roomLevelError } from "./game-progression.js";

export function createRoomRuntime(dependencies) {
  const scheduleBot = dependencies.scheduleBot ?? setTimeout;
  const { DEFAULT_BOT_THINKING_MS, DEFAULT_ROUND_RESULTS_MS, DEFAULT_TURN_END_DELAY_MS, addTokens, appendRoomAchievementUnlocks, applyAction, battleBotTimers, configuredGames, emitRoomUpdate, finishRoomIfNeeded, getTokenBalance, platformSettings, pokerBlindsFromBigBlind, readDb, serviceExecution, syncRoomPlayerTokens, triggerRandomAchievement, unlockEligibleAchievements, writeDb } = dependencies;
  function actionAchievementSnapshot(state, actorId) {
    const player = state.players?.find((entry) => entry.id === actorId);
    const scores = state.scores?.[actorId];
    const hand = state.hands?.[actorId] ?? [];
    return {
      logCount: state.logs?.length ?? 0,
      phase: state.phase ?? "",
      dice: [...(state.dice ?? state.lastDiceByPlayer?.[actorId] ?? [])],
      selectedDice: [...(state.selectedDice ?? [])],
      turnScore: Number(state.turnScore) || 0,
      totalScore: typeof scores === "number" ? scores : player ? scoreForRanking(state, player) : 0,
      rollScore: Number(state.lastRoll?.points) || 0,
      hand: hand.map((card) => card ? `${card.rank}${card.suit ?? ""}` : null),
      handTotal: state.gameId === "blackjack" ? blackjackHandTotal(hand) : 0,
      stats: structuredClone(state.stats?.[actorId] ?? {})
    };
  }

  function gameActionAchievementEvent(room, actorId, action, before) {
    const state = room.state;
    const after = actionAchievementSnapshot(state, actorId);
    const logs = (state.logs ?? []).slice(before.logCount);
    const categoryScore = action.category && typeof state.scores?.[actorId] === "object" ? state.scores[actorId][action.category] : undefined;
    return {
      type: "game.action",
      payload: {
        gameId: state.gameId,
        action: String(action.type ?? ""),
        playerId: actorId,
        roomId: room.id,
        phase: after.phase,
        dice: after.dice,
        diceCount: after.dice.length,
        rollScore: after.rollScore,
        selectedDice: after.selectedDice,
        turnScore: after.turnScore,
        totalScore: after.totalScore,
        cards: after.hand,
        handSize: after.hand.length,
        handTotal: after.handTotal,
        category: action.category ?? "",
        categoryScore: categoryScore ?? 0,
        logTexts: logs.map((log) => log.text).filter(Boolean),
        flags: [...new Set([state.lastRoll?.label, state.currentCombination?.label, ...logs.map((log) => log.type)].filter(Boolean))]
      }
    };
  }

  function blackjackHandTotal(hand = []) {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.rank === "A") {
        aces += 1;
        total += 11;
      } else {
        total += ({ J: 10, Q: 10, K: 10 }[card.rank] ?? Number(card.rank));
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  function scoreForRanking(state, player) {
    if (!state || !player) return 0;
    if (state.gameId === "belote") return state.teamScores[beloteTeam(state, player.id)] ?? 0;
    if (state.gameId === "yahtzee") {
      const scores = state.scores?.[player.id] ?? {};
      const upper = ["upper-1", "upper-2", "upper-3", "upper-4", "upper-5", "upper-6"].reduce((sum, key) => sum + (scores[key] ?? 0), 0);
      return Object.values(scores).reduce((sum, value) => sum + value, 0) + (upper >= 63 ? 35 : 0);
    }
    if (state.gameId === "421") return state.scores?.[player.id] ?? (state.results ?? []).find((row) => row.playerId === player.id)?.rank ?? 0;
    if (state.gameId === "cul-de-chouette") return state.scores?.[player.id] ?? 0;
    if (state.gameId === "blackjack") {
      const total = blackjackHandTotal(state.hands?.[player.id] ?? []);
      return total > 21 ? -total : total;
    }
    if (state.gameId === "texas-holdem") return state.stacks?.[player.id] ?? 0;
    if (state.gameId === "bataille") return state.cardCounts?.[player.id] ?? state.piles?.[player.id]?.length ?? 0;
    if (state.gameId === "farkle") return state.scores?.[player.id] ?? 0;
    if (state.gameId === "liars-dice") return state.diceCounts?.[player.id] ?? 0;
    if (state.gameId === "shut-the-box") return -(state.scores?.[player.id] ?? 999);
    if (state.gameId === "golf-solitaire") return -(state.score ?? 999);
    if (state.gameId === "accordion") return -(state.score ?? 999);
    if (state.gameId === "midnight-dice") return state.scores?.[player.id] ?? 0;
    if (state.gameId === "velvet-ruse") return state.prestige?.[player.id] ?? 0;
    if (state.gameId === "president") {
      const index = state.finishedOrder?.indexOf(player.id) ?? -1;
      return index >= 0 ? 1000 - index : -(state.hands?.[player.id]?.length ?? 99);
    }
    return state.winners?.includes(player.id) ? 1 : 0;
  }

  function roomRanking(room) {
    return [...(room.state?.players ?? room.players)].map((player) => ({
      id: player.id,
      pseudo: player.pseudo,
      isBot: Boolean(player.isBot),
      score: scoreForRanking(room.state, player),
      winner: room.state?.winners?.includes(player.id) ?? false
    })).sort((a, b) => Number(b.winner) - Number(a.winner) || b.score - a.score);
  }

  function removePlayerFromRoomState(room, playerId) {
    if (!room.state) return;
    const state = room.state;
    if (state.gameId === "belote" && !state.finished) {
      if (!room.players.some((player) => !player.isBot)) { state.finished = true; state.winners = []; return; }
      if (!state.players.some((player) => player.id === playerId)) return;
      const replacement = { id: `bot-${randomUUID()}`, pseudo: "IA remplaçante", isBot: true, tokens: 0 };
      replaceBelotePlayer(state, playerId, replacement);
      room.beloteSeats = (room.beloteSeats ?? state.players.map((player) => player.id)).map((id) => id === playerId ? replacement.id : id);
      room.players = [...state.players];
      return;
    }
    const removedIndex = state.players?.findIndex((p) => p.id === playerId) ?? -1;
    state.players = (state.players ?? []).filter((p) => p.id !== playerId);
    if (state.currentPlayerIndex !== undefined && removedIndex >= 0) {
      if (removedIndex < state.currentPlayerIndex) state.currentPlayerIndex -= 1;
      if (state.currentPlayerIndex >= state.players.length) state.currentPlayerIndex = 0;
    }
    for (const key of ["scores", "hands", "bets", "piles", "boxes", "diceCounts", "drawnCards", "pendingChoices", "botThinking", "cardCounts", "trays", "secretContracts", "privateContractOffers", "usedContracts", "discardRemaining", "prestige", "stats"]) {
      if (state[key]) delete state[key][playerId];
    }
    if (state.deckKnowledge) {
      delete state.deckKnowledge[playerId];
      for (const viewerKnowledge of Object.values(state.deckKnowledge)) delete viewerKnowledge[playerId];
    }
    state.submittedPlayerIds = (state.submittedPlayerIds ?? []).filter((id) => id !== playerId);
    if (state.battleLanes) state.battleLanes = state.battleLanes.map((lane) => ({ ...lane, cards: lane.cards.filter((card) => card.ownerId !== playerId) }));
    state.results = (state.results ?? []).filter((row) => row.playerId !== playerId);
    state.finishedOrder = (state.finishedOrder ?? []).filter((id) => id !== playerId);
    state.passes = (state.passes ?? []).filter((id) => id !== playerId);
    state.winners = (state.winners ?? []).filter((id) => id !== playerId);
    if (state.currentSet?.playerId === playerId) {
      state.pile = [];
      state.currentSet = null;
      state.passes = [];
    }
    if (state.pendingClaim?.playerId === playerId) {
      state.pendingClaim = null;
      if (state.phase === "decision") state.phase = "draw";
    }
    if (state.dossier) state.dossier = state.dossier.filter((entry) => entry.playerId !== playerId);
    if (state.players.length <= 1) {
      state.winners = state.players.length ? [state.players[0].id] : [];
      state.finished = true;
    }
    if (state.gameId === "midnight-dice" && removedIndex >= 0) {
      if (removedIndex < state.startingPlayerIndex) state.startingPlayerIndex -= 1;
      resumeMidnightAfterDeparture(state);
    }
  }

  function cashOutPokerPlayer(room, db, playerId, reason = "poker-cash-out") {
    const state = room.state;
    if (state?.gameId !== "texas-holdem" || state.departedPayouts?.[playerId] !== undefined) return 0;
    if (state.currentPlayerIndex >= 0 && state.players[state.currentPlayerIndex]?.id === playerId && !state.foldedPlayerIds.includes(playerId)) applyAction(state, playerId, { type: "fold" });
    const player = state.players.find((entry) => entry.id === playerId);
    const alreadyRecovered = Object.values(state.departedPayouts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const availableRealFunds = Math.max(0, (state.realBankroll ?? state.buyIn ?? 0) - alreadyRecovered);
    const amount = player?.isBot ? 0 : Math.min(Math.max(0, state.stacks?.[playerId] ?? 0), availableRealFunds);
    if (amount && !player?.isBot) addTokens(db, playerId, amount, { gameId: room.gameId, roomId: room.id, reason });
    state.departedPayouts ??= {};
    state.departedPlayers ??= [];
    state.departedPayouts[playerId] = amount;
    if (player && !state.departedPlayers.some((entry) => entry.id === playerId)) state.departedPlayers.push({ ...player, recovered: amount });
    state.stacks[playerId] = 0;
    state.foldedPlayerIds = [...new Set([...state.foldedPlayerIds, playerId])];
    room.players = room.players.filter((entry) => entry.id !== playerId);
    const eligible = state.players.filter((entry) => (state.stacks[entry.id] ?? 0) > 0);
    const humansRemaining = room.players.filter((entry) => !entry.isBot);
    if (!humansRemaining.length || eligible.length < 2) {
      state.winners = eligible.map((entry) => entry.id);
      state.finished = true;
    }
    return amount;
  }

  function botActionFor(state, bot) {
    return serviceExecution.measure("rooms", () => calculateBotActionFor(state, bot));
  }

  function calculateBotActionFor(state, bot) {
    if (state.gameId === "belote") return beloteBotAction(state, bot);
    if (state.gameId === "yahtzee") return yahtzeeBotAction(state, bot);
    if (state.gameId === "421") return fourTwentyOneBotAction(state, bot);
    if (state.gameId === "cul-de-chouette") return culDeChouetteBotAction(state, bot);
    if (state.gameId === "bataille") return battleBotAction(state, bot);
    if (state.gameId === "texas-holdem") return texasHoldemBotAction(state, bot);
    if (state.gameId === "farkle") return farkleBotAction(state, bot);
    if (state.gameId === "liars-dice") return liarsDiceBotAction(state, bot);
    if (state.gameId === "shut-the-box") return shutTheBoxBotAction(state, bot);
    if (state.gameId === "midnight-dice") return midnightDiceBotAction(state, bot);
    if (state.gameId === "velvet-ruse") return velvetRuseBotAction(state, bot);
    if (state.gameId === "president") return presidentBotAction(state, bot);
    return null;
  }

  function roundProgressSnapshot(state) {
    if (!state) return { finished: false, round: 0, resultKey: "", yahtzeeRound: 0 };
    const lastRound = state.lastRound?.round;
    const lastResolution = state.gameId === "bataille" ? undefined : state.lastResolution?.round;
    const latest421Round = state.roundHistory?.at(-1)?.round;
    const resultKey = lastRound !== undefined
      ? `last-round:${lastRound}`
      : lastResolution !== undefined
        ? `last-resolution:${lastResolution}`
        : latest421Round !== undefined
          ? `round-history:${latest421Round}`
          : state.gameId === "texas-holdem" && state.nextHandAt
            ? `poker-hand:${state.handNumber ?? 1}`
            : "";
    const yahtzeeCompletedTurns = state.gameId === "yahtzee"
      ? Object.values(state.scores ?? {}).reduce((total, score) => total + Object.keys(score ?? {}).length, 0)
      : 0;
    return {
      finished: Boolean(state.finished),
      round: Number(state.round) || Number(state.handNumber) || 0,
      resultKey,
      yahtzeeRound: state.gameId === "yahtzee" ? Math.floor(yahtzeeCompletedTurns / Math.max(1, state.players?.length ?? 1)) : 0
    };
  }

  function completedRoundNumber(state, before) {
    if (state.lastRound?.round !== undefined) return state.lastRound.round;
    if (state.lastResolution?.round !== undefined) return state.lastResolution.round;
    if (state.roundHistory?.length) return state.roundHistory.at(-1).round;
    if (state.gameId === "texas-holdem") return state.handNumber ?? before.round ?? 1;
    if (state.gameId === "yahtzee") return Math.max(1, roundProgressSnapshot(state).yahtzeeRound);
    return before.round || state.round || 1;
  }

  function didRoundFinish(before, state) {
    const after = roundProgressSnapshot(state);
    if (!before.finished && after.finished) return true;
    if (after.resultKey && after.resultKey !== before.resultKey) return true;
    if (state.gameId === "yahtzee" && after.yahtzeeRound > before.yahtzeeRound) return true;
    if (!["texas-holdem", "belote", "midnight-dice", "421"].includes(state.gameId) && after.round > before.round) return true;
    return false;
  }

  function roomPacingActive(room, now = Date.now()) {
    return Boolean(room.pacing?.endsAt && room.pacing.endsAt > now);
  }

  function roomTiming(room) {
    return {
      botThinkingMs: Math.max(0, Number(room.timing?.botThinkingMs ?? DEFAULT_BOT_THINKING_MS)),
      turnEndDelayMs: Math.max(1000, Number(room.timing?.turnEndDelayMs ?? DEFAULT_TURN_END_DELAY_MS)),
      roundResultsMs: Math.max(0, Number(room.timing?.roundResultsMs ?? DEFAULT_ROUND_RESULTS_MS))
    };
  }

  function startRoomPacing(room, kind, durationMs, details = {}) {
    const now = Date.now();
    room.pacing = {
      id: randomUUID(),
      kind,
      startedAt: now,
      endsAt: now + durationMs,
      ...details
    };
    if (room.state?.gameId === "texas-holdem" && kind === "round-results" && room.state.nextHandAt) {
      room.state.resolutionStartedAt = now;
      room.state.nextHandAt = room.pacing.endsAt;
    }
  }

  function roundResultsPacingDetails(room, before) {
    const round = completedRoundNumber(room.state, before);
    return {
      round,
      final: Boolean(room.state.finished),
      results: roomRanking(room).map((player, index) => {
        const state = room.state;
        let scoreLabel = "";
        if (["shut-the-box", "golf-solitaire", "accordion"].includes(state.gameId)) scoreLabel = String(Math.abs(player.score));
        if (state.gameId === "president") {
          const finishIndex = state.finishedOrder?.indexOf(player.id) ?? -1;
          scoreLabel = finishIndex >= 0 ? `${finishIndex + 1}e place` : `${state.hands?.[player.id]?.length ?? 0} carte(s)`;
        }
        return { ...player, rank: index + 1, ...(scoreLabel ? { scoreLabel } : {}) };
      })
    };
  }

  function startRoundResultsIfNeeded(room, before, afterActor = null) {
    if (!room.state || !didRoundFinish(before, room.state)) return false;
    const details = roundResultsPacingDetails(room, before);
    const timing = roomTiming(room);
    if (afterActor) {
      startRoomPacing(room, "turn-end", timing.turnEndDelayMs, {
        actorId: afterActor.id,
        actorName: afterActor.pseudo,
        actorIsBot: Boolean(afterActor.isBot),
        ...(timing.roundResultsMs > 0 ? { nextPacing: { kind: "round-results", durationMs: timing.roundResultsMs, details } } : {})
      });
    } else if (timing.roundResultsMs > 0) {
      startRoomPacing(room, "round-results", timing.roundResultsMs, details);
    } else {
      return false;
    }
    return true;
  }

  function advanceRoomPacing(room, db, now = Date.now()) {
    if (!room.pacing || room.pacing.endsAt > now) return false;
    const completedPacing = room.pacing;
    room.pacing = null;
    if (completedPacing.kind === "turn-end" && room.state?.turnDeadline) {
      const pausedFor = Math.max(0, now - completedPacing.startedAt);
      room.state.turnStartedAt = room.state.turnStartedAt ? room.state.turnStartedAt + pausedFor : room.state.turnStartedAt;
      room.state.turnDeadline += pausedFor;
    }
    if (completedPacing.kind === "round-results" && room.state?.gameId === "texas-holdem" && room.state.nextHandAt) {
      room.state.nextHandAt = now;
      tickPokerState(room.state, now);
    }
    if (completedPacing.nextPacing) {
      startRoomPacing(room, completedPacing.nextPacing.kind, completedPacing.nextPacing.durationMs, completedPacing.nextPacing.details);
      return true;
    }
    if (!room.state?.finished) runBotTurns(room, db, { skipThinking: completedPacing.kind === "bot-thinking" });
    finishRoomIfNeeded(room, db);
    return true;
  }

  function runBotTurns(room, db, { skipThinking = false } = {}) {
    if (roomPacingActive(room)) return;
    if (room.state?.gameId === "bataille") {
      if (room.state.resolutionEndsAt) return;
      room.state.botThinking ??= {};
      for (const bot of room.state.players.filter((player) => player.isBot && !room.state.submittedPlayerIds?.includes(player.id))) {
        const phase = room.state.drawnCards?.[bot.id] ? "place" : "draw";
        const scheduledRound = room.state.round;
        const timerKey = `${room.id}:${scheduledRound}:${bot.id}:${phase}`;
        if (battleBotTimers.has(timerKey)) continue;
        const configuredDelay = roomTiming(room).botThinkingMs;
        const delay = configuredDelay > 0 ? configuredDelay : 50;
        room.state.botThinking[bot.id] = { phase, until: Date.now() + delay };
        const timer = scheduleBot(() => {
          battleBotTimers.delete(timerKey);
          const currentDb = readDb();
          const currentRoom = currentDb.rooms.find((entry) => entry.id === room.id && !entry.finished && entry.state?.gameId === "bataille");
          const currentBot = currentRoom?.state.players.find((player) => player.id === bot.id && player.isBot);
          if (!currentRoom || !currentBot || currentRoom.state.round !== scheduledRound || currentRoom.state.submittedPlayerIds?.includes(bot.id)) return;
          delete currentRoom.state.botThinking?.[bot.id];
          const action = botActionFor(currentRoom.state, currentBot);
          if (!action) return;
          try {
            const roundBeforeAction = roundProgressSnapshot(currentRoom.state);
            currentRoom.state = applyAction(currentRoom.state, currentBot.id, action);
            if (!startRoundResultsIfNeeded(currentRoom, roundBeforeAction, currentBot)) runBotTurns(currentRoom, currentDb);
            finishRoomIfNeeded(currentRoom, currentDb);
            writeDb(currentDb);
            emitRoomUpdate(currentRoom, currentDb);
          } catch (error) {
            console.error(`Battle bot action failed for ${currentBot.id}:`, error.message);
          }
        }, delay);
        battleBotTimers.set(timerKey, timer);
      }
      finishRoomIfNeeded(room, db);
      return;
    }
    let guard = 0;
    let actionCount = 0;
    const firstBot = room.state?.players?.[room.state.currentPlayerIndex];
    if (!firstBot?.isBot) {
      finishRoomIfNeeded(room, db);
      return;
    }
    const timing = roomTiming(room);
    if (!skipThinking && timing.botThinkingMs > 0) {
      startRoomPacing(room, "bot-thinking", timing.botThinkingMs, { actorId: firstBot.id, actorName: firstBot.pseudo, actorIsBot: true });
      return;
    }
    const before = roundProgressSnapshot(room.state);
    while (room.state && !room.state.finished && guard < 30) {
      guard += 1;
      const bot = room.state.players?.[room.state.currentPlayerIndex];
      if (!bot?.isBot || bot.id !== firstBot.id) break;
      const action = botActionFor(room.state, bot);
      if (!action) break;
      room.state = applyAction(room.state, bot.id, action);
      actionCount += 1;
    }
    if (!startRoundResultsIfNeeded(room, before, firstBot) && actionCount > 0 && !room.state.finished) {
      startRoomPacing(room, "turn-end", timing.turnEndDelayMs, { actorId: firstBot.id, actorName: firstBot.pseudo, actorIsBot: true });
    }
    finishRoomIfNeeded(room, db);
  }

  function startRoomRound(room, db) {
    const game = configuredGames(db).find((g) => g.id === room.gameId);
    if (!game) return "missing";
    if (room.players.length < game.minPlayers) return `Minimum ${game.minPlayers} joueur(s).`;
    if (room.gameId === "belote" && room.players.length !== 4) return "La belote exige exactement quatre joueurs, IA comprises.";
    const settings = platformSettings(db);
    if (room.players.some((player)=>db.rooms.some((other)=>other.id!==room.id && other.ranked && !other.finished && other.ranked.roster.some((p)=>p.id===player.id && !other.ranked.forfeits[p.id])))) return "Un joueur participe déjà à une partie classée.";
    if (!room.ranked) room.stake = Math.max(room.gameId === "texas-holdem" ? settings.minPokerBuyIn : settings.minRoomStake, Number(room.stake) || 0);
    if (room.ranked && room.players.some((p)=>p.guest || p.isBot)) return "Bots et invités interdits en classé.";
    for (const player of room.players.filter((p) => !p.isBot)) {
      const levelError = roomLevelError(db.users.find((user) => user.id === player.id) ?? player, room, settings.gameProgression);
      if (levelError) return `${player.pseudo} : ${levelError}`;
      if (getTokenBalance(db, player.id) < room.stake) return `${player.pseudo} n'a pas assez de jetons.`;
    }
    for (const player of room.players.filter((p) => !p.isBot)) {
      if (room.stake > 0) addTokens(db, player.id, -room.stake, { gameId: room.gameId, roomId: room.id, reason: "room-stake" });
      appendRoomAchievementUnlocks(room, player.id, unlockEligibleAchievements(db.users.find((u) => u.id === player.id), db));
      triggerRandomAchievement(db, player.id, room);
    }
    syncRoomPlayerTokens(room, db);
    room.finished = false;
    room.pacing = null;
    room.timing = {
      botThinkingMs: settings.botThinkingSeconds * 1000,
      turnEndDelayMs: settings.turnEndDelaySeconds * 1000,
      roundResultsMs: settings.roundResultsSeconds * 1000
    };
    if (room.gameId === "texas-holdem") {
      room.pokerBlinds = {
        ...pokerBlindsFromBigBlind(room.pokerBlinds?.bigBlind, settings.pokerDefaultBigBlind),
        maximumBet: Math.max(Number(room.pokerBlinds?.bigBlind) || settings.pokerDefaultBigBlind, Number(room.pokerBlinds?.maximumBet) || room.stake)
      };
    }
    room.gameModifiers = normalizeGameModifiers(room.gameId, room.gameModifiers);
    if (room.gameId === "belote") room.beloteSeats = beloteSeats(room);
    const seatedPlayers = room.gameId === "belote" ? room.beloteSeats.map((id) => room.players.find((player) => player.id === id)) : room.players;
    room.state = createGameState(room.gameId, seatedPlayers, { buyIn: room.stake, bigBlind: room.pokerBlinds?.bigBlind, maximumBet: room.pokerBlinds?.maximumBet, turnDurationMs: (room.pokerTurnSeconds ?? settings.pokerTurnSeconds) * 1000, battleModifiers: room.battleModifiers, gameModifiers: room.gameModifiers });
    if (room.state.gameId === "bataille") room.state.resolutionDurationMs = room.timing.turnEndDelayMs;
    room.activityMatchId = randomUUID();
    runBotTurns(room, db);
    return null;
  }

  return { removePlayerFromRoomState, cashOutPokerPlayer, botActionFor, calculateBotActionFor, roundProgressSnapshot, completedRoundNumber, didRoundFinish, roomPacingActive, roomTiming, startRoomPacing, roundResultsPacingDetails, startRoundResultsIfNeeded, advanceRoomPacing, runBotTurns, startRoomRound, actionAchievementSnapshot, gameActionAchievementEvent, blackjackHandTotal, roomRanking, scoreForRanking };
}
