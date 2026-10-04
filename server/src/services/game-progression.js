export const DEFAULT_XP_FORMULA = "ARRONDI((12 + 30 * N + 8 * N^1,5) * (1 + 0,4 * ENT(N / 10)^1,25))";
export const MAX_XP = 1000000000000;
const curves = new Map();

// A bounded arithmetic grammar, never JavaScript or arbitrary function calls.
export function compileXpFormula(source) {
  const text = String(source ?? "").trim().toUpperCase().replaceAll("×", "*").replaceAll("÷", "/").replace(/(\d),(?=\d)/g, "$1.");
  if (!text || text.length > 500) throw new Error("La formule doit contenir entre 1 et 500 caractères.");
  const tokens = text.match(/\d+(?:\.\d+)?|[A-Z_]+|[()+\-*/^]/g) ?? [];
  if (tokens.join("") !== text.replace(/\s/g, "") || tokens.length > 180) throw new Error("Formule invalide : utilise N, des nombres, + - * / ^, ARRONDI et ENT.");
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const functions = { ARRONDI: Math.round, ROUND: Math.round, ENT: Math.floor, FLOOR: Math.floor, ABS: Math.abs, RACINE: Math.sqrt, SQRT: Math.sqrt, PLAFOND: Math.ceil, CEIL: Math.ceil };
  function atom(depth) {
    if (depth > 30) throw new Error("La formule contient trop de niveaux.");
    const token = take();
    if (token === "N") return (n) => n;
    if (/^\d/.test(token ?? "")) return () => Number(token);
    if (token === "(") { const value = expression(depth + 1); if (take() !== ")") throw new Error("Parenthèse manquante."); return value; }
    if (Object.hasOwn(functions, token ?? "")) {
      if (take() !== "(") throw new Error("Une fonction doit être suivie de parenthèses.");
      const value = expression(depth + 1);
      if (take() !== ")") throw new Error("Parenthèse manquante.");
      return (n) => functions[token](value(n));
    }
    throw new Error("Valeur ou fonction inconnue dans la formule.");
  }
  function unary(depth) {
    if (depth > 30) throw new Error("La formule contient trop de niveaux.");
    if (peek() === "+" || peek() === "-") { const sign = take(); const value = unary(depth + 1); return (n) => (sign === "-" ? -1 : 1) * value(n); }
    let left = atom(depth);
    if (peek() === "^") { take(); const right = unary(depth + 1), base = left; left = (n) => base(n) ** right(n); }
    return left;
  }
  function product(depth) {
    let left = unary(depth);
    while (peek() === "*" || peek() === "/") { const op = take(), right = unary(depth), base = left; left = (n) => op === "*" ? base(n) * right(n) : base(n) / right(n); }
    return left;
  }
  function expression(depth) {
    let left = product(depth);
    while (peek() === "+" || peek() === "-") { const op = take(), right = product(depth), base = left; left = (n) => op === "+" ? base(n) + right(n) : base(n) - right(n); }
    return left;
  }
  const evaluate = expression(0);
  if (position !== tokens.length) throw new Error("La formule contient des valeurs inattendues.");
  return (n) => {
    const value = Math.round(evaluate(n));
    if (!Number.isSafeInteger(value) || value < 1 || value > 1000000000) throw new Error(`XP invalide au niveau ${n} : le coût doit être entre 1 et 1 000 000 000.`);
    return value;
  };
}

