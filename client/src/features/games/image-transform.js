export function imageTransform(crop = {}) {
  const rotation = Number.isFinite(crop.rotation) ? ((crop.rotation % 360) + 540) % 360 - 180 : 0;
  return { rotation, flipX: crop.flipX === true, flipY: crop.flipY === true };
}

export function transformedImageSize(width, height, crop = {}) {
  const angle = imageTransform(crop).rotation * Math.PI / 180;
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  return { width: width * cos + height * sin, height: width * sin + height * cos };
}

export function cropImageStyle(width, height, crop, bounds) {
  const size = transformedImageSize(width, height, crop);
  const transform = imageTransform(crop);
  const sampledHeight = bounds.height ?? bounds.side, sampledWidth = bounds.width ?? bounds.side;
  return {
    width: `${width / sampledWidth * 100}%`, height: `${height / sampledHeight * 100}%`,
    left: `${(0.5 + (size.width / 2 - bounds.x * size.width) / sampledWidth) * 100}%`,
    top: `${(0.5 + (size.height / 2 - bounds.y * size.height) / sampledHeight) * 100}%`,
    transformOrigin: "center", transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.flipX ? -1 : 1}, ${transform.flipY ? -1 : 1})`
  };
}

export function drawTransformedCrop(context, image, crop, bounds, outputWidth, outputHeight) {
  const size = transformedImageSize(image.naturalWidth, image.naturalHeight, crop);
  const transform = imageTransform(crop);
  // Transform directly into the output canvas, without allocating a full-sized intermediate image.
  context.save();
  context.scale(outputWidth / (bounds.width ?? bounds.side), outputHeight / (bounds.height ?? bounds.side));
  context.translate(size.width / 2 - bounds.left, size.height / 2 - bounds.top);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}
