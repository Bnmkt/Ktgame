export function presidentCardValue(rank, revolution = false) {
  const value = ({ "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14, "2": 15 })[rank] ?? 0;
  return revolution ? 18 - value : value;
}

export function canPlayPresidentSet(state, rank, count) {
  if (!state?.currentSet) return true;
  if (count !== state.currentSet.count) return false;
  return presidentCardValue(rank, state.revolution) > presidentCardValue(state.currentSet.rank, state.revolution);
}

export function hasPlayablePresidentSet(state, hand = []) {
  if (!hand.length) return false;
  if (!state?.currentSet) return true;
  const counts = new Map();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return [...counts].some(([rank, count]) => count >= state.currentSet.count && canPlayPresidentSet(state, rank, state.currentSet.count));
}

export const presidentCardKey = (card) => `${card.deckId ?? 0}:${card.rank}:${card.suit}`;

// Reconcile identities, never values: socket snapshots must not sort a manual hand.
export function reconcilePresidentHand(hand, order = []) {
  const cards = new Map(hand.filter(Boolean).map((card) => [presidentCardKey(card), card]));
  const keys = [...new Set([...order, ...cards.keys()])].filter((key) => cards.has(key));
  return keys.map((key) => cards.get(key));
}

export function movePresidentCard(order, key, destination) {
  const next = order.filter((entry) => entry !== key);
  if (!order.includes(key)) return order;
  next.splice(Math.max(0, Math.min(next.length, destination)), 0, key);
  return next;
}

export function presidentHandGeometry(width, count, maximum = 100) {
  const available = Math.max(1, width - 12);
  const cardWidth = Math.min(maximum, available / (1 + Math.max(0, count - 1) * .31));
  const step = count > 1 ? Math.min(cardWidth * .88, (available - cardWidth) / (count - 1)) : 0;
  return { cardWidth, step, start: (width - cardWidth - step * Math.max(0, count - 1)) / 2 };
}

// The server deals a shuffled deck round-robin, starting with the first seat.
// Only public counts and the local hand are needed to reconstruct its timeline.
export function presidentDealSequence(state) {
  const result = [];
  const counts = state.players.map((player) => state.hands[player.id]?.length ?? 0);
  for (let index = 0; index < Math.max(0, ...counts); index++) {
    state.players.forEach((player, seat) => {
      if (index < counts[seat]) result.push({ playerId: player.id, index });
    });
  }
  return result;
}

export function presidentPlaceLabel(place, count) {
  if (place < 0) return "En jeu";
  if (place === 0) return "Président";
  if (place === count - 1) return "Ass";
  if (count >= 4 && place === 1) return "Vice-Président";
  if (count >= 4 && place === count - 2) return "Vice-Ass";
  return "Neutre";
}
