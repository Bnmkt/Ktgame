import { createNotificationSound } from "./notification-sound.js";
import { audioVolume, updateAudioSettings } from "./audio-settings.js";
import { audioSamples, loungeMusic, nextAudioVariant } from "./audio-assets.js";

const profiles = {
  click: { tones: [[720, 0, .025, "sine"]], duration: .035 },
  start: { tones: [[523.25, 0, .07, "sine"], [659.25, .12, .06, "sine"], [783.99, .24, .06, "sine"]], duration: .3 },
  warning: { tones: [[740, 0, .05, "sine"], [740, .16, .04, "sine"]], duration: .1 },
  limit: { tones: [[660, 0, .06, "triangle"], [440, .16, .05, "sine"]], duration: .18 }
};
let sound, owners = 0, music, musicPending = false, musicPosition = 0, musicGeneration = 0, musicActivated = false;
const lastPlayed = new Map(), variants = new Map();
export function gameSoundsEnabled() {
  return audioVolume("ambience") > 0;
}
export function setGameSoundsEnabled(value) {
  updateAudioSettings({ muted: !value });
}
export function playGameSound(kind) {
  if (!sound || !(profiles[kind] || audioSamples[kind]) || !gameSoundsEnabled() || document.visibilityState === "hidden") return;
  const now = Date.now();
  if (now - (lastPlayed.get(kind) ?? 0) < (kind === "click" ? 60 : 450)) return;
  lastPlayed.set(kind, now);
  if (audioSamples[kind]) {
    const variant = nextAudioVariant(audioSamples[kind], variants.get(kind)); variants.set(kind, variant);
    return sound.playSample(variant, () => gameSoundsEnabled() && document.visibilityState !== "hidden");
  }
  return sound.play(() => gameSoundsEnabled() && document.visibilityState !== "hidden", profiles[kind]);
}
function syncMusic() {
  if (!sound || !audioVolume("music") || document.visibilityState === "hidden") {
    musicGeneration++;
    if (music) { musicPosition = music.position(); music.stop(); music = null; }
    return;
  }
  if (music || musicPending || !musicActivated) return;
  const owner = sound, generation = musicGeneration;
  musicPending = true;
  owner.playSample(loungeMusic, () => owner === sound && generation === musicGeneration && document.visibilityState !== "hidden", { channel: "music", loop: true, offset: musicPosition })
    .catch(() => null)
    .then(handle => { if (generation === musicGeneration && sound === owner) music = handle; else handle?.stop(); })
    .finally(() => { musicPending = false; if (generation !== musicGeneration && sound) syncMusic(); });
}
function activateMusic() { musicActivated = true; syncMusic(); }
export function acquireGameSounds() {
  if (!owners++) {
    sound = createNotificationSound({ throttleMs: 0 });
    window.addEventListener("pointerdown", activateMusic);
    window.addEventListener("keydown", activateMusic);
    window.addEventListener("ktga-sounds-updated", syncMusic);
    window.addEventListener("storage", syncMusic);
    document.addEventListener("visibilitychange", syncMusic);
    syncMusic();
  }
  return () => { if (!--owners) {
    musicGeneration++; music?.stop(); music = null; musicPosition = 0; musicActivated = false;
    window.removeEventListener("pointerdown", activateMusic);
    window.removeEventListener("keydown", activateMusic);
    window.removeEventListener("ktga-sounds-updated", syncMusic);
    window.removeEventListener("storage", syncMusic);
    document.removeEventListener("visibilitychange", syncMusic);
    sound.close(); sound = null; lastPlayed.clear(); variants.clear();
  } };
}
