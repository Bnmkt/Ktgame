export const familyTableGames = new Set(["421", "liars-dice", "shut-the-box", "midnight-dice", "bataille", "belote", "velvet-ruse", "golf-solitaire", "accordion"]);
export const cardTableGames = new Set(["bataille", "belote", "velvet-ruse", "golf-solitaire", "accordion", "president", "blackjack", "texas-holdem"]);
export const tableFamily = game => ["golf-solitaire", "accordion"].includes(game) ? "solitaire" : cardTableGames.has(game) ? "cards" : "dice";

// Slot order mirrors the existing engines. No card value or random choice is generated here.
export function tableDealSequence(state) {
  const slots = [];
  const add = (owner, index) => slots.push(`${owner}:${index}`);
  if (state.gameId === "belote") {
    for (const [offset, count] of [[0, 3], [3, 2]]) for (let seat = 1; seat <= 4; seat++) {
      const player = state.players[(state.dealerIndex + seat) % 4];
      for (let i = offset; i < Math.min(offset + count, state.hands[player.id]?.length ?? 0); i++) add(player.id, i);
    }
    if (state.turnedCard) add("turned", 0);
  } else if (state.gameId === "velvet-ruse") {
    for (const player of state.players) for (let i = 0; i < (state.hands[player.id]?.length ?? 0); i++) add(player.id, i);
    if (state.edict) add("edict", 0);
    if (state.discard?.length) add("discard", 0);
  } else if (state.gameId === "golf-solitaire") {
    state.tableau.forEach((column, c) => column.forEach((_, i) => add(`column-${c}`, i)));
    add("waste", 0);
  } else if (state.gameId === "accordion") state.piles.forEach((_, i) => add("ribbon", i));
  else if (state.gameId === "bataille") for (const player of state.players) for (let i = 0; i < (state.piles[player.id]?.length ?? 0); i++) add(player.id, "stock");
  return slots;
}

export function familyTurnHint(state, userId) {
  switch (state.gameId) {
    case "421": return "Conserve tes dés, puis valide ta combinaison.";
    case "liars-dice": return "Monte l’enchère ou conteste la dernière annonce. Tes dés restent secrets.";
    case "shut-the-box": return state.lastTotal ? "Ferme les tuiles dont la somme correspond au lancer." : "Lance les dés pour ouvrir ton prochain choix.";
    case "midnight-dice": return state.phase === "contract" ? "Choisis ton mandat secret." : "Prends un dé du marché ou utilise une défausse.";
    case "bataille": return state.resolutionEndsAt ? "La confrontation se résout avant la prochaine manche." : state.submittedPlayerIds?.includes(userId) ? "Ton placement est enregistré. L’adversaire termine son choix." : state.drawnCards?.[userId] ? "Place ta carte sur une pile disponible." : "Pioche ta carte pour préparer ton placement.";
    case "belote": return state.phase === "round-end" ? "La donne est terminée. Consulte le résultat ou lance la suivante." : ["bid", "forced-bid"].includes(state.phase) ? "Choisis un atout ou passe selon les options disponibles." : "Joue une carte autorisée pour compléter le pli.";
    case "velvet-ruse": return state.phase === "draw" ? "Choisis ta source de pioche." : state.phase === "decision" ? "Fais confiance à la déclaration ou conteste-la." : "Choisis une carte à déclarer ou à défausser.";
    case "golf-solitaire": return "Joue une carte voisine de la carte active, ou pioche.";
    case "accordion": return "Choisis une pile, puis une cible éclairée à sa gauche.";
    default: return "";
  }
}
