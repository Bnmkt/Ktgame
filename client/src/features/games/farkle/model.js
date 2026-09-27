export const farkleCombos = [
  { id: "one", label: "Chaque 1", points: "100 pts", dice: [1] },
  { id: "five", label: "Chaque 5", points: "50 pts", dice: [5] },
  { id: "triple-one", label: "Trois 1", points: "1 000 pts", dice: [1, 1, 1] },
  { id: "triple", label: "Brelan de 2 à 6", points: "Valeur × 100", dice: [4, 4, 4] },
  { id: "four", label: "Carré", points: "1 000 pts", dice: [3, 3, 3, 3] },
  { id: "five-kind", label: "Cinq identiques", points: "2 000 pts", dice: [6, 6, 6, 6, 6] },
  { id: "six-kind", label: "Six identiques", points: "3 000 pts", dice: [2, 2, 2, 2, 2, 2] },
  { id: "straight", label: "Suite 1–6", points: "1 500 pts", dice: [1, 2, 3, 4, 5, 6] },
  { id: "pairs", label: "Trois paires", points: "1 500 pts", dice: [2, 2, 4, 4, 6, 6] },
  { id: "triplets", label: "Deux brelans", points: "2 500 pts", dice: [2, 2, 2, 5, 5, 5] },
  { id: "full", label: "Carré + paire", points: "1 500 pts", dice: [3, 3, 3, 3, 6, 6] }
];

export function farkleSelectionScore(dice = []) {
  if (!dice.length) return { points: 0, label: "Sélectionne une combinaison", valid: false };
  const counts = [1, 2, 3, 4, 5, 6].map((face) => dice.filter((die) => die === face).length);
  if (dice.length === 6 && counts.every((count) => count === 1)) return { points: 1500, label: "Suite 1–6", valid: true };
  if (dice.length === 6 && counts.filter((count) => count === 2).length === 3) return { points: 1500, label: "Trois paires", valid: true };
  if (dice.length === 6 && counts.filter((count) => count === 3).length === 2) return { points: 2500, label: "Deux brelans", valid: true };
  if (dice.length === 6 && counts.includes(4) && counts.includes(2)) return { points: 1500, label: "Carré + paire", valid: true };
  if (!counts.every((count, index) => count === 0 || index === 0 || index === 4 || count >= 3)) return { points: 0, label: "Certains dés ne marquent pas", valid: false };
  let points = 0;
  const labels = [];
  counts.forEach((count, index) => {
    const face = index + 1;
    if (count >= 3) {
      points += count === 3 ? (face === 1 ? 1000 : face * 100) : count === 4 ? 1000 : count === 5 ? 2000 : 3000;
      labels.push(count === 3 ? `Brelan de ${face}` : `${count} dés de ${face}`);
    } else {
      if (face === 1) points += count * 100;
      if (face === 5) points += count * 50;
    }
  });
  if (!labels.length && points) labels.push("1 et/ou 5 isolés");
  return { points, label: labels.join(" + ") || "Aucun point", valid: points > 0 };
}

export function shutTileCombinations(open = [], total = 0) {
  const results = [];
  function visit(start, remaining, picked) {
    if (remaining === 0) {
      results.push(picked);
      return;
    }
    for (let index = start; index < open.length; index += 1) {
      if (open[index] <= remaining) visit(index + 1, remaining - open[index], [...picked, open[index]]);
    }
  }
  if (total > 0) visit(0, total, []);
  return results.sort((left, right) => left.length - right.length || Math.max(...right) - Math.max(...left));
}

export function farkleSuggestions(dice = []) {
  const found = new Map();
  for (let mask = 1; mask < (1 << dice.length); mask += 1) {
    const indexes = dice.map((_, index) => mask & (1 << index) ? index : -1).filter((index) => index >= 0);
    const values = indexes.map((index) => dice[index]);
    const score = farkleSelectionScore(values);
    if (!score.valid) continue;
    const signature = [...values].sort().join("-");
    const current = found.get(signature);
    if (!current || score.points > current.points) found.set(signature, { ...score, indexes, values });
  }
  return [...found.values()].sort((left, right) => right.points - left.points || right.values.length - left.values.length).slice(0, 6);
}
