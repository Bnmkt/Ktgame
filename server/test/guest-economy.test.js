import test from "node:test";
import assert from "node:assert/strict";
import { GUEST_TOKENS, walletTokens } from "../../client/src/features/games/token-economy.js";
import { fundedRoomPlayers, classicRoomPayouts, pokerAvailableFunds, pokerRoomPayouts } from "../src/services/room-economy.js";
import { createTexasHoldemState } from "../src/games/engines/texas-holdem.js";
import { createBlackjackState, applyBlackjackAction } from "../src/games/engines/blackjack.js";
import { createRoomRuntime } from "../src/services/room-runtime.js";

const registered = { id: "registered", pseudo: "Registered", tokens: 20000 };
const guest = { id: "guest", pseudo: "Guest", guest: true, tokens: 9999999 };
const bot = { id: "bot", pseudo: "Bot", isBot: true, guest: true, tokens: 10000 };
const sum = (values) => Object.values(values).reduce((total, amount) => total + amount, 0);

test("guest wallet values are fixed independently of stored balance and registered balances are unchanged", () => {
  for (const tokens of [-500, 0, 7000, 99999999]) assert.equal(walletTokens({ ...guest, tokens }), GUEST_TOKENS);
  assert.equal(walletTokens(registered), registered.tokens);
});

test("hundreds of guest seats cannot increase a real pot or receive its winnings", () => {
  const guests = Array.from({ length: 200 }, (_, index) => ({ ...guest, id: `guest-${index}` }));
  const room = { stake: 1000, players: [...guests, registered, bot] };
  const funded = fundedRoomPlayers(room.players);
  assert.deepEqual(funded, [registered]);
  const pot = room.stake * funded.length;
  assert.deepEqual(classicRoomPayouts(room, room.players, pot), { registered: 1000 });
  assert.deepEqual(classicRoomPayouts({ players: guests }, guests, 0), {});
  const second = { ...registered, id: "second" };
  room.players.push(second);
  assert.deepEqual(classicRoomPayouts(room, [...guests, second, registered], 2000), { second: 1400, registered: 600 });
});

test("the account store is authoritative even when an old room omitted guest markers", () => {
  const room = { stake: 1000, players: [registered, { id: guest.id }], state: { players: [registered, { id: guest.id }], realBankroll: 2000, stacks: { registered: 2000, guest: 0 } } };
  const account = (id) => id === guest.id ? guest : registered;
  assert.deepEqual(fundedRoomPlayers(room.players, account), [registered]);
  assert.equal(pokerAvailableFunds(room, account), 1000);
  assert.deepEqual(pokerRoomPayouts(room, account), { registered: 1000 });
});

test("poker keeps virtual stacks playable but never redeems guest or bot buy-ins", () => {
  const players = [registered, guest, bot];
  const state = createTexasHoldemState(players, { buyIn: 1000 });
  assert.equal(state.realBankroll, 1000);
  assert.equal(state.players.find(({ id }) => id === guest.id).guest, true);
  assert.equal(state.players.find(({ id }) => id === guest.id).tokens, 10000);
  state.stacks.registered = 999999;
  const room = { stake: 1000, players, state };
  assert.equal(sum(pokerRoomPayouts(room)), 1000);
  state.departedPayouts.registered = 800;
  assert.equal(sum(pokerRoomPayouts(room)), 200);
  state.departedPayouts.registered = 1200;
  assert.equal(sum(pokerRoomPayouts(room)), 0);
  const allGuests = { stake: 1000, players: [guest, bot], state: createTexasHoldemState([guest, bot], { buyIn: 1000 }) };
  assert.equal(allGuests.state.realBankroll, 0);
  assert.deepEqual(pokerRoomPayouts(allGuests), {});
});

test("guest poker exits and registered exits together cannot exceed registered deposits", () => {
  const players = [registered, guest], state = createTexasHoldemState(players, { buyIn: 1000 });
  state.realBankroll = 2000; state.currentPlayerIndex = -1;
  state.stacks = { registered: 900000, guest: 900000 };
  const room = { id: "room", stake: 1000, gameId: "texas-holdem", players: [...players], state };
  const db = { users: players }, ledger = [];
  const runtime = createRoomRuntime({ addTokens: (_db, id, amount) => ledger.push({ id, amount }) });
  assert.equal(runtime.cashOutPokerPlayer(room, db, guest.id), 0);
  assert.equal(state.departedPayouts.guest, 0);
  assert.equal(runtime.cashOutPokerPlayer(room, db, registered.id), 1000);
  assert.equal(runtime.cashOutPokerPlayer(room, db, registered.id), 0);
  assert.deepEqual(ledger, [{ id: registered.id, amount: 1000 }]);
});

test("a guest blackjack win remains a gameplay win without a wallet reward", () => {
  const state = createBlackjackState([registered, guest]);
  state.modifiers.dealerMode = "classic-17";
  state.bets = { registered: 100, guest: 100 };
  state.hands = { registered: [{ rank: "A" }, { rank: "K" }], guest: [{ rank: "A" }, { rank: "K" }] };
  state.dealer = [{ rank: "K" }, { rank: "Q" }];
  applyBlackjackAction(state, registered.id, { type: "stand" });
  applyBlackjackAction(state, guest.id, { type: "stand" });
  assert.equal(state.finished, true);
  assert.ok(state.winners.includes(guest.id));
  assert.deepEqual(state.payouts, { registered: 200 });
  assert.equal(state.players.find(({ id }) => id === guest.id).tokens, 10000);
});
