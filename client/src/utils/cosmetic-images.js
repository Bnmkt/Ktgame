export function cosmeticImage(value) {
  return typeof value === "string" && /^\/api\/media\/[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/.test(value) ? value : "";
}

export function cosmeticImageSettings(value = {}) {
  const position = key => Math.max(0, Math.min(100, Number.isFinite(value[key]) ? value[key] : 50));
  return {
    surfaceImage: cosmeticImage(value.surfaceImage), faceImage: cosmeticImage(value.faceImage), backImage: cosmeticImage(value.backImage), oneImage: cosmeticImage(value.oneImage),
    imageFit: value.imageFit === "contain" ? "contain" : "cover",
    imagePositionX: position("imagePositionX"), imagePositionY: position("imagePositionY")
  };
}

export function cosmeticImageBackground(design, field, fallback, resolve = image => image) {
  const settings = cosmeticImageSettings(design);
  const image = settings[field];
  return image ? `url("${resolve(image)}") ${settings.imagePositionX}% ${settings.imagePositionY}% / ${settings.imageFit} no-repeat, ${fallback}` : fallback;
}
