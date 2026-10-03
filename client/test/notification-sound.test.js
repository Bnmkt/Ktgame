import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationSound } from "../src/utils/notification-sound.js";

async function withAudio(activated, run) {
  const previous = ["window", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const listeners = new Map();
  const oscillators = [];
  const contexts = [];
  class Audio {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; contexts.push(this); }
    async resume() { await Promise.resolve(); if (this.state !== "closed") this.state = "running"; }
    async close() { this.state = "closed"; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { const node = { frequency: {}, connect() {}, disconnect() {}, start() {}, stop() {} }; oscillators.push(node); return node; }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    AudioContext: Audio,
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); }
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userActivation: { hasBeenActive: activated } } });
  try { await run({ listeners, oscillators, contexts }); }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("le son attend la reprise du contexte audio et evite les doublons immediats", async () => {
  await withAudio(true, async ({ oscillators, contexts }) => {
    const cue = createNotificationSound();
    assert.equal(await cue.play(), true);
    assert.equal(oscillators.length, 2);
    assert.equal(await cue.play(), true);
    assert.equal(oscillators.length, 2);
    assert.equal(contexts.length, 1);
    cue.close();
  });
});

test("une premiere interaction debloque le son et la fermeture retire les ecouteurs", async () => {
  await withAudio(false, async ({ listeners, oscillators, contexts }) => {
    const cue = createNotificationSound();
    assert.equal(await cue.play(), false);
    assert.equal(contexts.length, 0);
    listeners.get("pointerdown")();
    assert.equal(await cue.play(), true);
    assert.equal(oscillators.length, 2);
    cue.close();
    assert.equal(listeners.size, 0);
    assert.equal(contexts[0].state, "closed");
    assert.equal(await cue.play(), false);
  });
});

test("le signal de tour peut choisir ses propres notes sans changer celui du chat", async () => {
  await withAudio(true, async ({ oscillators }) => {
    const cue = createNotificationSound({ tones: [[659.25, 0, .15, "sine"], [783.99, .11, .12, "triangle"]] });
    await cue.play();
    assert.deepEqual(oscillators.map((node) => [node.frequency.value, node.type]), [[659.25, "sine"], [783.99, "triangle"]]);
    cue.close();
  });
});
test("audio retries after activation, cancels stale turns and cleans up", async () => {
  const previousWindow = globalThis.window;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let activated = false;
  let resume;
  let oscillatorCount = 0;
  let closed = false;
  const events = new Map();
  class AudioContext {
    constructor() { this.state = "suspended"; this.currentTime = 1; }
    resume() { return new Promise((resolve) => { resume = () => { this.state = "running"; resolve(); }; }); }
    createOscillator() { oscillatorCount += 1; return { frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    close() { closed = true; this.state = "closed"; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext, addEventListener: (name, handler) => events.set(name, handler), removeEventListener: (name) => events.delete(name) };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userActivation: { get hasBeenActive() { return activated; } } } });
  let sound;
  try {
    sound = createNotificationSound();
    assert.equal(await sound.play(), false);
    activated = true;
    let expected = true;
    const staleAttempt = sound.play(() => expected);
    expected = false;
    resume();
    assert.equal(await staleAttempt, false);
    assert.equal(oscillatorCount, 0);
    expected = true;
    assert.equal(await sound.play(() => expected), true);
    assert.equal(oscillatorCount, 2);
    await sound.play();
    assert.equal(oscillatorCount, 2, "rapid retry does not duplicate the sound");
    sound.close();
    assert.equal(closed, true);
    assert.equal(events.size, 0);
    assert.equal(await sound.play(), false);
  } finally {
    sound?.close();
    globalThis.window = previousWindow;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
  }
});
