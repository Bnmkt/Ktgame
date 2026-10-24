import fs from "node:fs/promises";
import path from "node:path";

export function createDocumentLogoLoader({
  mediaLibrary,
  settings,
  publicDirectory,
}) {
  async function readImage(filename) {
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
      throw Error("Le logo PDF doit peser au maximum 2 Mo.");
    const body = await fs.readFile(filename);
    if (
      !body
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      !(body[0] === 255 && body[1] === 216)
    )
      throw Error("Logo PDF invalide : PNG ou JPEG requis.");
    return body;
  }
  return async (override) => {
    const current = settings();
    for (const image of [
      override,
      current.siteIconImage,
      current.pwaIcons?.["192"],
    ]) {
      if (!image) continue;
      const row = mediaLibrary.get(String(image).split("/").at(-1));
      if (!row || !["image/png", "image/jpeg"].includes(row.mime)) {
        if (image === override)
          throw Error("Logo PDF introuvable ou format non supporté.");
        continue;
      }
      try {
        return await readImage(mediaLibrary.target(row.id));
      } catch (error) {
        if (image === override) throw error;
      }
    }
    try {
      return await readImage(path.join(publicDirectory, "pwa/icon-192.png"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
}
