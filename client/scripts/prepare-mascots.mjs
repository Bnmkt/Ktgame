import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mascotSources, mascotScenes } from "../src/features/mascots/catalog.js";

// Optional asset-preparation tool; generated files are committed and need no runtime dependency.
const { default: sharp } = await import(process.env.KTGA_SHARP_MODULE ? pathToFileURL(process.env.KTGA_SHARP_MODULE).href : "sharp");

const root = fileURLToPath(new URL("../public/mascotte_assets/", import.meta.url));
const output = path.join(root, "ui");
await fs.mkdir(output, { recursive: true });
const previews = [];
for (const [character, poses] of Object.entries(mascotSources)) {
  for (const [pose, source] of Object.entries(poses)) {
    const input = path.join(root, source);
    for (const width of [360, 720]) await sharp(input).resize({ width, height: width, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(output, `${character}-${pose}-${width}.webp`));
    previews.push({ name: `${character} / ${pose}`, source: input });
  }
}
for (const [name, source] of Object.entries(mascotScenes)) {
  await sharp(path.join(root, source)).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(output, `scene-${name}.webp`));
  previews.push({ name, source: path.join(root, source) });
}
if (process.argv.includes("--sheet")) {
  const directory = fileURLToPath(new URL("../../docs/previews/mascots-20261018/", import.meta.url));
  await fs.mkdir(directory, { recursive: true });
  const cells = [];
  for (const [index, entry] of previews.entries()) {
    const left = index % 5 * 220, top = Math.floor(index / 5) * 240;
    cells.push({ input: await sharp(entry.source).resize(204, 204, { fit: "contain", background: "#283c36" }).png().toBuffer(), left: left + 8, top });
    cells.push({ input: Buffer.from(`<svg width="220" height="28"><text x="8" y="20" font-family="Arial" font-size="14" fill="white">${entry.name}</text></svg>`), left, top: top + 207 });
  }
  await sharp({ create: { width: 1100, height: Math.ceil(previews.length / 5) * 240, channels: 4, background: "#182923" } }).composite(cells).png().toFile(path.join(directory, "asset-sheet.png"));
}
console.log(`Prepared ${previews.length} supplied mascot illustrations.`);
