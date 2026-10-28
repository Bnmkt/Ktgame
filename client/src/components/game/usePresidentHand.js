import { useEffect, useState } from "react";
import { movePresidentCard, presidentCardKey, reconcilePresidentHand } from "../../features/games/president.js";

function restored(key) {
  try {
    const order = JSON.parse(sessionStorage.getItem(key));
    return Array.isArray(order) ? order.filter((value) => typeof value === "string") : [];
  } catch { return []; }
}

export function usePresidentHand(hand, matchKey) {
  const key = `ktga-president-hand:${matchKey}`;
  const [saved, setSaved] = useState(() => ({ key, order: restored(key) }));
  const cards = reconcilePresidentHand(hand, saved.key === key ? saved.order : restored(key));
  const order = cards.map(presidentCardKey);
  const signature = JSON.stringify(order);
  useEffect(() => {
    setSaved((previous) => previous.key === key && JSON.stringify(previous.order) === signature ? previous : { key, order });
    try { sessionStorage.setItem(key, signature); } catch { /* A private browser can disable storage. */ }
  }, [key, signature]);
  return [cards, (cardKey, destination) => setSaved({ key, order: movePresidentCard(order, cardKey, destination) })];
}
