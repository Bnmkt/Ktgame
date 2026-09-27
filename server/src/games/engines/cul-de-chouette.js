import { currentPlayer, nextTurn, rollDice } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, diceText, publicPlayers } from "../engine-context.js";

export function scoreCulDeChouette(dice) {
  const counts = [1, 2, 3, 4, 5, 6].map((face) => dice.filter((die) => die === face).length);
  const tripleFace = counts.findIndex((count) => count === 3) + 1;
  if (tripleFace) return { label: `Cul de chouette de ${tripleFace}`, points: 40 + tripleFace * 10 };
  const pairFace = counts.findIndex((count) => count === 2) + 1;
  const sortedValues = [...dice].sort((left, right) => left - right);
  const veluteFace = sortedValues.find((value, index) => sortedValues.some((other, otherIndex) => otherIndex !== index && sortedValues.some((third, thirdIndex) => thirdIndex !== index && thirdIndex !== otherIndex && other + third === value)));
  if (pairFace && veluteFace) return { label: `Chouette Velute de ${veluteFace}`, points: veluteFace * veluteFace * 2 };
  if (veluteFace) return { label: `Velute de ${veluteFace}`, points: veluteFace * veluteFace };
  if (pairFace) return { label: `Chouette de ${pairFace}`, points: pairFace * pairFace };
  const sorted = [...dice].sort((left, right) => left - right).join("");
  if (["123", "234", "345", "456"].includes(sorted)) return { label: "Suite", points: 10 };
  return { label: "Néant", points: 0 };
}

export function createCulDeChouetteState(players, options = {}) {
  const modifiers = normalizeGameModifiers("cul-de-chouette", options.gameModifiers);
  return {
    gameId: "cul-de-chouette",
    players: publicPlayers(players),
    modifiers,
    currentPlayerIndex: 0,
    scores: {},
    round: 1,
    maxRounds: modifiers.rounds,
    completedThisRound: [],
    dice: [],
    kept: [],
    rollsLeft: modifiers.rollsPerTurn,
    lastRoll: null,
    lastDiceByPlayer: {},
    logs: [],
    finished: false,
    winners: []
  };
}

export function applyCulDeChouetteAction(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  state.dice ??= [];
  state.kept ??= [];
  state.rollsLeft ??= state.dice.length ? 0 : (state.modifiers?.rollsPerTurn ?? 3);
  if (action.type === "roll" && state.rollsLeft > 0) {
    const keepIndexes = new Set(action.keepIndexes ?? []);
    const currentDice = state.dice.length ? state.dice : Array(3).fill(null);
    state.dice = currentDice.map((value, index) => (keepIndexes.has(index) && value ? value : rollDice(1)[0]));
    state.kept = [...keepIndexes];
    state.rollsLeft -= 1;
    const result = scoreCulDeChouette(state.dice);
    (state.lastDiceByPlayer ??= {})[actorId] = [...state.dice];
    state.lastRoll = { playerId: actorId, dice: [...state.dice], ...result, pending: true };
    appendLog(state, actorId, `lance ${diceText(state.dice)}: ${result.label}${state.rollsLeft ? `, ${state.rollsLeft} relance(s) restante(s)` : ""}.`);
  }
  if (action.type === "bank") {
    if (state.dice.length !== 3) throw new Error("Il faut lancer les dés avant de valider.");
    const result = scoreCulDeChouette(state.dice);
    state.lastRoll = { playerId: actorId, dice: [...state.dice], ...result, pending: false };
    state.scores[actorId] = (state.scores[actorId] ?? 0) + result.points;
    appendLog(state, actorId, `valide ${diceText(state.dice)}: ${result.label}, +${result.points} point(s).`, "score");
    state.completedThisRound = [...new Set([...(state.completedThisRound ?? []), actorId])];
    state.dice = [];
    state.kept = [];
    state.rollsLeft = state.modifiers?.rollsPerTurn ?? 3;
    if (state.completedThisRound.length >= state.players.length) {
      if (state.round >= state.maxRounds) {
        const best = Math.max(...state.players.map((player) => state.scores[player.id] ?? 0));
        state.winners = state.players.filter((player) => (state.scores[player.id] ?? 0) === best).map((player) => player.id);
        state.finished = true;
      } else {
        state.round += 1;
        state.completedThisRound = [];
        state.currentPlayerIndex = 0;
      }
    } else nextTurn(state);
  }
  return state;
}

export function culDeChouetteBotAction(state) {
  return (state.rollsLeft ?? 3) > 0 ? { type: "roll", keepIndexes: [] } : { type: "bank" };
}
