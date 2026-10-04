const levels = [1, 5, 10, 20, 40, 60, 80, 100];
const labels = {
  belote: ["Donneur", "Atout", "Preneur", "Coupeur", "Capot", "Beloteur", "Rebelote", "Grand Atout"],
  "texas-holdem": ["Blind", "Flop", "Turn", "River", "Bluffeur", "Shark", "High Roller", "Royal Flush"],
  blackjack: ["Mise", "Double", "Split", "Compteur", "Vingt et Un", "Croupier", "Blackjack", "As Royal"],
  bataille: ["Soldat", "Éclaireur", "Duelliste", "Capitaine", "Stratège", "Général", "Conquérant", "Empereur"],
  president: ["Citoyen", "Secrétaire", "Député", "Ministre", "Président", "Régent", "Monarque", "Empereur"],
  yahtzee: ["Lanceur", "Paire", "Brelan", "Carré", "Full", "Petite Suite", "Grande Suite", "Yahtzee"],
  "421": ["Lanceur", "Relance", "Tierce", "Brelan", "Triple As", "Chanceux", "Flambeur", "Maître 421"],
  "cul-de-chouette": ["Lanceur", "Chouette", "Velute", "Sirop", "Chouette Velute", "Grelottine", "Cul de Chouette", "Grand Chouettier"],
  farkle: ["Lanceur", "Relance", "Brelan", "Suite", "Preneur", "Audacieux", "Flambeur", "Maître Farkle"],
  "liars-dice": ["Parieur", "Menteur", "Bluffeur", "Douteur", "Trompeur", "Manipulateur", "Imposteur", "Roi du Bluff"],
  "shut-the-box": ["Compteur", "Fermeur", "Calculeur", "Tacticien", "Verrouilleur", "Sans Reste", "Boîte Noire", "Maître Boîte"],
  "golf-solitaire": ["Caddie", "Putter", "Birdie", "Eagle", "Albatros", "Pro du Green", "Champion", "Légende du Green"],
  accordion: ["Empileur", "Accord", "Fusion", "Repli", "Compresseur", "Virtuose", "Accordéoniste", "Maître Accordéon"],
  "midnight-dice": ["Veilleur", "Nocturne", "Minuit", "Ombre", "Éclipse", "Clair de Lune", "Nuit Éternelle", "Maître Minuit"],
  "velvet-ruse": ["Masque", "Feinte", "Bluffeur", "Trompeur", "Illusionniste", "Marionnettiste", "Velours Noir", "Maître Ruse"]
};

export const DEFAULT_GAME_TITLES = Object.fromEntries(Object.entries(labels).map(([id, names]) => [id, names.map((label, index) => ({ level: levels[index], label }))]));
