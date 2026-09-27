import { createDeck, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, publicPlayers } from "../engine-context.js";

export function canAccordionMove(piles, from, to, modifiers = {}) {
  const distances = [modifiers.allowOneApart !== false && 1, modifiers.allowThreeApart !== false && 3].filter((value) => Number.isInteger(value));
  if (!distances.some((distance) => to === from - distance) || !piles[from] || !piles[to]) return false;
  const source = piles[from].at(-1);
  const target = piles[to].at(-1);
  return source.rank === target.rank || source.suit === target.suit;
}

export function hasAccordionMove(piles, modifiers = {}) {
  return piles.some((_, index) => canAccordionMove(piles, index, index - 1, modifiers) || canAccordionMove(piles, index, index - 3, modifiers));
}

export function createAccordionState(players, options = {}) {
  return { gameId: "accordion", players: publicPlayers(players.slice(0, 1)), modifiers: normalizeGameModifiers("accordion", options.gameModifiers), piles: shuffle(createDeck()).map((card) => [card]), logs: [], finished: false, winners: [], score: null };
}

export function applyAccordionAction(state, actorId, action) {
  if (state.players[0].id !== actorId) throw new Error("Ce n'est pas ta partie.");
  if (action.type === "move") {
    const from = Number(action.from);
    const to = Number(action.to);
    if (!canAccordionMove(state.piles, from, to, state.modifiers)) throw new Error("Déplacement impossible.");
    state.piles[to].push(...state.piles[from]);
    state.piles.splice(from, 1);
    appendLog(state, actorId, `déplace la pile ${from + 1} vers ${to + 1}.`);
  }
  if (state.piles.length === 1 || !hasAccordionMove(state.piles, state.modifiers)) {
    state.score = state.piles.length;
    state.winners = state.piles.length === 1 ? [actorId] : [];
    state.finished = true;
  }
  return state;
}
