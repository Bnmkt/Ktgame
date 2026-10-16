import test from "node:test";
import assert from "node:assert/strict";
import { acquireGameSounds, gameSoundsEnabled, playGameSound, setGameSoundsEnabled } from "../src/utils/game-sounds.js";

test("game effects share one context, honor mute/visibility, and release audio resources", async () => {
  const saved = ["window", "navigator", "document", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const contexts = [], notes = [], stored = new Map(), listeners = new Set();
  class Audio {
    constructor() { this.state = "running"; this.currentTime = 1; this.destination = {}; contexts.push(this); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createOscillator() { const node = { frequency: {}, connect() {}, start() { notes.push(this.frequency.value); }, stop() {} }; return node; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  const globals = {
    window: { AudioContext: Audio, addEventListener: (_type, listener) => listeners.add(listener), removeEventListener: (_type, listener) => listeners.delete(listener), dispatchEvent() {} },
    navigator: { userActivation: { hasBeenActive: true } }, document: { visibilityState: "visible" },
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) }
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let release, second;
  try {
    release = acquireGameSounds(); second = acquireGameSounds();
    assert.equal(contexts.length, 1);
    for (const kind of ["click", "dice", "card", "start", "warning", "limit"]) await playGameSound(kind);
    assert.equal(notes.length, 15);
    await playGameSound("dice"); assert.equal(notes.length, 15, "duplicates are throttled");
    setGameSoundsEnabled(false); assert.equal(gameSoundsEnabled(), false);
    assert.equal(playGameSound("start"), undefined);
    stored.set("ktga-game-sounds", "on"); assert.equal(gameSoundsEnabled(), true, "cross-tab changes are respected");
    globals.document.visibilityState = "hidden";
    assert.equal(playGameSound("card"), undefined);
    release(); release = null; assert.equal(contexts[0].state, "running");
    second(); second = null; assert.equal(contexts[0].state, "closed"); assert.equal(listeners.size, 0);
  } finally {
    release?.(); second?.();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
