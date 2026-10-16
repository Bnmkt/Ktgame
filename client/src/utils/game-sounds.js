import { createNotificationSound } from "./notification-sound.js";

const preferenceKey = "ktga-game-sounds";
const profiles = {
  click: { tones: [[720, 0, .025, "sine"]], duration: .035 },
  dice: { tones: [0, .045, .095, .16, .24].map((delay, index) => [170 + index * 47, delay, .045, "triangle", .065]) },
  card: { tones: [[1900, 0, .025, "triangle", .055], [1300, .045, .025, "sine", .08]] },
  start: { tones: [[523.25, 0, .07, "sine"], [659.25, .12, .06, "sine"], [783.99, .24, .06, "sine"]], duration: .3 },
  warning: { tones: [[740, 0, .05, "sine"], [740, .16, .04, "sine"]], duration: .1 },
  limit: { tones: [[660, 0, .06, "triangle"], [440, .16, .05, "sine"]], duration: .18 }
};
let sound, enabled, owners = 0;
const lastPlayed = new Map();
export function gameSoundsEnabled() {
  try { return localStorage.getItem(preferenceKey) !== "off"; } catch { return enabled ?? true; }
}
export function setGameSoundsEnabled(value) {
  enabled = Boolean(value);
  try { localStorage.setItem(preferenceKey, enabled ? "on" : "off"); } catch { /* Keep the choice for this visit. */ }
  window.dispatchEvent(new Event("ktga-sounds-updated"));
}
export function playGameSound(kind) {
  if (!sound || !profiles[kind] || !gameSoundsEnabled() || document.visibilityState === "hidden") return;
  const now = Date.now();
  if (now - (lastPlayed.get(kind) ?? 0) < (kind === "click" ? 60 : 450)) return;
  lastPlayed.set(kind, now);
  return sound.play(() => gameSoundsEnabled() && document.visibilityState !== "hidden", profiles[kind]);
}
export function acquireGameSounds() {
  if (!owners++) sound = createNotificationSound({ throttleMs: 0 });
  return () => { if (!--owners) { sound.close(); sound = null; lastPlayed.clear(); } };
}
