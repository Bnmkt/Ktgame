export const midnightContractTiers = {
  bronze: { label: "Bronze", bonus: 18, accent: "#c7834a", order: 0 },
  silver: { label: "Argent", bonus: 30, accent: "#c7d0d8", order: 1 },
  gold: { label: "Or", bonus: 45, accent: "#f0c44f", order: 2 },
  platinum: { label: "Platine", bonus: 65, accent: "#72ddc5", order: 3 },
  diamond: { label: "Diamant", bonus: 100, accent: "#82c9ff", order: 4 }
};

export const midnightContractInfo = {
  spectrum: { label: "Spectre", hint: "Obtenir trois valeurs toutes différentes", tier: "bronze", example: [1, 3, 5] },
  duo: { label: "Duo", hint: "Obtenir exactement une paire", tier: "bronze", example: [4, 4, 2] },
  "middle-road": { label: "Voie médiane", hint: "Garder trois valeurs comprises entre 2 et 5", tier: "bronze", example: [2, 3, 5] },
  extremes: { label: "Les Extrêmes", hint: "Réunir au moins un 1 et un 6", tier: "silver", example: [1, 4, 6] },
  odd: { label: "Impair royal", hint: "Obtenir trois dés impairs", tier: "silver", example: [1, 3, 5] },
  even: { label: "Pair parfait", hint: "Obtenir trois dés pairs", tier: "silver", example: [2, 4, 6] },
  straight: { label: "Suite", hint: "Former trois valeurs consécutives", tier: "gold", example: [2, 3, 4] },
  balance: { label: "Équilibre", hint: "Atteindre exactement un total de 10", tier: "gold", example: [2, 3, 5] },
  "lucky-thirteen": { label: "Treize chanceux", hint: "Atteindre exactement un total de 13", tier: "gold", example: [3, 4, 6] },
  summit: { label: "Sommet", hint: "Atteindre un total de 15 ou plus", tier: "platinum", example: [4, 5, 6] },
  cellar: { label: "Cave", hint: "Rester à un total de 7 ou moins", tier: "platinum", example: [1, 2, 4] },
  triple: { label: "Brelan", hint: "Obtenir trois valeurs identiques", tier: "diamond", example: [6, 6, 6] }
};

export function midnightContractLabel(id) {
  return midnightContractInfo[id]?.label ?? "Mandat secret";
}

export function midnightContractEvaluation(contract, dice = []) {
  const info = midnightContractInfo[contract];
  const sorted = [...dice].sort((a, b) => a - b);
  const total = sorted.reduce((sum, die) => sum + die, 0);
  const counts = sorted.reduce((result, die) => ({ ...result, [die]: (result[die] ?? 0) + 1 }), {});
  const highestCount = Math.max(0, ...Object.values(counts));
  const complete = sorted.length === 3;
  let achieved = false;
  if (contract === "straight") achieved = complete && new Set(sorted).size === 3 && sorted[2] - sorted[0] === 2;
  if (contract === "triple") achieved = complete && highestCount === 3;
  if (contract === "balance") achieved = complete && total === 10;
  if (contract === "spectrum") achieved = complete && new Set(sorted).size === 3;
  if (contract === "duo") achieved = complete && highestCount === 2;
  if (contract === "summit") achieved = complete && total >= 15;
  if (contract === "cellar") achieved = complete && total <= 7;
  if (contract === "odd") achieved = complete && sorted.every((die) => die % 2 === 1);
  if (contract === "even") achieved = complete && sorted.every((die) => die % 2 === 0);
  if (contract === "extremes") achieved = complete && sorted.includes(1) && sorted.includes(6);
  if (contract === "lucky-thirteen") achieved = complete && total === 13;
  if (contract === "middle-road") achieved = complete && sorted.every((die) => [2, 3, 4, 5].includes(die));
  const tier = midnightContractTiers[info?.tier] ?? midnightContractTiers.bronze;
  return { achieved, base: total, bonus: achieved ? tier.bonus : 0, points: total + (achieved ? tier.bonus : 0), tier: info?.tier ?? "bronze" };
}

export function midnightScorePreview(contract, dice = []) {
  return midnightContractEvaluation(contract, dice).points;
}
