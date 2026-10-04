const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sanitizeBugImage(body) {
  if (!Buffer.isBuffer(body) || body.length > 3 * 1024 * 1024 || body.length < 45 || !body.subarray(0, 8).equals(signature)) throw new Error("Une capture PNG valide de 3 Mo maximum est nécessaire.");
  const chunks = [signature];
  let position = 8, header = false, pixels = false;
  while (position + 12 <= body.length) {
    const length = body.readUInt32BE(position);
    const end = position + length + 12;
    if (end > body.length) throw new Error("Capture tronquée.");
    const type = body.subarray(position + 4, position + 8).toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(body.subarray(position + 4, end - 4)) !== body.readUInt32BE(end - 4)) throw new Error("Capture PNG endommagée.");
    if (!header && type !== "IHDR") throw new Error("En-tête de capture invalide.");
    if (type === "IHDR") {
      if (header || length !== 13) throw new Error("En-tête de capture invalide.");
      const width = body.readUInt32BE(position + 8), height = body.readUInt32BE(position + 12);
      if (!width || !height || width > 4096 || height > 4096 || width * height > 16777216) throw new Error("La capture dépasse 4 096 pixels.");
      header = true;
      if (![0, 2, 3, 4, 6].includes(body[position + 17]) || body[position + 18] !== 0 || body[position + 19] !== 0 || body[position + 20] > 1) throw new Error("Format de capture invalide.");
    }
    if (type === "IDAT" && length) pixels = true;
    // Keep only rendering chunks: no text, EXIF, location, animation or trailing payload.
    if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type)) chunks.push(body.subarray(position, end));
    if (type === "IEND") {
      if (length !== 0 || !pixels) throw new Error("Capture sans pixels.");
      return Buffer.concat(chunks);
    }
    position = end;
  }
  throw new Error("Capture incomplète.");
}
