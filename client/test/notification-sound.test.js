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
