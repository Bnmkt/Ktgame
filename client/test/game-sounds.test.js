import test from "node:test";
import assert from "node:assert/strict";
import { acquireGameSounds, gameSoundsEnabled, playGameSound, setGameSoundsEnabled } from "../src/utils/game-sounds.js";
import { audioSettings, audioVolume, normalizeAudioSettings, updateAudioSettings } from "../src/utils/audio-settings.js";
import { audioSamples, nextAudioVariant } from "../src/utils/audio-assets.js";

test("game effects share one context, honor mute/visibility, and release audio resources", async () => {
  const saved = ["window", "navigator", "document", "localStorage", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const contexts = [], notes = [], stored = new Map(), listeners = new Set(), sources = [], fetched = [];
  class Audio {
    constructor() { this.state = "running"; this.currentTime = 1; this.destination = {}; contexts.push(this); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createOscillator() { const node = { frequency: {}, connect() {}, start() { notes.push(this.frequency.value); }, stop() {} }; return node; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    async decodeAudioData() { return { duration: 97 }; }
    createBufferSource() { const source = { connect() {}, disconnect() {}, start() {}, stop() {} }; sources.push(source); return source; }
  }
  const globals = {
    window: { AudioContext: Audio, addEventListener: (_type, listener) => listeners.add(listener), removeEventListener: (_type, listener) => listeners.delete(listener), dispatchEvent() {} },
    navigator: { userActivation: { hasBeenActive: true } }, document: { visibilityState: "visible", addEventListener: (_type, listener) => listeners.add(listener), removeEventListener: (_type, listener) => listeners.delete(listener) },
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    fetch: async url => { fetched.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; }
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let release, second;
  try {
    release = acquireGameSounds(); second = acquireGameSounds();
    assert.equal(contexts.length, 1);
    assert.equal(fetched.length, 0, "no music download before a local interaction");
    for (const listener of [...listeners]) listener();
    for (const kind of ["click", "dice", "card", "start", "warning", "limit"]) await playGameSound(kind);
    assert.equal(notes.length, 8);
    assert.ok(sources.some(source => source.loop), "music loops after activation");
    assert.ok(fetched.some(url => url.includes("dice-throw-")));
    assert.ok(fetched.some(url => url.includes("card-slide-")));
    await playGameSound("dice"); assert.equal(notes.length, 8, "duplicates are throttled");
    setGameSoundsEnabled(false); assert.equal(gameSoundsEnabled(), false);
    assert.equal(playGameSound("start"), undefined);
    stored.set("ktga-audio-mix", JSON.stringify({ ...audioSettings(), muted: false })); assert.equal(gameSoundsEnabled(), true, "cross-tab changes are respected");
    updateAudioSettings({ master: .5, ambience: .8, music: .2 });
    assert.equal(audioVolume(), .4); assert.equal(audioVolume("music"), .1);
    globals.document.visibilityState = "hidden";
    assert.equal(playGameSound("card"), undefined);
    release(); release = null; assert.equal(contexts[0].state, "running");
    second(); second = null; assert.equal(contexts[0].state, "closed"); assert.equal(listeners.size, 0);
  } finally {
    release?.(); second?.();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test("random variants never immediately repeat, and mixer values are bounded", () => {
  let previous;
  for (let index = 0; index < 30; index++) {
    const next = nextAudioVariant(audioSamples.card, previous, () => .3);
    assert.notEqual(next, previous); assert.ok(audioSamples.card.includes(next)); previous = next;
  }
  assert.deepEqual(normalizeAudioSettings({ master: -1, ambience: 4, music: NaN, muted: "false" }), { master: 0, ambience: 1, music: .18, muted: false });
});
