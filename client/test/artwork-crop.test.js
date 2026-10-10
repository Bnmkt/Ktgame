import test from "node:test";
import assert from "node:assert/strict";
import { artworkCropBounds, gameArtworkFormats } from "../src/features/games/artwork-crop.js";

test("game images use distinct landscape formats", () => {
  assert.equal(gameArtworkFormats.coverImage.width / gameArtworkFormats.coverImage.height, 16 / 7);
  assert.equal(gameArtworkFormats.descriptiveImage.width / gameArtworkFormats.descriptiveImage.height, 4 / 3);
});

test("crop fits portrait and landscape sources without empty margins", () => {
  for (const [width, height] of [[400, 1200], [1600, 900], [1280, 560]]) {
    for (const zoom of [1, 2, 5, 10]) {
      for (const x of [-5, 0.5, 5]) {
        const crop = artworkCropBounds(width, height, { zoom, x, y: x });
        assert.ok(crop.left >= -1e-8 && crop.top >= -1e-8);
        assert.ok(crop.left + crop.width <= width + 1e-8);
        assert.ok(crop.top + crop.height <= height + 1e-8);
        assert.ok(crop.zoom >= 1 && crop.zoom <= 5);
        assert.ok(Math.abs(crop.width / crop.height - 16 / 7) < 1e-8);
      }
    }
  }
});

test("0.5x zoom shows the full source and allows movement inside the larger frame", () => {
  const original = artworkCropBounds(1280, 560);
  const smaller = artworkCropBounds(1280, 560, { zoom: 0.5 });
  assert.equal(smaller.zoom, 0.5);
  assert.equal(smaller.width, original.width * 2);
  assert.equal(smaller.height, original.height * 2);
  assert.equal(smaller.left, -640);
  assert.equal(smaller.top, -280);
  for (const x of [-5, 0.5, 5]) {
    const moved = artworkCropBounds(1280, 560, { zoom: -1, x, y: x });
    assert.equal(moved.zoom, 0.5);
    assert.ok(moved.left <= 0 && moved.top <= 0);
    assert.ok(moved.left + moved.width >= 1280 && moved.top + moved.height >= 560);
  }
});

test("zoom preserves the center and halves the sampled image at 2x", () => {
  const original = artworkCropBounds(1600, 900);
  const zoomed = artworkCropBounds(1600, 900, { zoom: 2 });
  assert.equal(zoomed.width, original.width / 2);
  assert.equal(zoomed.height, original.height / 2);
  assert.equal(zoomed.x, 0.5);
  assert.equal(zoomed.y, 0.5);
  for (const dimensions of [[0, 1], [1, Infinity], [-1, 2]]) assert.throws(() => artworkCropBounds(...dimensions));
});
