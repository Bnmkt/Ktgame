import test from "node:test";
import assert from "node:assert/strict";
import { gradientStops, shadowFilter, splitCssList } from "../src/components/game/dice-surface.js";

test("CSS layers keep colors, nested functions and quoted image URLs intact", () => {
  assert.deepEqual(splitCssList('url("/image,a.png"), linear-gradient(90deg, rgb(1, 2, 3), rgba(4, 5, 6, .5))'), ['url("/image,a.png")', 'linear-gradient(90deg, rgb(1, 2, 3), rgba(4, 5, 6, .5))']);
});

test("gradient stops retain explicit positions and interpolate omitted positions", () => {
  assert.deepEqual(gradientStops("linear-gradient(145deg, rgb(255, 0, 0) 20%, rgb(0, 255, 0), rgb(0, 0, 255) 80%)").map((stop) => stop.offset), [.2, .5, .8]);
  assert.deepEqual(gradientStops("radial-gradient(circle at 30% 24%, rgb(255, 0, 0), rgb(0, 0, 0))").map((stop) => stop.offset), [0, 1]);
  assert.deepEqual(gradientStops('url("/image.png")'), []);
});

test("cosmetic shadows follow the die silhouette and exclude inset frame shadows", () => {
  assert.equal(shadowFilter("rgba(0, 0, 0, 0.4) 0px 12px 20px 0px, rgba(255, 0, 0, 0.5) 0px 0px 8px 0px"), "drop-shadow(0px 12px 10px rgba(0, 0, 0, 0.4)) drop-shadow(0px 0px 4px rgba(255, 0, 0, 0.5))");
  assert.equal(shadowFilter("inset rgb(0, 0, 0) 0px 0px 4px 0px"), "none");
  assert.equal(shadowFilter("none"), "none");
});
