import { audioVolume } from "./audio-settings.js";

export function createNotificationSound({ tones = [[880, 0, .12, "sine"], [1320, .06, .07, "sine"]], throttleMs = 500 } = {}) {
  let context;
  let lastPlayedAt = 0;
  const buses = new Map(), buffers = new Map(), samples = new Set();
  const updateMix = () => { for (const [channel, bus] of buses) {
    const value = audioVolume(channel);
    if (bus.gain.setTargetAtTime) bus.gain.setTargetAtTime(value, context.currentTime, .04);
    else bus.gain.value = value;
  } };
  const output = channel => {
    if (!buses.has(channel)) { const bus = context.createGain(); bus.gain.value = audioVolume(channel); bus.connect(context.destination); buses.set(channel, bus); }
    return buses.get(channel);
  };
  const unlock = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      context ??= new AudioContextClass();
      if (context.state === "suspended") context.resume().catch(() => {});
    } catch { /* Browsers can deny audio before the first interaction. */ }
  };
  const play = async (shouldPlay = () => true, { tones: notes = tones, duration = .55 } = {}) => {
    if (!context && navigator.userActivation?.hasBeenActive) unlock();
    const audio = context;
    if (!audio || audio.state === "closed") return false;
    try { if (audio.state === "suspended") await audio.resume(); }
    catch { return false; }
    if (context !== audio || audio.state !== "running" || !shouldPlay() || !audioVolume()) return false;
    if (Date.now() - lastPlayedAt < throttleMs) return true;
    lastPlayedAt = Date.now();
    const start = context.currentTime;
    for (const [frequency, delay, volume, type, length = duration] of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + delay);
      gain.gain.linearRampToValueAtTime(volume, start + delay + .008);
      gain.gain.exponentialRampToValueAtTime(.001, start + delay + length);
      oscillator.connect(gain);
      gain.connect(output("ambience"));
      oscillator.start(start + delay);
      oscillator.stop(start + delay + length + .01);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    return true;
  };
  const loadSample = async url => {
    if (!context && navigator.userActivation?.hasBeenActive) unlock();
    if (!context || context.state === "closed") return null;
    const audio = context;
    if (!buffers.has(url)) buffers.set(url, (async () => {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Audio unavailable");
      return audio.decodeAudioData(await response.arrayBuffer());
    })().catch(() => { buffers.delete(url); return null; }));
    return buffers.get(url);
  };
  const playSample = async (url, shouldPlay = () => true, { channel = "ambience", loop = false, offset = 0 } = {}) => {
    if (!audioVolume(channel) || !shouldPlay()) return null;
    const buffer = await loadSample(url), audio = context;
    if (!audio || !buffer || audio.state === "closed") return null;
    try { if (audio.state === "suspended") await audio.resume(); } catch { return null; }
    if (context !== audio || audio.state !== "running" || !shouldPlay() || !audioVolume(channel) || samples.size >= 12) return null;
    const source = audio.createBufferSource(); source.buffer = buffer; source.loop = loop;
    source.connect(output(channel));
    let stopped = false;
    const startedAt = audio.currentTime;
    const handle = { position: () => (offset + audio.currentTime - startedAt) % buffer.duration, stop: () => { if (stopped) return; stopped = true; source.stop(); source.disconnect(); samples.delete(handle); } };
    source.onended = () => { stopped = true; source.disconnect(); samples.delete(handle); };
    samples.add(handle); source.start(0, offset % buffer.duration);
    return handle;
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("ktga-sounds-updated", updateMix);
  window.addEventListener("storage", updateMix);
  if (navigator.userActivation?.hasBeenActive) unlock();
  return {
    play, playSample, preload: loadSample,
    close() {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("ktga-sounds-updated", updateMix);
      window.removeEventListener("storage", updateMix);
      for (const sample of [...samples]) sample.stop();
      for (const bus of buses.values()) bus.disconnect();
      buses.clear(); buffers.clear();
      context?.close().catch(() => {});
    }
  };
}
