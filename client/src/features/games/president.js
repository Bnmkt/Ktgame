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
