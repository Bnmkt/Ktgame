import { gameImageUrl } from "./presentation.js";

export const gameViewStorageKey = "ktga-game-selection-view";

export const selectedGameArtwork = game => gameImageUrl(game?.discordIconImage) || gameImageUrl(game?.coverImage);

export function preferredGameView(storage) {
  try { return storage?.getItem(gameViewStorageKey) === "classic" ? "classic" : "immersive"; }
  catch { return "immersive"; }
}

export const circularIndex = (index, count) => count ? ((index % count) + count) % count : 0;

export function circularDistance(index, active, count) {
  const delta = circularIndex(index - active, count);
  return delta > count / 2 ? delta - count : delta;
}

export function orbitDestination(turn, index, count, direction = 0, revolutions = 0) {
  if (!count) return 0;
  const step = 360 / count, current = Math.round(turn / step);
  let distance = circularDistance(index, circularIndex(current, count), count);
  if (direction > 0 && distance < 0) distance += count;
  if (direction < 0 && distance > 0) distance -= count;
  return (current + distance) * step + Math.max(0, revolutions) * 360;
}

export function randomAvailableGame(games, enabled = () => true, random = Math.random) {
  const available = games.filter(game => game.enabled !== false && enabled(game));
  return available[Math.min(available.length - 1, Math.floor(random() * available.length))] ?? null;
}

export function publicGameTableCount(rooms, gameId) {
  return rooms.filter(room => room.gameId === gameId && !room.ranked && !room.finished && room.isPublic !== false).length;
}
