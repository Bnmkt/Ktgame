// Adapted from Round.compareCardStrength/getStrongestCard in justitsi/js-belote.
// Copyright (c) 2021 Hristo Belchev, MIT (see LICENSE.belote).
// Only single-trump games are supported by this adapter.
export const trumpOrder = ["7", "8", "Q", "K", "10", "A", "9", "J"];
export const plainOrder = ["7", "8", "9", "J", "Q", "K", "10", "A"];
export function strongerCard(first, second, trump) {
  if (first.suit === second.suit) {
    const order = first.suit === trump ? trumpOrder : plainOrder;
    return order.indexOf(second.rank) > order.indexOf(first.rank);
  }
  return second.suit === trump;
}
export function strongestPlay(plays, trump) {
  return plays.reduce((best, play) => !best || strongerCard(best.card, play.card, trump) ? play : best, null);
}
export function beloteCardPoints(card, trump) {
  if (card.suit === trump && card.rank === "J") return 20;
  if (card.suit === trump && card.rank === "9") return 14;
  return ({ A: 11, "10": 10, K: 4, Q: 3, J: 2 })[card.rank] ?? 0;
}
