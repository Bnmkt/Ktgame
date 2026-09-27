export function publicPlayers(players) {
  return players.map((player) => ({
    id: player.id,
    pseudo: player.pseudo,
    tokens: player.tokens,
    isBot: player.isBot,
    cosmetics: player.cosmetics
  }));
}

export function playerLabel(state, playerId) {
  const player = state.players?.find((entry) => entry.id === playerId);
  return player?.pseudo ?? "Joueur";
}

export function appendLog(state, actorId, text, type = "action") {
  state.logs = [
    ...(state.logs ?? []),
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      actorId,
      actor: actorId === "dealer" ? "Dealer" : playerLabel(state, actorId),
      type,
      text
    }
  ].slice(-80);
}

export function diceText(dice = []) {
  return dice.join(", ");
}

export function cardText(card) {
  if (!card) return "?";
  const suit = { S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit] ?? card.suit;
  return `${card.rank}${suit}`;
}

export function cardsText(cards = []) {
  return cards.map(cardText).join(", ");
}
