import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGameModifiers } from "../src/games/modifiers.js";
import { applyMidnightDiceAction, createMidnightDiceState, evaluateMidnightContract, MIDNIGHT_CONTRACT_DEFINITIONS, MIDNIGHT_CONTRACTS, scoreMidnightContract } from "../src/games/engines/midnight-dice.js";
import { applyVelvetRuseAction, createVelvetRuseState } from "../src/games/engines/velvet-ruse.js";
import { normalizeCosmeticCss, normalizeCosmeticDesign, normalizeCosmeticMotion, normalizeCustomKeyframes } from "../src/services/cosmetic-validation.js";
import { applyYahtzeeAction, createYahtzeeState, scoreYahtzee, totalYahtzee, yahtzeeBotAction } from "../src/games/engines/yahtzee.js";
import { apply421Action, create421State, fourTwentyOneBotAction, label421, rank421 } from "../src/games/engines/four-twenty-one.js";
import { applyCulDeChouetteAction, createCulDeChouetteState, culDeChouetteBotAction, scoreCulDeChouette } from "../src/games/engines/cul-de-chouette.js";
import { createGameState } from "../src/games/engines.js";
import { applyFarkleAction, createFarkleState, farkleBotAction, scoreFarkleRoll, scoreSelectedFarkleDice } from "../src/games/engines/farkle.js";
import { applyLiarsDiceAction, createLiarsDiceState, liarsDiceBotAction } from "../src/games/engines/liars-dice.js";
import { applyShutTheBoxAction, createShutTheBoxState, hasShutMove, shutTheBoxBotAction } from "../src/games/engines/shut-the-box.js";
import { applyBlackjackAction, blackjackTotal, createBlackjackState } from "../src/games/engines/blackjack.js";
import { applyPresidentAction, createPresidentState, presidentBotAction, presidentValue } from "../src/games/engines/president.js";
import { canGolfPlay, createGolfSolitaireState } from "../src/games/engines/golf-solitaire.js";
import { canAccordionMove, createAccordionState, hasAccordionMove } from "../src/games/engines/accordion.js";
import { applyTexasHoldemAction, bestPokerHand, comparePokerRanks, createTexasHoldemState, currentPokerHand, pokerFiveRank, pokerHandPreview, texasHoldemBotAction, tickPokerState } from "../src/games/engines/texas-holdem.js";
import { applyBattleAction, battleBotAction, battleScoreFor, createBattleState } from "../src/games/engines/bataille.js";

const players = [
  { id: "p1", pseudo: "Joueur 1" },
  { id: "p2", pseudo: "Joueur 2" }
];

test("les modificateurs sont bornés et complétés par leurs valeurs par défaut", () => {
  assert.deepEqual(normalizeGameModifiers("midnight-dice", { rounds: 99, marketExtra: -4 }), {
    rounds: 8,
    marketExtra: 0,
    discardsPerRound: 1,
    uniqueContracts: true
  });
  assert.deepEqual(normalizeGameModifiers("velvet-ruse", { targetPrestige: 2, claimRule: "inconnue", openDiscardDraw: false }), {
    targetPrestige: 10,
    handSize: 5,
    dossierSize: 6,
    claimRule: "suit-or-rank",
    openDiscardDraw: false
  });
});

test("les douze mandats de Dés de Minuit sont disponibles et scorés", () => {
  assert.equal(MIDNIGHT_CONTRACTS.length, 12);
  assert.deepEqual(new Set(Object.values(MIDNIGHT_CONTRACT_DEFINITIONS).map((contract) => contract.tier)), new Set(["bronze", "silver", "gold", "platinum", "diamond"]));
  assert.equal(scoreMidnightContract("straight", [2, 3, 4]), 54);
  assert.equal(scoreMidnightContract("triple", [6, 6, 6]), 118);
  assert.equal(scoreMidnightContract("lucky-thirteen", [3, 4, 6]), 58);
  assert.equal(scoreMidnightContract("triple", [5, 5, 3]), 13);
  assert.deepEqual(evaluateMidnightContract("summit", [4, 5, 6]), { achieved: true, base: 15, bonus: 65, points: 80, tier: "platinum" });
});

