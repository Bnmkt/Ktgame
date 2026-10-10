const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const gameArtworkFormats = {
  descriptiveImage: { label: "Image descriptive", width: 960, height: 720 },
  coverImage: { label: "Bannière", width: 1280, height: 560 }
};

export function artworkCropBounds(width, height, crop = {}, ratio = 16 / 7) {
  if (![width, height, ratio].every((value) => Number.isFinite(value) && value > 0)) throw new Error("Invalid image dimensions.");
  const zoom = clamp(Number.isFinite(crop.zoom) ? crop.zoom : 1, 0.5, 5);
  const cropWidth = Math.min(width, height * ratio) / zoom;
  const cropHeight = cropWidth / ratio;
  const halfX = cropWidth / (2 * width), halfY = cropHeight / (2 * height);
  const x = clamp(Number.isFinite(crop.x) ? crop.x : 0.5, Math.min(halfX, 1 - halfX), Math.max(halfX, 1 - halfX));
  const y = clamp(Number.isFinite(crop.y) ? crop.y : 0.5, Math.min(halfY, 1 - halfY), Math.max(halfY, 1 - halfY));
  return { zoom, x, y, width: cropWidth, height: cropHeight, left: x * width - cropWidth / 2, top: y * height - cropHeight / 2 };
}

export async function encodeArtworkCrop(image, crop, format) {
  const bounds = artworkCropBounds(image.naturalWidth, image.naturalHeight, crop, format.width / format.height);
  const canvas = document.createElement("canvas");
  canvas.width = format.width; canvas.height = format.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le recadrage n’est pas disponible dans ce navigateur.");
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#101b17";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, format.width, format.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob || blob.size > 3 * 1024 * 1024) throw new Error("L’image recadrée dépasse 3 Mo. Choisis une autre image.");
  return blob;
}
