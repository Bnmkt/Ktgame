import { currentPlayer, nextTurn, rollDice } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, diceText, publicPlayers } from "../engine-context.js";

export function scoreFarkleRoll(dice) {
  const counts = [1, 2, 3, 4, 5, 6].map((face) => dice.filter((die) => die === face).length);
  if (counts.every((count) => count === 1)) return { points: 1500, label: "Suite 1-6" };
  if (counts.filter((count) => count === 2).length === 3) return { points: 1500, label: "Trois paires" };
  if (counts.filter((count) => count === 3).length === 2) return { points: 2500, label: "Deux brelans" };
  if (counts.includes(4) && counts.includes(2)) return { points: 1500, label: "Carré + paire" };
  let points = 0;
  const labels = [];
  counts.forEach((count, index) => {
    const face = index + 1;
    if (count >= 3) {
      if (count === 3) points += face === 1 ? 1000 : face * 100;
      if (count === 4) points += 1000;
      if (count === 5) points += 2000;
      if (count === 6) points += 3000;
      labels.push(`${count}x${face}`);
    }
    const singles = count >= 3 ? 0 : count;
    if (face === 1) points += singles * 100;
    if (face === 5) points += singles * 50;
  });
  return { points, label: points ? labels.join(", ") || "1/5" : "Farkle" };
}

export function scoreSelectedFarkleDice(dice) {
  if (!dice.length) return { points: 0, label: "Aucune sélection" };
  const counts = [1, 2, 3, 4, 5, 6].map((face) => dice.filter((die) => die === face).length);
  const straight = dice.length === 6 && counts.every((count) => count === 1);
  const threePairs = dice.length === 6 && counts.filter((count) => count === 2).length === 3;
  const twoTriplets = dice.length === 6 && counts.filter((count) => count === 3).length === 2;
  const fourAndPair = dice.length === 6 && counts.includes(4) && counts.includes(2);
  const valid = straight || threePairs || twoTriplets || fourAndPair || counts.every((count, index) => {
    const face = index + 1;
    return count === 0 || face === 1 || face === 5 || count >= 3;
  });
  if (!valid) return { points: 0, label: "Sélection invalide" };
  return scoreFarkleRoll(dice);
}

export function createFarkleState(players, options = {}) {
  const modifiers = normalizeGameModifiers("farkle", options.gameModifiers);
  return {
    gameId: "farkle",
    players: publicPlayers(players),
    modifiers,
    currentPlayerIndex: 0,
    scores: {},
    stats: Object.fromEntries(players.map((player) => [player.id, { maxRollScore: 0, maxTurnScore: 0, hotDiceSelections: 0 }])),
    turnScore: 0,
    dice: [],
    remainingDice: 6,
    selectedDice: [],
    lastRoll: null,
    lastDiceByPlayer: {},
    target: modifiers.targetScore,
    bust: false,
    logs: [],
    finished: false,
    winners: []
  };
}

export function applyFarkleAction(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  state.stats ??= {};
  state.stats[actorId] ??= { maxRollScore: 0, maxTurnScore: 0, hotDiceSelections: 0 };
  if (action.type === "roll") {
    if (state.dice.length) throw new Error("Sélectionne des dés scorants ou encaisse avant de relancer.");
    const dice = rollDice(state.remainingDice || 6);
    (state.lastDiceByPlayer ??= {})[actorId] = [...dice];
    const result = scoreFarkleRoll(dice);
    state.stats[actorId].maxRollScore = Math.max(state.stats[actorId].maxRollScore ?? 0, result.points);
    state.dice = dice;
    state.lastRoll = result;
    state.bust = result.points === 0;
    appendLog(state, actorId, `lance ${diceText(dice)}${result.points ? ` (${result.label})` : " et fait Farkle"}.`);
  }
  if (action.type === "select") {
    if (!state.dice.length) throw new Error("Il faut lancer avant de sélectionner.");
    if (state.bust) throw new Error("Aucune combinaison n'est possible sur ce lancer.");
    const indexes = [...new Set((action.indexes ?? []).map(Number))].filter((index) => index >= 0 && index < state.dice.length);
    const selected = indexes.map((index) => state.dice[index]);
    const result = scoreSelectedFarkleDice(selected);
    if (result.points <= 0) throw new Error("La sélection ne marque aucun point.");
    if (state.dice.length === 6 && selected.length === 6) state.stats[actorId].hotDiceSelections = (state.stats[actorId].hotDiceSelections ?? 0) + 1;
    state.turnScore += result.points;
    state.selectedDice = selected;
    appendLog(state, actorId, `marque ${result.points} point(s) avec ${diceText(selected)}.`, "score");
    state.remainingDice = state.dice.length - selected.length;
    if (state.remainingDice <= 0) state.remainingDice = 6;
    state.dice = [];
    state.bust = false;
    state.lastRoll = { ...result, selected };
  }
  if (action.type === "bank") {
    if (state.turnScore <= 0) throw new Error("Aucun point à encaisser.");
    if (state.dice.length) throw new Error("Marque d'abord une combinaison de dés.");
    const entryScore = state.modifiers?.entryScore ?? 0;
    if (!(state.scores[actorId] ?? 0) && state.turnScore < entryScore) throw new Error(`Il faut au moins ${entryScore} points pour entrer dans la partie.`);
    state.stats[actorId].maxTurnScore = Math.max(state.stats[actorId].maxTurnScore ?? 0, state.turnScore);
    state.scores[actorId] = (state.scores[actorId] ?? 0) + state.turnScore;
    appendLog(state, actorId, `encaisse ${state.turnScore} point(s).`, "score");
    state.turnScore = 0;
    state.remainingDice = 6;
    state.selectedDice = [];
    state.dice = [];
    state.bust = false;
    if (state.scores[actorId] >= state.target) {
      state.winners = [actorId];
      state.finished = true;
    } else nextTurn(state);
  }
  if (action.type === "forfeit") {
    if (!state.bust || !state.dice.length) throw new Error("Le lancer contient encore une combinaison possible.");
    appendLog(state, actorId, `termine son tour avec 0 point après un Farkle.`, "result");
    state.turnScore = 0;
    state.remainingDice = 6;
    state.selectedDice = [];
    state.dice = [];
    state.bust = false;
    nextTurn(state);
  }
  return state;
}

export function farkleBotAction(state) {
  if (state.bust) return { type: "forfeit" };
  if (state.dice?.length) {
    const candidates = [];
    for (let mask = 1; mask < (1 << state.dice.length); mask += 1) {
      const indexes = state.dice.map((_, index) => mask & (1 << index) ? index : -1).filter((index) => index >= 0);
      const result = scoreSelectedFarkleDice(indexes.map((index) => state.dice[index]));
      if (result.points > 0) candidates.push({ indexes, points: result.points });
    }
    candidates.sort((left, right) => right.points - left.points || right.indexes.length - left.indexes.length);
    return candidates.length ? { type: "select", indexes: candidates[0].indexes } : { type: "forfeit" };
  }
  return state.turnScore >= 600 ? { type: "bank" } : { type: "roll" };
}