test("Yahtzee centralise les scores, le bonus supérieur et les décisions de l'IA", () => {
  assert.equal(scoreYahtzee([2, 2, 2, 5, 5], "full-house"), 25);
  assert.equal(scoreYahtzee([1, 2, 3, 4, 6], "small-straight"), 30);
  assert.equal(totalYahtzee({ "upper-1": 3, "upper-2": 6, "upper-3": 9, "upper-4": 12, "upper-5": 15, "upper-6": 18 }), 98);

  const state = createYahtzeeState(players, { gameModifiers: { rollsPerTurn: 2 } });
  applyYahtzeeAction(state, "p1", { type: "roll", keepIndexes: [] });
  assert.equal(state.dice.length, 5);
  assert.equal(state.rollsLeft, 1);
  assert.deepEqual(yahtzeeBotAction(state, players[0]), { type: "roll", keepIndexes: [] });
  state.dice = [6, 6, 6, 6, 6];
  applyYahtzeeAction(state, "p1", { type: "score", category: "yahtzee" });
  assert.equal(state.scores.p1.yahtzee, 50);
  assert.equal(state.currentPlayerIndex, 1);
});

test("421 conserve son classement et passe au joueur suivant après validation", () => {
  assert.equal(rank421([4, 2, 1]), 800);
  assert.equal(label421([2, 2, 1]), "Nénette");
  assert.ok(rank421([6, 6, 6]) > rank421([2, 2, 1]));

  const state = create421State(players, { gameModifiers: { rollsPerTurn: 1 } });
  state.dice = [4, 2, 1];
  state.rollsLeft = 0;
  apply421Action(state, "p1", { type: "bank" });
  assert.equal(state.results[0].rank, 800);
  assert.equal(state.currentPlayerIndex, 1);
  assert.deepEqual(fourTwentyOneBotAction(state), { type: "roll", keepIndexes: [] });
});

test("421 propose des relances payantes progressives après les lancers gratuits", () => {
  const state = create421State(players, { gameModifiers: { rollsPerTurn: 1, paidRerollsEnabled: true, paidRerollPrice: 25, paidRerollsPerTurn: 2 } });
  apply421Action(state, "p1", { type: "roll", keepIndexes: [] });
  assert.ok(state.currentCombination?.label);
  apply421Action(state, "p1", { type: "buy-reroll" });
  assert.equal(state.rollsLeft, 1);
  assert.equal(state.paidRerollsUsed.p1, 1);
  apply421Action(state, "p1", { type: "roll", keepIndexes: [] });
  apply421Action(state, "p1", { type: "buy-reroll" });
  assert.equal(state.paidRerollsUsed.p1, 2);
  apply421Action(state, "p1", { type: "roll", keepIndexes: [] });
  assert.throws(() => apply421Action(state, "p1", { type: "buy-reroll" }), /Limite/);
});

test("Cul de Chouette garde ses figures et termine au nombre de manches configuré", () => {
  assert.deepEqual(scoreCulDeChouette([6, 6, 6]), { label: "Cul de chouette de 6", points: 100 });
  assert.deepEqual(scoreCulDeChouette([2, 2, 4]), { label: "Chouette Velute de 4", points: 32 });

  const state = createCulDeChouetteState(players, { gameModifiers: { rounds: 1 } });
  state.dice = [1, 1, 1];
  state.rollsLeft = 0;
  applyCulDeChouetteAction(state, "p1", { type: "bank" });
  state.dice = [1, 2, 4];
  state.rollsLeft = 0;
  applyCulDeChouetteAction(state, "p2", { type: "bank" });
  assert.equal(state.finished, true);
  assert.deepEqual(state.winners, ["p1"]);
  assert.deepEqual(culDeChouetteBotAction(createCulDeChouetteState(players)), { type: "roll", keepIndexes: [] });
});

