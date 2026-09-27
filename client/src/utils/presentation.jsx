import { BadgeCheck, Play, Trophy } from "lucide-react";
import { gameTitle } from "../features/games/config.js";

export function gameCategoryLabel(value) {
  return ({ all: "Tous", score: "Score", combination: "Combinaisons", casino: "Casino", duel: "Duel", shedding: "Défausse", "push-your-luck": "Stop ou encore", bluff: "Bluff", draft: "Draft tactique", puzzle: "Puzzle", solitaire: "Solitaire" })[value] ?? value;
}

export function gameAudienceLabel(value) {
  return ({ all: "Tous", solo: "Solo", multi: "Multi", "solo-multi": "Solo + multi" })[value] ?? value;
}

export function gameComplexityLabel(value) {
  return ({ all: "Tous", easy: "Accessible", intermediate: "Intermédiaire", advanced: "Avancé" })[value] ?? value;
}

export function formatDate(value) {
  return value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-";
}

export function formatTime(value) {
  return value ? new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "";
}

export function formatTokens(value) {
  return formatCompactNumber(value);
}

export function formatExactNumber(value, maximumFractionDigits = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat("fr-BE", { maximumFractionDigits }).format(numeric);
}

export function formatCompactNumber(value, compactFrom = 10000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  const absolute = Math.abs(numeric);
  if (absolute < compactFrom) return formatExactNumber(numeric, Number.isInteger(numeric) ? 0 : 2);
  const units = [[1e15, "Q"], [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  let unitIndex = units.findIndex(([threshold]) => absolute >= threshold);
  if (unitIndex < 0) unitIndex = units.length - 1;
  let [divisor, suffix] = units[unitIndex];
  let scaled = numeric / divisor;
  let maximumFractionDigits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  const rounded = Number(scaled.toFixed(maximumFractionDigits));
  if (Math.abs(rounded) >= 1000 && unitIndex > 0) {
    [divisor, suffix] = units[unitIndex - 1];
    scaled = numeric / divisor;
    maximumFractionDigits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  }
  return `${new Intl.NumberFormat("fr-BE", { maximumFractionDigits }).format(scaled)}${suffix}`;
}

export function CompactNumber({ value, prefix = "", suffix = "", compactFrom = 10000, className = "", label = "" }) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const exact = `${prefix}${formatExactNumber(safeValue)}${suffix}`;
  return <span className={`compact-number ${className}`.trim()} title={label ? `${label} : ${exact}` : exact} aria-label={label ? `${label} : ${exact}` : exact} data-full-number={exact}>{prefix}{formatCompactNumber(safeValue, compactFrom)}{suffix}</span>;
}

export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

export function ageFromBirthDate(birthDate) {
  if (!birthDate) return "";
  const born = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(born.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getMonth() < born.getUTCMonth() || (now.getMonth() === born.getUTCMonth() && now.getDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : "";
}

export function longestDateStreak(dates = []) {
  let best = 0;
  let current = 0;
  let previous = null;
  for (const date of [...new Set(dates)].sort()) {
    const time = new Date(`${date}T00:00:00.000Z`).getTime();
    if (previous === null || time - previous === 86400000) current += 1;
    else current = 1;
    best = Math.max(best, current);
    previous = time;
  }
  return best;
}

export function achievementTypeLabel(type) {
  return ({ games: "Jeux", milestones: "Milestones", secrets: "Secrets", shop: "Boutique" })[type] ?? type;
}

export function shopCategoryLabel(category) {
  return ({ classic: "Classique", premium: "Premium", premiumShape: "Forme spéciale", premiumAnimated: "Animé spécial" })[category] ?? category;
}

export function memberStatOptions() {
  return [
    ["hidden", "Masquée"],
    ["winRate", "Taux de victoire"],
    ["todayGames", "Parties aujourd'hui"],
    ["achievementsUnlocked", "Succès débloqués"],
    ["customAchievement", "Succès custom"]
  ];
}

export function statDisplay(stat, user, history = [], achievements = [], index = 0) {
  const wins = user.statistics?.wins ?? history.filter((row) => row.winners?.includes(user.id)).length;
  const gamesPlayed = user.statistics?.gamesPlayed ?? history.length;
  const ratio = gamesPlayed ? `${Math.round((wins / gamesPlayed) * 100)}%` : "0%";
  const today = new Date().toISOString().slice(0, 10);
  const todayGames = user.statistics?.todayGames ?? history.filter((row) => String(row.finishedAt ?? "").slice(0, 10) === today).length;
  const unlocked = achievements.filter((achievement) => achievement.unlocked);
  if (stat === "todayGames") return { icon: <Play size={18} />, label: "Aujourd'hui", value: formatCompactNumber(todayGames), exactValue: formatExactNumber(todayGames) };
  if (stat === "overallWinRate" || stat === "winRate") return { icon: <Trophy size={18} />, label: "Winrate", value: ratio };
  if (stat === "achievementsUnlocked") return { icon: <BadgeCheck size={18} />, label: "Succès", value: `${unlocked.length}/${achievements.length}` };
  if (stat === "customAchievement") {
    const customId = user?.profileStats?.customAchievementIds?.[index] || user?.profileStats?.customAchievementId;
    const custom = achievements.find((achievement) => achievement.id === customId);
    return { icon: <BadgeCheck size={18} />, label: "Milestone", value: custom?.title ?? "Aucun" };
  }
  return { icon: <Trophy size={18} />, label: "Winrate", value: ratio };
}

export function memberCardStats(user, history = [], achievements = []) {
  const stats = user?.profileStats?.memberCardStats?.length ? user.profileStats.memberCardStats : [user?.profileStats?.memberCardStat ?? "winRate", "achievementsUnlocked"];
  return stats.slice(0, 2).map((stat, index) => stat === "hidden" ? null : statDisplay(stat, user, history, achievements, index)).filter(Boolean);
}

export function transactionLabel(reason) {
  return ({
    "signup-bonus": "Bonus d'inscription",
    "daily-claim": "Bonus journalier",
    "room-stake": "Mise de salon",
    "room-pot-win": "Gain de salon",
    "blackjack-bet": "Mise Blackjack",
    "blackjack-double": "Doublement Blackjack",
    "blackjack-payout": "Gain Blackjack",
    "421-paid-reroll": "Relance supplémentaire · 421",
    "poker-cash-out": "Sortie de table Poker",
    "poker-timeout-cash-out": "Sortie Poker · délai dépassé",
    "poker-kicked-cash-out": "Sortie Poker · exclusion",
    "poker-table-closed": "Sortie Poker · table fermée",
    "shop-purchase": "Achat boutique",
    "shop-pack-purchase": "Achat pack boutique",
    "community-event-entry": "Entrée d’événement communautaire",
    "community-event-action-purchase": "Action d’événement achetée",
    "community-event-instant": "Gain instantané d’événement",
    "community-event-reward": "Récompense d’événement communautaire",
    "community-event-refund": "Remboursement des frais de participation à un événement",
    "admin-adjustment": "Ajustement administratif"
  })[reason] ?? reason;
}

export function canClaimDaily(user) {
  return !user.guest && !user.dailyBonus?.claimedToday;
}
