import { currentPlayer, nextTurn, rollDice } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, diceText, publicPlayers } from "../engine-context.js";

export function hasShutMove(open, total) {
  function search(values, target, index = 0) {
    if (target === 0) return true;
    if (target < 0) return false;
    for (let cursor = index; cursor < values.length; cursor += 1) {
      if (search(values, target - values[cursor], cursor + 1)) return true;
    }
    return false;
  }
  return search(open, total);
}

export function createShutTheBoxState(players, options = {}) {
  const modifiers = normalizeGameModifiers("shut-the-box", options.gameModifiers);
  return { gameId: "shut-the-box", players: publicPlayers(players), modifiers, currentPlayerIndex: 0, boxes: Object.fromEntries(players.map((player) => [player.id, Array.from({ length: modifiers.maxTile }, (_, index) => index + 1)])), scores: {}, dice: [], lastTotal: null, lastDiceByPlayer: {}, logs: [], finished: false, winners: [] };
}

export function applyShutTheBoxAction(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  const open = state.boxes[actorId] ?? [];
  if (action.type === "roll") {
    if (state.scores[actorId] !== undefined) throw new Error("Tour déjà terminé.");
    state.dice = rollDice(open.some((number) => number >= 7) ? 2 : 1);
    (state.lastDiceByPlayer ??= {})[actorId] = [...state.dice];
    state.lastTotal = state.dice.reduce((sum, value) => sum + value, 0);
    appendLog(state, actorId, `lance ${diceText(state.dice)} pour un total de ${state.lastTotal}.`);
    if (!hasShutMove(open, state.lastTotal)) {
      state.scores[actorId] = open.reduce((sum, value) => sum + value, 0);
      appendLog(state, actorId, `n'a aucun coup possible et finit à ${state.scores[actorId]}.`, "result");
      const done = state.players.every((player) => state.scores[player.id] !== undefined);
      if (done || state.scores[actorId] === 0) {
        const best = Math.min(...Object.values(state.scores));
        state.winners = state.players.filter((player) => state.scores[player.id] === best).map((player) => player.id);
        state.finished = true;
      } else nextTurn(state);
    }
  }
  if (action.type === "shut") {
    const numbers = [...new Set((action.numbers ?? []).map(Number))];
    if (!state.lastTotal) throw new Error("Lance les dés avant de fermer des tuiles.");
    if (!numbers.length || numbers.reduce((sum, value) => sum + value, 0) !== state.lastTotal) throw new Error("Les tuiles doivent totaliser le lancer.");
    if (!numbers.every((value) => open.includes(value))) throw new Error("Tuile indisponible.");
    state.boxes[actorId] = open.filter((value) => !numbers.includes(value));
    appendLog(state, actorId, `ferme ${numbers.join("+")}.`);
    state.lastTotal = null;
    state.dice = [];
    if (state.boxes[actorId].length === 0) {
      state.scores[actorId] = 0;
      state.winners = [actorId];
      state.finished = true;
    }
  }
  return state;
}

export function shutTheBoxBotAction(state, bot) {
  const open = state.boxes[bot.id] ?? [];
  if (!state.lastTotal) return { type: "roll" };
  const single = open.find((value) => value === state.lastTotal);
  if (single) return { type: "shut", numbers: [single] };
  for (const left of open) for (const right of open) if (left < right && left + right === state.lastTotal) return { type: "shut", numbers: [left, right] };
  return { type: "roll" };
}