test("le routeur principal délègue la création aux moteurs spécialisés", () => {
  assert.equal(createGameState("yahtzee", players).gameId, "yahtzee");
  assert.equal(createGameState("421", players).gameId, "421");
  assert.equal(createGameState("cul-de-chouette", players).gameId, "cul-de-chouette");
  assert.equal(createGameState("farkle", players).gameId, "farkle");
  assert.equal(createGameState("liars-dice", players).gameId, "liars-dice");
  assert.equal(createGameState("shut-the-box", players).gameId, "shut-the-box");
  assert.equal(createGameState("blackjack", players).gameId, "blackjack");
  assert.equal(createGameState("president", players).gameId, "president");
  assert.equal(createGameState("texas-holdem", players).gameId, "texas-holdem");
  assert.equal(createGameState("bataille", players).gameId, "bataille");
  assert.equal(createGameState("golf-solitaire", players).gameId, "golf-solitaire");
  assert.equal(createGameState("accordion", players).gameId, "accordion");
});

test("Farkle partage le même calcul entre sélection, partie et IA", () => {
  assert.deepEqual(scoreFarkleRoll([1, 2, 3, 4, 5, 6]), { points: 1500, label: "Suite 1-6" });
  assert.deepEqual(scoreFarkleRoll([2, 2, 2, 3, 3, 3]), { points: 2500, label: "Deux brelans" });
  assert.deepEqual(scoreFarkleRoll([4, 4, 4, 4, 6, 6]), { points: 1500, label: "Carré + paire" });
  assert.equal(scoreSelectedFarkleDice([2]).points, 0);
  const state = createFarkleState(players, { gameModifiers: { targetScore: 3000 } });
  state.target = 500;
  state.turnScore = 500;
  applyFarkleAction(state, "p1", { type: "bank" });
  assert.equal(state.finished, true);
  assert.deepEqual(farkleBotAction(createFarkleState(players)), { type: "roll" });
  const bust = createFarkleState(players);
  bust.dice = [2, 3, 4, 6, 2, 3];
  bust.bust = true;
  assert.deepEqual(farkleBotAction(bust), { type: "forfeit" });
  bust.turnScore = 700;
  applyFarkleAction(bust, "p1", { type: "forfeit" });
  assert.equal(bust.turnScore, 0);
  assert.equal(bust.currentPlayerIndex, 1);
  const hotDice = createFarkleState(players);
  hotDice.dice = [2, 2, 3, 3, 4, 4];
  assert.deepEqual(farkleBotAction(hotDice), { type: "select", indexes: [0, 1, 2, 3, 4, 5] });
});

test("Liar's Dice résout une contestation et élimine le perdant", () => {
  const state = createLiarsDiceState(players, { gameModifiers: { startingDice: 3 } });
  state.diceCounts = { p1: 1, p2: 1 };
  state.hands = { p1: [1], p2: [2] };
  applyLiarsDiceAction(state, "p1", { type: "bid", quantity: 2, face: 6 });
  assert.deepEqual(liarsDiceBotAction(state), { type: "challenge" });
  applyLiarsDiceAction(state, "p2", { type: "challenge" });
  assert.equal(state.finished, true);
  assert.deepEqual(state.winners, ["p2"]);
});

test("Shut the Box valide les combinaisons de tuiles et la fermeture complète", () => {
  assert.equal(hasShutMove([1, 2, 4], 3), true);
  assert.equal(hasShutMove([2, 4], 3), false);
  const state = createShutTheBoxState(players);
  state.boxes.p1 = [1, 2];
  state.lastTotal = 3;
  applyShutTheBoxAction(state, "p1", { type: "shut", numbers: [1, 2] });
  assert.equal(state.finished, true);
  assert.deepEqual(state.winners, ["p1"]);
  assert.deepEqual(shutTheBoxBotAction(createShutTheBoxState(players), players[0]), { type: "roll" });
});

