const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function insigniaCropBounds(width, height, crop = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Invalid image dimensions.");
  const zoom = clamp(Number.isFinite(crop.zoom) ? crop.zoom : 1, 0.25, 5);
  const side = Math.min(width, height) / zoom;
  const x = clamp(Number.isFinite(crop.x) ? crop.x : 0.5, -side / (2 * width), 1 + side / (2 * width));
  const y = clamp(Number.isFinite(crop.y) ? crop.y : 0.5, -side / (2 * height), 1 + side / (2 * height));
  return { zoom, x, y, side, left: x * width - side / 2, top: y * height - side / 2 };
}

export async function encodeInsigniaCrop(image, crop) {
  const bounds = insigniaCropBounds(image.naturalWidth, image.naturalHeight, crop);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le recadrage n’est pas disponible dans ce navigateur.");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, bounds.left, bounds.top, bounds.side, bounds.side, 0, 0, 512, 512);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("L’image n’a pas pu être recadrée.");
  return blob;
}