function integer(value, fallback, maximum) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) throw new Error("Valeur de progression invalide.");
  return number;
}
function titles(input) {
  if (!Array.isArray(input) || input.length > 100) throw new Error("Au maximum 100 titres par jeu.");
  const rows = input.map((row) => ({ level: Math.max(1, integer(row.level, 1, 1000)), label: String(row.label ?? "").trim().slice(0, 40) }));
  if (rows.some((row) => !row.label) || new Set(rows.map((row) => row.level)).size !== rows.length) throw new Error("Chaque titre doit avoir un nom et un niveau distinct.");
  return rows.sort((a, b) => a.level - b.level);
}
export function normalizeProgressionConfig(input = {}, gameIds = []) {
  const config = {
    formula: String(input.formula ?? DEFAULT_XP_FORMULA).trim(),
    maxLevel: Math.max(1, integer(input.maxLevel, 100, 1000)),
    completionXp: integer(input.completionXp, 50, 1000000), victoryXp: integer(input.victoryXp, 25, 1000000),
    titles: titles(input.titles ?? [{ level: 1, label: "Débutant" }, { level: 5, label: "Habitué" }, { level: 10, label: "Confirmé" }, { level: 25, label: "Expert" }, { level: 50, label: "Maître" }]), games: {}
  };
  for (const id of gameIds) if (Object.hasOwn(input.games ?? {}, id)) {
    const row = input.games[id];
    config.games[id] = { completionXp: integer(row.completionXp, config.completionXp, 1000000), victoryXp: integer(row.victoryXp, config.victoryXp, 1000000), ...(row.titles ? { titles: titles(row.titles) } : {}) };
  }
  progressionCurve(config);
  return config;
}
export function progressionCurve(config) {
  const key = `${config.maxLevel}:${config.formula}`;
  if (curves.has(key)) return curves.get(key);
  const evaluate = compileXpFormula(config.formula), rows = [{ level: 1, totalXp: 0, nextXp: config.maxLevel > 1 ? evaluate(1) : 0 }];
  for (let level = 2; level <= config.maxLevel; level++) rows.push({ level, totalXp: rows.at(-1).totalXp + rows.at(-1).nextXp, nextXp: level < config.maxLevel ? evaluate(level) : 0 });
  if (curves.size >= 16) curves.delete(curves.keys().next().value);
  curves.set(key, rows);
  return rows;
}
export function gameProgress(user, gameId, config) {
  const xp = Math.max(0, Math.min(MAX_XP, Math.trunc(Number(user?.gameXp?.[gameId]) || 0)));
  const curve = progressionCurve(config);
  let lo = 0, hi = curve.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (curve[mid].totalXp <= xp) lo = mid; else hi = mid - 1; }
  const row = curve[lo], title = (config.games?.[gameId]?.titles ?? config.titles).filter((entry) => entry.level <= row.level).at(-1)?.label ?? "";
  return { gameId, xp, level: row.level, title, levelXp: xp - row.totalXp, nextXp: row.nextXp, capped: row.nextXp === 0 };
}
export function awardGameXp(user, gameId, amount, config) {
  if (!user || user.guest || user.isBot || !Number.isSafeInteger(amount) || amount <= 0) return null;
  const before = gameProgress(user, gameId, config);
  user.gameXp ??= {};
  user.gameXp[gameId] = Math.min(MAX_XP, before.xp + amount);
  return { ...gameProgress(user, gameId, config), amount: user.gameXp[gameId] - before.xp, previousLevel: before.level };
}
export function normalizeAchievementRewards(input = {}) {
  if (!Array.isArray(input.itemIds ?? []) || !Array.isArray(input.xp ?? []) || (input.itemIds?.length ?? 0) > 30 || (input.xp?.length ?? 0) > 15) throw new Error("Trop de récompenses pour ce succès.");
  const itemIds = [...new Set((input.itemIds ?? []).map((id) => String(id).slice(0, 100)))];
  const xp = (input.xp ?? []).map((row) => ({ gameId: String(row.gameId ?? "").slice(0, 60), amount: integer(row.amount, 0, 1000000) }));
  if (xp.some((row) => !row.gameId || !row.amount) || new Set(xp.map((row) => row.gameId)).size !== xp.length) throw new Error("Choisis un jeu distinct et un montant d’XP positif par récompense.");
  return { itemIds, xp };
}
export function grantAchievementRewards(user, entry, shop, config) {
  if (!user || user.guest || user.achievementRewards?.includes(entry.id)) return [];
  (user.achievementRewards ??= []).push(entry.id);
  for (const id of entry.rewards?.itemIds ?? []) {
    const item = shop.find((row) => row.id === id);
    if (item) { user.cosmetics ??= {}; const owned = user.cosmetics[item.type] ??= []; if (!owned.includes(item.value)) owned.push(item.value); }
  }
  return (entry.rewards?.xp ?? []).map((row) => awardGameXp(user, row.gameId, row.amount, config)).filter(Boolean);
}
export function roomLevelLimits(input = {}) {
  const minLevel = Math.max(1, integer(input.minLevel, 1, 1000));
  const maxLevel = input.maxLevel === "" || input.maxLevel == null ? null : Math.max(1, integer(input.maxLevel, 1000, 1000));
  if (maxLevel !== null && maxLevel < minLevel) throw new Error("Le niveau maximal doit être supérieur ou égal au minimum.");
  return { minLevel, maxLevel };
}
export function roomLevelError(user, room, config) {
  if (user?.isBot) return "";
  const { minLevel = 1, maxLevel = null } = room;
  const { level } = gameProgress(user, room.gameId, config);
  return level < minLevel || maxLevel !== null && level > maxLevel ? `Cette table demande un niveau ${minLevel}${maxLevel === null ? " ou supérieur" : ` à ${maxLevel}`} dans ce jeu. Ton niveau : ${level}.` : "";
}
