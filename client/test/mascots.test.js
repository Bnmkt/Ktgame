import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mascotSources, mascotScenes, mascotAsset, gameMascot } from "../src/features/mascots/catalog.js";

test("every mascot pose has supplied artwork and lightweight web assets", () => {
  assert.equal(Object.keys(mascotSources).length, 5);
  const root = new URL("../public/mascotte_assets/", import.meta.url);
  for (const [character, poses] of Object.entries(mascotSources)) for (const [pose, original] of Object.entries(poses)) {
    assert.ok(fs.existsSync(new URL(original, root)));
    for (const width of [360, 720]) {
      const output = new URL(`../public/${mascotAsset(character, pose, width)}`, import.meta.url);
      const data = fs.readFileSync(output);
      assert.equal(data.toString("ascii", 0, 4), "RIFF");
      assert.equal(data.toString("ascii", 8, 12), "WEBP");
      assert.ok(data.length < 200000);
    }
  }
  for (const original of Object.values(mascotScenes)) assert.ok(fs.existsSync(new URL(original, root)));
});

test("safe fallbacks and contextual mascots remain deterministic", () => {
  assert.equal(mascotAsset("unknown", "missing"), mascotAsset("lucky", "welcome"));
  assert.equal(mascotAsset("__proto__", "constructor"), mascotAsset("lucky", "welcome"));
  assert.equal(gameMascot("midnight-dice").character, "midnight");
  assert.equal(gameMascot("blackjack").character, "jacky");
  assert.equal(gameMascot("yahtzee").character, "lucky");
});
