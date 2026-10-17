export const audioDefaults = Object.freeze({ master: .75, ambience: .7, music: .18, muted: false });
const storageKey = "ktga-audio-mix";
let fallback;
export function normalizeAudioSettings(input) {
  return Object.fromEntries(Object.entries(audioDefaults).map(([key, value]) => [key, key === "muted"
    ? typeof input?.muted === "boolean" ? input.muted : value
    : typeof input?.[key] === "number" && Number.isFinite(input[key]) ? Math.max(0, Math.min(1, input[key])) : value]));
}
export function audioSettings() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return normalizeAudioSettings(JSON.parse(stored));
    return { ...audioDefaults, muted: localStorage.getItem("ktga-game-sounds") === "off" };
  } catch { return fallback ?? { ...audioDefaults }; }
}
export function updateAudioSettings(changes) {
  fallback = normalizeAudioSettings({ ...audioSettings(), ...changes });
  try { localStorage.setItem(storageKey, JSON.stringify(fallback)); } catch { /* Keep the mix for this visit. */ }
  window.dispatchEvent(new Event("ktga-sounds-updated"));
  return fallback;
}
export function audioVolume(channel = "ambience") {
  const mix = audioSettings();
  return mix.muted ? 0 : mix.master * (mix[channel] ?? 1);
}
