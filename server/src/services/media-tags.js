export function normalizeMediaTags(value) {
  if (!Array.isArray(value) || value.length > 20 || value.some(tag => typeof tag !== "string")) throw new Error("Une image peut avoir jusqu’à 20 tags.");
  const tags = value.map(tag => tag.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("fr"));
  if (tags.some(tag => !tag || tag.length > 40 || /[<>{},;\x00-\x1f\x7f]/u.test(tag))) throw new Error("Chaque tag doit contenir de 1 à 40 caractères, sans virgule ni caractère de contrôle.");
  return [...new Set(tags)];
}

export function initialMediaTags(row) {
  const tags = [];
  if (row.width > 0 && row.height > 0) tags.push(row.width === row.height ? "carré" : row.width > row.height ? "paysage" : "portrait");
  const label = `${row.name || ""} ${row.alt || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const characters = ["lucky", "midnight", "jacky", "nixie", "milo"].filter(name => new RegExp(`\\b${name}\\b`).test(label));
  if (characters.length || /\bmascottes?\b/.test(label)) tags.push("mascottes", ...characters);
  if (/\b(badge|insigne)s?\b/.test(label)) tags.push("insignes");
  if (/\b(logo|favicon|icone)s?\b/.test(label)) tags.push("icônes");
  if (/\bdos (?:de )?cartes?\b/.test(label)) tags.push("dos de cartes");
  if (/\b(fond|decor|ambiance)s?\b/.test(label)) tags.push("décors");
  if (row.mime === "image/gif") tags.push("gif");
  return normalizeMediaTags(tags);
}
