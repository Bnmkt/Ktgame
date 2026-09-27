import test from "node:test";
import assert from "node:assert/strict";
import { games } from "../src/games/shared.js";
import { createGameState } from "../src/games/engines.js";
import { spectatorState } from "../src/games/spectator-state.js";
import { beloteSeats, chooseBeloteTeam } from "../src/games/belote-seats.js";

const players = Array.from({ length: 4 }, (_, index) => ({ id: `p${index}`, pseudo: `Player ${index}`, tokens: 10000, isBot: index > 1 }));
test("public dice rolls survive turn changes, while Liar's Dice stays secret", () => {
  for (const gameId of ["yahtzee", "421", "cul-de-chouette", "farkle", "shut-the-box"]) {
    const state = createGameState(gameId, players.slice(0, 2));
    state.dice = [4, 2, 1]; state.lastDiceByPlayer = { p0: [6, 6, 6], p1: [4, 2, 1] };
    assert.deepEqual(spectatorState(state).dice, state.dice);
    assert.deepEqual(spectatorState(state).lastDiceByPlayer, state.lastDiceByPlayer);
    state.dice = [];
    assert.deepEqual(spectatorState(state).lastDiceByPlayer.p0, [6, 6, 6]);
  }
  const liar = createGameState("liars-dice", players.slice(0, 2));
  liar.dice = [1, 2, 3]; liar.lastDiceByPlayer = { p0: [1, 2, 3] };
  assert.equal(spectatorState(liar).dice, undefined);
  assert.equal(spectatorState(liar).lastDiceByPlayer, undefined);
});
for (const game of games) test(`${game.id}: spectator schema excludes private fields and future engine internals`, () => {
  const state = createGameState(game.id, players.slice(0, game.minPlayers));
  state.internalFuture = "PRIVATE_SENTINEL";
  state.deck = ["PRIVATE_SENTINEL"];
  state.stock = ["PRIVATE_SENTINEL"];
  state.deckKnowledge = { p0: "PRIVATE_SENTINEL" };
  state.pendingChoices = { p0: "PRIVATE_SENTINEL" };
  state.secretContracts = { p0: "PRIVATE_SENTINEL" };
  state.handRanks = { p0: "PRIVATE_SENTINEL" };
  state.hands ??= {};
  state.hands.p0 = [{ rank: "PRIVATE_SENTINEL", suit: "S" }];
  if (game.id === "belote") state.announcements.p0 = [{ cards: ["PRIVATE_SENTINEL"] }];
  const before = structuredClone(state), view = spectatorState(state);
  assert.ok(!JSON.stringify(view).includes("PRIVATE_SENTINEL"));
  assert.ok(!("deck" in view)); assert.ok(!("stock" in view));
  assert.deepEqual(view.hands.p0, [null]);
  assert.deepEqual(state, before);
});

test("blackjack hole card and private action log remain hidden even after finish", () => {
  const state = createGameState("blackjack", [players[0]]);
  state.dealer = [{ rank: "A", suit: "S" }, { rank: "K", suit: "D" }];
  state.hands.p0 = [{ rank: "9", suit: "S" }, { rank: "7", suit: "H" }];
  state.logs = [{ type: "bet", text: "receives SECRET" }, { type: "action", text: "draws SECRET" }];
  let view = spectatorState(state);
  assert.equal(view.dealer[1], null); assert.ok(!JSON.stringify(view).includes("SECRET"));
  state.finished = true; view = spectatorState(state);
  assert.deepEqual(view.dealer, state.dealer); assert.deepEqual(view.hands.p0, [null, null]);
  assert.ok(!JSON.stringify(view).includes("SECRET"));
  state.shownPlayerIds = ["p0"];
  assert.deepEqual(spectatorState(state).hands.p0, state.hands.p0);
});

test("poker only exposes voluntarily shown hands; bluff declarations omit actual cards", () => {
  const poker = createGameState("texas-holdem", players.slice(0, 2));
  poker.shownPlayerIds = ["p0"];
  assert.deepEqual(spectatorState(poker).hands.p0, poker.hands.p0);
  assert.deepEqual(spectatorState(poker).hands.p1, [null, null]);
  const bluff = createGameState("velvet-ruse", players.slice(0, 2));
  bluff.pendingClaim = { playerId: "p0", claim: { rank: "A", suit: "S" }, actual: { rank: "SECRET", suit: "H" } };
  bluff.dossier = [bluff.pendingClaim];
  assert.ok(!JSON.stringify(spectatorState(bluff)).includes("SECRET"));
});

test("battle cards are hidden until marked public; unknown engines fail closed", () => {
  const state = createGameState("bataille", players.slice(0, 2));
  state.battleLanes[0].cards = [{ rank: "SECRET", suit: "S", ownerId: "p0" }, { rank: "Q", suit: "H", ownerId: "p1", revealedToAll: true }];
  assert.ok(!JSON.stringify(spectatorState(state)).includes("SECRET"));
  assert.equal(spectatorState(state).battleLanes[0].cards[1].rank, "Q");
  assert.ok(!JSON.stringify(spectatorState({ gameId: "unknown", secret: "SECRET", logs: [{ text: "SECRET" }] })).includes("SECRET"));
});

test("team selection preserves four seats, permissions and opposite partners", () => {
  const room = { gameId: "belote", players, ownerId: "p0", readyPlayerIds: ["p0", "p1"] };
  assert.deepEqual(beloteSeats(room), ["p0", "p1", "p2", "p3"]);
  chooseBeloteTeam(room, "p1", "p1", 0);
  assert.equal(room.beloteSeats.indexOf("p1") % 2, 0);
  assert.equal(room.beloteSeats.indexOf("p0") % 2, 0);
  assert.equal(new Set(room.beloteSeats).size, 4); assert.deepEqual(room.readyPlayerIds, []);
  assert.throws(() => chooseBeloteTeam(room, "p1", "p0", 1));
  assert.throws(() => chooseBeloteTeam(room, "outsider", "p1", 1));
  assert.throws(() => chooseBeloteTeam(room, "p0", "p1", 4));
  room.state = {}; assert.throws(() => chooseBeloteTeam(room, "p0", "p1", 1));
});

test("seats survive replay and departures without duplicates", () => {
  const room = { gameId: "belote", players, ownerId: "p0", beloteSeats: ["p3", "p1", "p0", "p2"] };
  assert.deepEqual(beloteSeats(room), ["p3", "p1", "p0", "p2"]);
  room.players = players.filter((player) => player.id !== "p1");
  assert.deepEqual(beloteSeats(room), ["p3", null, "p0", "p2"]);
  room.players.push({ id: "new" }); assert.deepEqual(beloteSeats(room), ["p3", "new", "p0", "p2"]);
});
