export function createConversationSound() {
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
  const play = () => {
    if (!context && navigator.userActivation?.hasBeenActive) unlock();
    if (!context || context.state !== "running" || Date.now() - lastPlayedAt < 500) return;
    lastPlayedAt = Date.now();
    const start = context.currentTime;
    for (const [frequency, delay, volume] of [[880, 0, .12], [1320, .06, .07]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
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
