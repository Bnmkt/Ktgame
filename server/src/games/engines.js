import { applyMidnightDiceAction, createMidnightDiceState } from "./engines/midnight-dice.js";
import { applyVelvetRuseAction, createVelvetRuseState } from "./engines/velvet-ruse.js";
import { applyYahtzeeAction, createYahtzeeState } from "./engines/yahtzee.js";
import { apply421Action, create421State } from "./engines/four-twenty-one.js";
import { applyCulDeChouetteAction, createCulDeChouetteState } from "./engines/cul-de-chouette.js";
import { applyFarkleAction, createFarkleState } from "./engines/farkle.js";
import { applyLiarsDiceAction, createLiarsDiceState } from "./engines/liars-dice.js";
import { applyShutTheBoxAction, createShutTheBoxState } from "./engines/shut-the-box.js";
import { applyBlackjackAction, createBlackjackState } from "./engines/blackjack.js";
import { applyPresidentAction, createPresidentState } from "./engines/president.js";
import { applyGolfSolitaireAction, createGolfSolitaireState } from "./engines/golf-solitaire.js";
import { applyAccordionAction, createAccordionState } from "./engines/accordion.js";
import { applyTexasHoldemAction, createTexasHoldemState } from "./engines/texas-holdem.js";
import { applyBattleAction, createBattleState } from "./engines/bataille.js";
import { applyBeloteAction, createBeloteState } from "./engines/belote.js";

export { pokerHandLabel, pokerHandPreview, tickPokerState } from "./engines/texas-holdem.js";
export { tickBattleState } from "./engines/bataille.js";

const gameFactories = new Map([
  ["belote", createBeloteState],
  ["yahtzee", createYahtzeeState],
  ["421", create421State],
  ["cul-de-chouette", createCulDeChouetteState],
  ["blackjack", createBlackjackState],
  ["texas-holdem", createTexasHoldemState],
  ["bataille", createBattleState],
  ["farkle", createFarkleState],
  ["liars-dice", createLiarsDiceState],
  ["shut-the-box", createShutTheBoxState],
  ["midnight-dice", createMidnightDiceState],
  ["velvet-ruse", createVelvetRuseState],
  ["golf-solitaire", createGolfSolitaireState],
  ["accordion", createAccordionState],
  ["president", createPresidentState],
]);

const gameActions = new Map([
  ["belote", applyBeloteAction],
  ["yahtzee", applyYahtzeeAction],
  ["421", apply421Action],
  ["cul-de-chouette", applyCulDeChouetteAction],
  ["blackjack", applyBlackjackAction],
  ["texas-holdem", applyTexasHoldemAction],
  ["bataille", applyBattleAction],
  ["farkle", applyFarkleAction],
  ["liars-dice", applyLiarsDiceAction],
  ["shut-the-box", applyShutTheBoxAction],
  ["midnight-dice", applyMidnightDiceAction],
  ["velvet-ruse", applyVelvetRuseAction],
  ["golf-solitaire", applyGolfSolitaireAction],
  ["accordion", applyAccordionAction],
  ["president", applyPresidentAction],
]);

export function createGameState(gameId, players, options = {}) {
  const createState = gameFactories.get(gameId);
  if (!createState) throw new Error("Jeu inconnu.");
  return createState(players, options);
}

export function applyAction(state, actorId, action) {
  const applyGameAction = gameActions.get(state.gameId);
  if (!applyGameAction) throw new Error("Jeu inconnu.");
  // Les jeux de casino conservent une action d'affichage volontaire après la fin de la main.
  if (state.finished && !["blackjack", "texas-holdem"].includes(state.gameId)) return state;
  return applyGameAction(state, actorId, action);
}