test("Blackjack gère les As et attend que toutes les mains soient terminées", () => {
  assert.equal(blackjackTotal([{ rank: "A" }, { rank: "A" }, { rank: "9" }]), 21);
  const blackjackPlayers = players.map((player) => ({ ...player, tokens: 1000 }));
  const state = createBlackjackState(blackjackPlayers, { gameModifiers: { dealerMode: "classic-17" } });
  applyBlackjackAction(state, "p1", { type: "bet", amount: 10 });
  applyBlackjackAction(state, "p2", { type: "bet", amount: 10 });
  state.hands.p1 = [{ rank: "10", suit: "S" }, { rank: "Q", suit: "D" }];
  state.hands.p2 = [{ rank: "9", suit: "S" }, { rank: "8", suit: "D" }];
  state.dealer = [{ rank: "10", suit: "C" }, { rank: "7", suit: "H" }];
  applyBlackjackAction(state, "p1", { type: "stand" });
  assert.equal(state.finished, false);
  applyBlackjackAction(state, "p2", { type: "stand" });
  assert.equal(state.finished, true);
  assert.ok(state.logs.findIndex((entry) => entry.actorId === "dealer" && entry.text.includes("termine")) > state.logs.findIndex((entry) => entry.actorId === "p2"));
});

test("Blackjack double la mise, distribue une seule carte puis termine la main", () => {
  const blackjackPlayers = players.map((player) => ({ ...player, tokens: 1000 }));
  const state = createBlackjackState(blackjackPlayers, { gameModifiers: { dealerMode: "classic-17", minimumBet: 10 } });
  applyBlackjackAction(state, "p1", { type: "bet", amount: 10 });
  applyBlackjackAction(state, "p2", { type: "bet", amount: 10 });
  state.hands.p1 = [{ rank: "5", suit: "S" }, { rank: "6", suit: "D" }];
  const before = state.hands.p1.length;
  applyBlackjackAction(state, "p1", { type: "double" });
  assert.equal(state.bets.p1, 20);
  assert.equal(state.hands.p1.length, before + 1);
  assert.ok(state.completedPlayerIds.includes("p1"));
});

test("Blackjack refuse une mise au-dessus du plafond de la table", () => {
  const state = createBlackjackState(players, { gameModifiers: { minimumBet: 50, maximumBet: 100 } });
  assert.throws(() => applyBlackjackAction(state, "p1", { type: "bet", amount: 101 }), /maximale/);
  applyBlackjackAction(state, "p1", { type: "bet", amount: 100 });
  assert.equal(state.bets.p1, 100);
});

test("Président conserve l'ordre, la révolution et la logique de l'IA", () => {
  assert.ok(presidentValue("2") > presidentValue("A"));
  assert.ok(presidentValue("2", true) < presidentValue("A", true));
  const state = createPresidentState(players);
  state.hands = { p1: [{ rank: "3", suit: "S" }], p2: [{ rank: "4", suit: "H" }] };
  assert.deepEqual(presidentBotAction(state, players[0]), { type: "play", rank: "3", count: 1 });
  applyPresidentAction(state, "p1", { type: "play", cards: [{ rank: "3", suit: "S" }] });
  assert.equal(state.finished, true);
  assert.deepEqual(state.finishedOrder, ["p1", "p2"]);
});

test("les deux solitaires exposent leurs règles de déplacement", () => {
  assert.equal(canGolfPlay({ rank: "K" }, { rank: "A" }, { wrapRanks: false }), false);
  assert.equal(canGolfPlay({ rank: "K" }, { rank: "A" }, { wrapRanks: true }), true);
  assert.equal(createGolfSolitaireState(players).players.length, 1);
  const piles = [[{ rank: "4", suit: "S" }], [{ rank: "4", suit: "H" }]];
  assert.equal(canAccordionMove(piles, 1, 0, { allowOneApart: true, allowThreeApart: true }), true);
  assert.equal(hasAccordionMove(piles, { allowOneApart: true, allowThreeApart: true }), true);
  assert.equal(createAccordionState(players).piles.length, 52);
});

