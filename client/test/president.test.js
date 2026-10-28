import test from "node:test";
import assert from "node:assert/strict";
import { canPlayPresidentSet, hasPlayablePresidentSet, presidentCardValue } from "../src/features/games/president.js";
import { presidentValue } from "../../server/src/games/engines/president.js";
import { movePresidentCard, presidentCardKey, presidentDealSequence, presidentHandGeometry, reconcilePresidentHand } from "../src/features/games/president.js";

const cards = (...ranks) => ranks.map((rank, index) => ({ rank, suit: ["S", "H", "D", "C"][index % 4] }));
const state = (rank, count = 1, revolution = false) => ({ currentSet: { rank, count }, revolution });

test("les valeurs de President correspondent au serveur avec et sans revolution", () => {
  for (const revolution of [false, true]) for (const rank of ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]) {
    assert.equal(presidentCardValue(rank, revolution), presidentValue(rank, revolution));
  }
});

test("un 2 est imbattable normalement mais jouable en revolution", () => {
  assert.equal(hasPlayablePresidentSet(state("2"), cards("3", "A", "2")), false);
  assert.equal(hasPlayablePresidentSet(state("2", 1, true), cards("3", "A")), true);
});

test("un 3 est imbattable en revolution et un 4 bat un 3 normalement", () => {
  assert.equal(hasPlayablePresidentSet(state("3", 1, true), cards("4", "A", "2")), false);
  assert.equal(canPlayPresidentSet(state("3"), "4", 1), true);
  assert.equal(canPlayPresidentSet(state("3", 1, true), "4", 1), false);
});

test("la disponibilite exige assez de cartes de la meme valeur", () => {
  assert.equal(hasPlayablePresidentSet(state("K", 2), cards("A", "2")), false);
  assert.equal(hasPlayablePresidentSet(state("K", 2), cards("A", "A", "2")), true);
  assert.equal(hasPlayablePresidentSet(state("K", 2, true), cards("Q", "Q", "2")), true);
  assert.equal(hasPlayablePresidentSet(state("K", 2, true), cards("Q", "J", "2")), false);
});

test("une ouverture libre ne declenche jamais un passage force pour une main non vide", () => {
  assert.equal(hasPlayablePresidentSet({ currentSet: null }, cards("3")), true);
  assert.equal(hasPlayablePresidentSet({ currentSet: null }, []), false);
});

test("un ordre manuel survit aux snapshots, aux cartes jouées et aux nouveaux éléments", () => {
  const hand = cards("K", "3", "A", "7");
  const keys = hand.map(presidentCardKey);
  const order = movePresidentCard(keys, keys[2], 0);
  assert.deepEqual(reconcilePresidentHand(hand, order).map(card => card.rank), ["A", "K", "3", "7"]);
  assert.deepEqual(reconcilePresidentHand([hand[3], hand[0], hand[2]], order).map(card => card.rank), ["A", "K", "7"]);
  assert.deepEqual(reconcilePresidentHand(hand).map(card => card.rank), ["K", "3", "A", "7"]);
});

test("la main entière tient dans la largeur disponible, sans déformer les cartes", () => {
  for (const width of [260, 380, 800, 1200]) for (const count of [1, 9, 18, 26]) {
    const { cardWidth, step, start } = presidentHandGeometry(width, count);
    assert.ok(cardWidth > 0 && start >= 0);
    assert.ok(start + step * (count - 1) + cardWidth <= width);
    if (width >= 800 && count <= 18) assert.ok(step >= 24 || count === 1);
  }
});

test("la distribution suit les sièges et les comptes réels sans utiliser les faces adverses", () => {
  const state = { players: [{ id: "a" }, { id: "b" }, { id: "c" }], hands: { a: [null, null, null], b: [null, null], c: [null, null] } };
  assert.deepEqual(presidentDealSequence(state), [
    { playerId: "a", index: 0 }, { playerId: "b", index: 0 }, { playerId: "c", index: 0 },
    { playerId: "a", index: 1 }, { playerId: "b", index: 1 }, { playerId: "c", index: 1 }, { playerId: "a", index: 2 }
  ]);
});
