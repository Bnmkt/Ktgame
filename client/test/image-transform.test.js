import test from "node:test";
import assert from "node:assert/strict";
import { imageTransform, transformedImageSize, cropImageStyle, drawTransformedCrop } from "../src/features/games/image-transform.js";
import { artworkCropBounds } from "../src/features/games/artwork-crop.js";
import { insigniaCropBounds } from "../src/features/games/insignia-crop.js";

const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} != ${expected}`);
test("rotations normalize safely and flips require explicit booleans", () => {
  assert.deepEqual(imageTransform({ rotation: 450, flipX: true, flipY: "true" }), { rotation: 90, flipX: true, flipY: false });
  assert.equal(imageTransform({ rotation: Infinity }).rotation, 0);
  assert.equal(imageTransform({ rotation: -450 }).rotation, -90);
});
test("oriented crop geometry preserves aspect ratio and allows transparent insignia margins", () => {
  const size = transformedImageSize(800, 400, { rotation: 90 });
  near(size.width, 400); near(size.height, 800);
  const artwork = artworkCropBounds(800, 400, { rotation: 90 }, 1);
  near(artwork.width, 400); near(artwork.height, 400); near(artwork.top, 200);
  const insignia = insigniaCropBounds(800, 400, { rotation: 90, x: 1.25, flipX: true });
  near(insignia.side, 400); near(insignia.left, 300);
  for (const rotation of [-180, -90, -30, 0, 45, 90, 180]) {
    const dimensions = transformedImageSize(800, 400, { rotation });
    const crop = artworkCropBounds(800, 400, { rotation, zoom: 2, x: -5, y: 10 }, 4 / 3);
    near(crop.width / crop.height, 4 / 3);
    assert.ok(crop.left >= -1e-8 && crop.top >= -1e-8);
    assert.ok(crop.left + crop.width <= dimensions.width + 1e-8);
    assert.ok(crop.top + crop.height <= dimensions.height + 1e-8);
  }
});
test("preview rotates and mirrors around the same sampled center as the exported canvas", () => {
  const crop = { rotation: 90, flipX: true, zoom: 1, x: 0.5, y: 0.5 };
  const bounds = artworkCropBounds(800, 400, crop, 1);
  const style = cropImageStyle(800, 400, crop, bounds);
  near(parseFloat(style.left), 50); near(parseFloat(style.top), 50);
  assert.match(style.transform, /rotate\(90deg\) scale\(-1, 1\)/);
  const calls = [];
  const ctx = Object.fromEntries(["save", "scale", "translate", "rotate", "drawImage", "restore"].map(name => [name, (...args) => calls.push([name, ...args])]));
  const image = { naturalWidth: 800, naturalHeight: 400 };
  drawTransformedCrop(ctx, image, crop, bounds, 512, 512);
  near(calls.find(call => call[0] === "rotate")[1], Math.PI / 2);
  assert.deepEqual(calls.filter(call => call[0] === "scale").at(-1), ["scale", -1, 1]);
  assert.deepEqual(calls.find(call => call[0] === "drawImage"), ["drawImage", image, -400, -200]);
  assert.equal(calls.at(-1)[0], "restore");
});
