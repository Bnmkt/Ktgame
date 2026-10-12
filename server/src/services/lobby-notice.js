import { gameImageUrl } from "../../../client/src/features/games/presentation.js";

export function normalizeLobbyNotice(value = {}) {
  return {
    enabled: value?.enabled === true,
    title: typeof value?.title === "string" ? value.title.trim().slice(0, 100) : "",
    content: typeof value?.content === "string" ? value.content.replace(/\r\n?/g, "\n").slice(0, 20000) : "",
    backgroundImage: gameImageUrl(value?.backgroundImage),
    updatedAt: typeof value?.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : ""
  };
}

export function updateLobbyNotice(previous, input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.enabled !== "boolean" || typeof input.title !== "string" || input.title.length > 100 || typeof input.content !== "string" || input.content.length > 20000) throw new Error("Annonce invalide.");
  if (input.backgroundImage !== undefined && (typeof input.backgroundImage !== "string" || input.backgroundImage.length > 2048 || input.backgroundImage.trim() && !gameImageUrl(input.backgroundImage))) throw new Error("Image de fond invalide.");
  const before = normalizeLobbyNotice(previous), next = normalizeLobbyNotice(input);
  if (next.enabled && !next.content.trim()) throw new Error("Ajoute le contenu de l’annonce avant de l’afficher.");
  const changed = ["enabled", "title", "content", "backgroundImage"].some((key) => next[key] !== before[key]);
  return { ...next, updatedAt: changed ? new Date(Math.max(now, (Date.parse(before.updatedAt) || 0) + 1)).toISOString() : before.updatedAt };
}
