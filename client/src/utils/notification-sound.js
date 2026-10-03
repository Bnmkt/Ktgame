export function createNotificationSound({ tones = [[880, 0, .12, "sine"], [1320, .06, .07, "sine"]] } = {}) {
  let context;
  let lastPlayedAt = 0;
  const unlock = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      context ??= new AudioContextClass();
      if (context.state === "suspended") context.resume().catch(() => {});
    } catch { /* Browsers can deny audio before the first interaction. */ }
  };
  const play = async () => {
    if (!context && navigator.userActivation?.hasBeenActive) unlock();
    const audio = context;
    if (!audio || audio.state === "closed") return false;
    try { if (audio.state === "suspended") await audio.resume(); }
    catch { return false; }
    if (context !== audio || audio.state !== "running") return false;
    if (Date.now() - lastPlayedAt < 500) return true;
    lastPlayedAt = Date.now();
    const start = context.currentTime;
    for (const [frequency, delay, volume, type] of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + delay);
      gain.gain.linearRampToValueAtTime(volume, start + delay + .008);
      gain.gain.exponentialRampToValueAtTime(.001, start + delay + .55);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + delay);
      oscillator.stop(start + delay + .56);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    return true;
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  if (navigator.userActivation?.hasBeenActive) unlock();
  return {
    play,
    close() {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      context?.close().catch(() => {});
    }
  };
}
