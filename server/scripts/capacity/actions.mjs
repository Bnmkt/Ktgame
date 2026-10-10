import { yahtzeeBotAction } from "../../src/games/engines/yahtzee.js";
import { fourTwentyOneBotAction } from "../../src/games/engines/four-twenty-one.js";
import { culDeChouetteBotAction } from "../../src/games/engines/cul-de-chouette.js";
import { farkleBotAction } from "../../src/games/engines/farkle.js";
import { liarsDiceBotAction } from "../../src/games/engines/liars-dice.js";
import { shutTheBoxBotAction } from "../../src/games/engines/shut-the-box.js";
import { presidentBotAction } from "../../src/games/engines/president.js";
import { midnightDiceBotAction } from "../../src/games/engines/midnight-dice.js";
import { velvetRuseBotAction } from "../../src/games/engines/velvet-ruse.js";
import { texasHoldemBotAction } from "../../src/games/engines/texas-holdem.js";
import { battleBotAction } from "../../src/games/engines/bataille.js";
import { blackjackTotal } from "../../src/games/engines/blackjack.js";
import { canGolfPlay } from "../../src/games/engines/golf-solitaire.js";
import { canAccordionMove } from "../../src/games/engines/accordion.js";

const strategies = { yahtzee: yahtzeeBotAction, "421": fourTwentyOneBotAction, "cul-de-chouette": culDeChouetteBotAction,
  farkle: farkleBotAction, "liars-dice": liarsDiceBotAction, "shut-the-box": shutTheBoxBotAction, president: presidentBotAction,
  "midnight-dice": midnightDiceBotAction, "velvet-ruse": velvetRuseBotAction, "texas-holdem": texasHoldemBotAction, bataille: battleBotAction };

export function actorFor(state) {
  if (state.gameId === "blackjack") return state.players.find((player) => !state.bets[player.id])?.id ?? state.players[state.currentPlayerIndex]?.id;
  return state.players[state.currentPlayerIndex ?? 0]?.id;
}

export function actionFor(state, id) {
  const actor = state.players.find((player) => player.id === id);
  if (!actor || state.finished || state.resolutionEndsAt || state.nextHandAt) return null;
  if (state.gameId === "blackjack") {
    if (!state.bets[id]) return { type: "bet", amount: state.modifiers.minimumBet };
    return { type: blackjackTotal(state.hands[id]) < 17 ? "hit" : "stand" };
  }
  // Public Belote projections intentionally omit private holders and other hands.
  if (state.gameId === "belote") {
    if (state.phase === "round-end") return { type: "next-deal" };
    if (["bid", "forced-bid"].includes(state.phase)) return { type: "take", suit: state.bidRound === 1 ? state.turnedCard.suit : ["S","H","D","C"].find((suit) => suit !== state.turnedCard.suit) };
    return state.legalCards?.length ? { type: "play", card: state.legalCards[0] } : null;
  }
  if (state.gameId === "golf-solitaire") {
    const column = state.tableau.findIndex((cards) => canGolfPlay(cards.at(-1), state.waste, state.modifiers));
    return column >= 0 ? { type: "play", column } : state.stock.length ? { type: "draw" } : null;
  }
  if (state.gameId === "accordion") {
    for (let from=0; from<state.piles.length; from++) for (const distance of [1,3]) if (canAccordionMove(state.piles,from,from-distance,state.modifiers)) return { type: "move", from, to: from-distance };
    // The engine checks termination after applying a move/no-op, like the board.
    return { type: "finish" };
  }
  const action = strategies[state.gameId]?.(state, actor);
  if (!action && !Object.hasOwn(strategies,state.gameId)) throw new Error(`No adapter for ${state.gameId}`);
  return action;
}