test("Texas Hold'em classe les mains et conserve une petite blinde égale à la moitié de la grosse", () => {
  const straightFlush = pokerFiveRank([
    { rank: "K", suit: "H" }, { rank: "Q", suit: "H" }, { rank: "J", suit: "H" },
    { rank: "10", suit: "H" }, { rank: "9", suit: "H" }
  ]);
  const fullHouse = pokerFiveRank([
    { rank: "8", suit: "H" }, { rank: "8", suit: "D" }, { rank: "8", suit: "S" },
    { rank: "4", suit: "C" }, { rank: "4", suit: "H" }
  ]);
  assert.ok(comparePokerRanks(straightFlush, fullHouse) > 0);
  assert.equal(bestPokerHand([
    { rank: "K", suit: "H" }, { rank: "Q", suit: "H" }, { rank: "J", suit: "H" },
    { rank: "10", suit: "H" }, { rank: "9", suit: "H" }, { rank: "2", suit: "C" },
    { rank: "3", suit: "D" }
  ])[0], 8);

  const state = createTexasHoldemState(players, { buyIn: 1000, bigBlind: 21 });
  assert.equal(state.bigBlind, 22);
  assert.equal(state.smallBlind, 11);
  assert.equal(state.pot, 33);
  const currentBet = state.currentBet;
  state.currentBet = state.streetBets.p1;
  assert.deepEqual(texasHoldemBotAction(state, players[0]), { type: "check" });
  state.currentBet = currentBet;
  applyTexasHoldemAction(state, "p1", { type: "fold" });
  assert.equal(state.stacks.p2, 1011);
  assert.ok(state.nextHandAt);
});

test("Texas Hold'em résout la main avant d'éliminer les joueurs à tapis", () => {
  const state = createTexasHoldemState(players, { buyIn: 1000, bigBlind: 20 });
  applyTexasHoldemAction(state, "p1", { type: "all-in" });
  applyTexasHoldemAction(state, "p2", { type: "call" });
  assert.equal(state.showdown, true);
  assert.equal(state.community.length, 5);
  assert.equal(state.nextHandAt - state.resolutionStartedAt, 7000);
  assert.deepEqual([...state.shownPlayerIds].sort(), ["p1", "p2"]);
  assert.equal(Object.values(state.stacks).reduce((sum, amount) => sum + amount, 0), 2000);
});

test("Texas Hold'em affiche le score potentiel et autorise une révélation volontaire", () => {
  assert.equal(currentPokerHand([{ rank: "8", suit: "H" }, { rank: "8", suit: "S" }])[0], 1);
  assert.match(pokerHandPreview([{ rank: "8", suit: "H" }, { rank: "8", suit: "S" }]).label, /Paire de 8/);
  const state = createTexasHoldemState(players, { buyIn: 1000, bigBlind: 20 });
  applyTexasHoldemAction(state, "p1", { type: "fold" });
  applyTexasHoldemAction(state, "p1", { type: "show" });
  assert.ok(state.shownPlayerIds.includes("p1"));
  assert.ok(state.handRanks.p1);
});

test("Texas Hold'em applique le plafond et l'option parole ou coucher automatique", () => {
  const state = createTexasHoldemState(players, { buyIn: 1000, bigBlind: 50, maximumBet: 100 });
  assert.equal(state.maximumBet, 100);
  assert.throws(() => applyTexasHoldemAction(state, "p1", { type: "raise", amount: 150 }), /maximale/);
  applyTexasHoldemAction(state, "p1", { type: "auto-check-fold", enabled: true });
  assert.equal(state.foldedPlayerIds.includes("p1"), false);
  assert.equal(tickPokerState(state, state.autoCheckFoldEnabledAt.p1 + 9999), false);
  tickPokerState(state, state.autoCheckFoldEnabledAt.p1 + 10001);
  assert.ok(state.foldedPlayerIds.includes("p1"));
  assert.ok(state.nextHandAt);

  const checkState = createTexasHoldemState(players, { buyIn: 1000, bigBlind: 50, maximumBet: 100 });
  checkState.streetBets.p1 = checkState.currentBet;
  applyTexasHoldemAction(checkState, "p1", { type: "auto-check-fold", enabled: true });
  tickPokerState(checkState, checkState.autoCheckFoldEnabledAt.p1 + 10001);
  assert.equal(checkState.foldedPlayerIds.includes("p1"), false);
  assert.ok(checkState.actedPlayerIds.includes("p1"));
});

