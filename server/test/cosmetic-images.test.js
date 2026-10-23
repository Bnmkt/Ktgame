import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCosmeticDesign } from "../src/services/cosmetic-validation.js";
import { cosmeticImage, cosmeticImageBackground } from "../../client/src/utils/cosmetic-images.js";

const image = `/api/media/${"a".repeat(64)}.png`;
test("uploaded shop images persist for every visual studio and card sides remain independent", () => {
  for (const type of ["diceSkins", "cardSkins", "memberCards", "profileBanners", "profileFrames"]) {
    const design = normalizeCosmeticDesign({ surfaceImage: image, faceImage: image, backImage: image.replace(".png", ".gif"), imageFit: "contain", imagePositionX: 23, imagePositionY: 87 }, type);
    assert.equal(design.surfaceImage, image);
    assert.equal(design.faceImage, image);
    assert.equal(design.backImage.endsWith(".gif"), true);
    assert.equal(design.imageFit, "contain");
    assert.equal(design.imagePositionX, 23);
    assert.match(cosmeticImageBackground(design, "faceImage", "#fff"), /23% 87% \/ contain no-repeat/);
  }
});
test("cosmetic textures reject arbitrary URLs, SVG and injection without affecting legacy designs", () => {
  for (const invalid of ["https://example.com/pixel.png", "//example.com/x", "/api/media/../x.png", `${image}\" );color:red`, image.replace(".png", ".svg"), "data:image/png;base64,AAAA", "javascript:alert(1)"]) {
    assert.equal(cosmeticImage(invalid), "");
    const design = normalizeCosmeticDesign({ surfaceImage: invalid, imagePositionX: Infinity, imagePositionY: -10, imageFit: "invalid" }, "diceSkins");
    assert.equal(design.surfaceImage, "");
    assert.equal(design.imagePositionX, 50);
    assert.equal(design.imagePositionY, 0);
    assert.equal(cosmeticImageBackground(design, "surfaceImage", "#fff"), "#fff");
  }
  assert.equal(normalizeCosmeticDesign(null, "diceSkins"), null);
  assert.equal(normalizeCosmeticDesign({ primaryColor: "#123456" }, "diceSkins").primaryColor, "#123456");
});

test("the optional first die face persists independently and is disabled for existing skins", () => {
  const legacy = normalizeCosmeticDesign({}, "diceSkins");
  assert.equal(legacy.oneEnabled, false);
  assert.equal(legacy.oneShowPip, true);
  const design = normalizeCosmeticDesign({ oneEnabled: true, oneShowPip: false, oneImage: image, onePrimaryColor: "#123ABC", oneSecondaryColor: "#234567", onePipColor: "#ABCDEF", oneBackgroundMode: "radial" }, "diceSkins");
  assert.equal(design.oneEnabled, true);
  assert.equal(design.oneShowPip, false);
  assert.equal(design.oneImage, image);
  assert.equal(design.onePrimaryColor, "#123abc");
  assert.equal(design.oneBackgroundMode, "radial");
  const invalid = normalizeCosmeticDesign({ oneEnabled: "true", oneImage: "https://example.com/secret", onePrimaryColor: "red; color:red", oneBackgroundMode: "url()" }, "diceSkins");
  assert.equal(invalid.oneEnabled, false);
  assert.equal(invalid.oneImage, "");
  assert.equal(invalid.onePrimaryColor, "#b11226");
  assert.equal(invalid.oneBackgroundMode, "solid");
});
