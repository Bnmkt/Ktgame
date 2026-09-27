export const games = [
  { id: "belote", name: "Belote", type: "cards", category: "duel", audience: "multi", complexity: "advanced", minPlayers: 4, maxPlayers: 4 },
  { id: "yahtzee", name: "Yahtzee", type: "dice", category: "score", audience: "solo-multi", complexity: "intermediate", minPlayers: 1, maxPlayers: 6 },
  { id: "421", name: "421", type: "dice", category: "combination", audience: "multi", complexity: "intermediate", minPlayers: 2, maxPlayers: 6 },
  { id: "cul-de-chouette", name: "Cul de Chouette", type: "dice", category: "combination", audience: "multi", complexity: "advanced", minPlayers: 2, maxPlayers: 6 },
  { id: "blackjack", name: "Blackjack", type: "cards", category: "casino", audience: "solo-multi", complexity: "intermediate", minPlayers: 1, maxPlayers: 5 },
  { id: "texas-holdem", name: "Texas Hold'em", type: "cards", category: "casino", audience: "multi", complexity: "advanced", minPlayers: 2, maxPlayers: 8 },
  { id: "bataille", name: "Bataille", type: "cards", category: "duel", audience: "multi", complexity: "intermediate", minPlayers: 2, maxPlayers: 2 },
  { id: "president", name: "Président", type: "cards", category: "shedding", audience: "multi", complexity: "advanced", minPlayers: 3, maxPlayers: 6 },
  { id: "farkle", name: "Farkle", type: "dice", category: "push-your-luck", audience: "multi", complexity: "intermediate", minPlayers: 2, maxPlayers: 6 },
  { id: "liars-dice", name: "Liar's Dice", type: "dice", category: "bluff", audience: "multi", complexity: "advanced", minPlayers: 2, maxPlayers: 6 },
  { id: "shut-the-box", name: "Shut the Box", type: "dice", category: "puzzle", audience: "solo-multi", complexity: "easy", minPlayers: 1, maxPlayers: 4 },
  { id: "golf-solitaire", name: "Golf Solitaire", type: "cards", category: "solitaire", audience: "solo", complexity: "easy", minPlayers: 1, maxPlayers: 1 },
  { id: "accordion", name: "Accordion", type: "cards", category: "solitaire", audience: "solo", complexity: "intermediate", minPlayers: 1, maxPlayers: 1 },
  { id: "midnight-dice", name: "Dés de Minuit", type: "dice", category: "draft", audience: "multi", complexity: "advanced", minPlayers: 2, maxPlayers: 8 },
  { id: "velvet-ruse", name: "Velours Noir", type: "cards", category: "bluff", audience: "multi", complexity: "advanced", minPlayers: 2, maxPlayers: 8 }
];

export function rollDie(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(count) {
  return Array.from({ length: count }, () => rollDie());
}

export function createDeck() {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
}

export function shuffle(cards) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function cardValue(rank) {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

export function nextTurn(state) {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
}

export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}