test("la Bataille ne confronte jamais deux cartes placées sur des piles différentes", () => {
  const state = createBattleState(players, { battleModifiers: { pileMode: "double", scoringMode: "high-card" } });
  assert.equal(state.cardCounts.p1, 26);
  assert.equal(state.cardCounts.p2, 26);
  assert.deepEqual(battleBotAction(state, players[0]), { type: "draw" });
  applyBattleAction(state, "p1", { type: "draw" });
  applyBattleAction(state, "p2", { type: "draw" });
  applyBattleAction(state, "p1", { type: "place", laneId: "left" });
  applyBattleAction(state, "p2", { type: "place", laneId: "right" });
  assert.equal(state.resolutionEndsAt, null);
  assert.equal(state.round, 2);
  assert.equal(state.battleLanes.find((lane) => lane.id === "left").cards.length, 1);
  assert.equal(state.battleLanes.find((lane) => lane.id === "right").cards.length, 1);
  assert.equal(battleScoreFor([{ rank: "5", suit: "H" }, { rank: "8", suit: "S" }], "pile-sum").total, 13);
});

test("un identifiant de jeu inconnu est rejeté par le routeur", () => {
  assert.throws(() => createGameState("jeu-inexistant", players), /Jeu inconnu/);
});

test("Dés de Minuit enchaîne le choix des mandats, le draft et la résolution", () => {
  const state = createMidnightDiceState(players, { gameModifiers: { rounds: 3, marketExtra: 0, discardsPerRound: 0 } });
  assert.equal(state.phase, "contract");
  assert.equal(state.contractOffers.length, 4);

  applyMidnightDiceAction(state, "p1", { type: "choose-contract", contract: state.contractOffers[0] });
  applyMidnightDiceAction(state, "p2", { type: "choose-contract", contract: state.contractOffers[1] });
  assert.equal(state.phase, "draft");
  assert.equal(state.market.length, 6);

  for (let turn = 0; turn < 6; turn += 1) {
    const actor = state.players[state.currentPlayerIndex].id;
    applyMidnightDiceAction(state, actor, { type: "draft", index: 0 });
  }

  assert.equal(state.lastRound.round, 1);
  assert.equal(state.lastRound.results.length, 2);
  assert.equal(state.round, 2);
  assert.equal(state.phase, "contract");
});

test("Velours Noir conserve son cycle pioche, déclaration et verdict", () => {
  const state = createVelvetRuseState(players, { gameModifiers: { handSize: 3, dossierSize: 3 } });
  const initialHandSize = state.hands.p1.length;

  applyVelvetRuseAction(state, "p1", { type: "draw", source: "deck" });
  assert.equal(state.phase, "play");
  assert.equal(state.hands.p1.length, initialHandSize + 1);

  applyVelvetRuseAction(state, "p1", { type: "declare", cardIndex: 0, claimRank: state.edict.rank, claimSuit: state.edict.suit });
  assert.equal(state.phase, "decision");
  assert.equal(state.pendingClaim.playerId, "p1");

  applyVelvetRuseAction(state, "p2", { type: "trust" });
  assert.equal(state.phase, "draw");
  assert.equal(state.dossier.length, 1);
  assert.equal(state.prestige.p1, 1);
});

test("la personnalisation cosmétique filtre le CSS et les keyframes dangereux", () => {
  assert.equal(normalizeCosmeticCss(" color: red; @import{} "), "");
  assert.equal(normalizeCosmeticCss("background-image:url(https://example.test/texture.png)", { allowUrls: true }), "background-image: url(https://example.test/texture.png);");
  assert.equal(normalizeCosmeticCss("background-image:url(javascript:alert(1))", { allowUrls: true }), "");
  assert.equal(normalizeCosmeticCss("position:fixed; inset:0; color:#fff"), "color: #fff;");
  assert.equal(normalizeCustomKeyframes("from { transform: translateX(0); } to { transform: translateX(12px); opacity: .8; }"), "from{transform:translateX(0);}to{transform:translateX(12px);opacity:.8;}");
  assert.equal(normalizeCustomKeyframes("from { background: url(javascript:alert(1)); } to { opacity: 1; }"), "");
  assert.equal(normalizeCosmeticMotion({ preset: "spin", duration: 100, intensity: -5 }).duration, 20);
  assert.equal(normalizeCosmeticDesign({ primaryColor: "#123456" }, "profileBanners").primaryColor, "#123456");
  assert.equal(normalizeCosmeticDesign({ borderWidth: 99 }, "profileFrames").borderWidth, 8);
});
