import { unzipSync } from "fflate";

export const IMAGE_ARCHIVE_LIMITS = { compressed:50 * 1024 * 1024, expanded:100 * 1024 * 1024, images:200, entries:2000 };
const mimeTypes = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", webp:"image/webp", gif:"image/gif" };

function matchesImage(bytes, mime) {
  if (bytes.length < 20) return false;
  if (mime === "image/png") return [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n);
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216;
  const text = new TextDecoder().decode(bytes.subarray(0,12));
  return mime === "image/gif" ? /^GIF8[79]a/.test(text) : text.startsWith("RIFF") && text.endsWith("WEBP");
}

export function extractImageArchive(bytes, maxMb = 3) {
  if (!(bytes instanceof Uint8Array) || bytes.length > IMAGE_ARCHIVE_LIMITS.compressed || bytes[0] !== 80 || bytes[1] !== 75) throw Error("Choisis une archive ZIP de 50 Mo maximum.");
  const rows = [], occurrences = new Map();
  let count = 0, skipped = 0, total = 0;
  // Inspect the central directory before inflating any file, including unselected/non-image entries.
  unzipSync(bytes, { filter:file => {
    if (++count > IMAGE_ARCHIVE_LIMITS.entries) throw Error("Cette archive contient trop de fichiers.");
    const filepath = file.name.replaceAll("\\", "/");
    const filename = filepath.split("/").at(-1), extension = filename.split(".").at(-1).toLowerCase();
    const mime = Object.hasOwn(mimeTypes,extension) ? mimeTypes[extension] : "";
    if (!mime || filepath.startsWith("__MACOSX/") || filename.startsWith(".")) { skipped++; return false; }
    if (rows.length >= IMAGE_ARCHIVE_LIMITS.images) throw Error("L’archive doit contenir au maximum 200 images.");
    let problem = "";
    if (filepath.startsWith("/") || /^[a-z]:/i.test(filepath) || filepath.split("/").includes("..") || /[\u0000-\u001f]/.test(filepath)) problem = "Chemin de fichier non autorisé.";
    else if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 20) problem = "Image vide ou invalide.";
    else if (file.originalSize > Math.min(20,Math.max(1,maxMb)) * 1024 * 1024) problem = `Cette image dépasse ${maxMb} Mo.`;
    else if (![0,8].includes(file.compression)) problem = "Compression ZIP non prise en charge.";
    else if (file.originalSize > file.size * 200 + 1048576) problem = "Taux de compression anormal.";
    if (!problem) { total += file.originalSize; if (total > IMAGE_ARCHIVE_LIMITS.expanded) throw Error("Les images décompressées dépassent 100 Mo. Sépare l’archive en plusieurs lots."); }
    occurrences.set(file.name, (occurrences.get(file.name) ?? 0) + 1);
    rows.push({ path:file.name, filename, name:filename.slice(0,120), mime, bytes:file.originalSize, problem });
    return false;
  }});
  if (!rows.length) throw Error("Aucune image PNG, JPEG, WebP ou GIF dans cette archive.");
  for (const row of rows) if (occurrences.get(row.path) > 1) row.problem = "Plusieurs fichiers partagent ce chemin dans l’archive.";
  const accepted = new Set(rows.filter(row => !row.problem).map(row => row.path));
  const files = unzipSync(bytes, { filter:file => accepted.has(file.name) });
  return { skipped, rows:rows.map((row,index) => {
    const image = files[row.path];
    if (!row.problem && (!image || image.length !== row.bytes || !matchesImage(image,row.mime))) row.problem = "Le contenu ne correspond pas à une image valide.";
    return { ...row, id:String(index), blob:row.problem ? null : new Blob([image], { type:row.mime }) };
  }) };
}
