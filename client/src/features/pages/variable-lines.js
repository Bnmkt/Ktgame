const reserved = new Set(["content", "title", "slug", "description", "constructor", "prototype", "__proto__"]);

export function variableLines(fields) {
  return fields.map(field => {
    const value = field.defaultValue ?? "";
    const encoded = typeof value === "string" && (/\r|\n|^\s|\s$|^"/.test(value)) ? JSON.stringify(value) : String(value);
    return `{${field.key}} : ${encoded}`;
  }).join("\n");
}

export function applyVariableLines(source, fields = []) {
  const updates = new Map(), existing = new Map(fields.map(field => [field.key, field]));
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*\{([a-z][a-z0-9_]{0,39})\}\s*:\s*(.*)$/);
    if (!match || reserved.has(match[1])) throw new Error(`Ligne ${index + 1} : utilise {nom_variable} : valeur, avec un identifiant unique en minuscules.`);
    const [, key, raw] = match;
    if (updates.has(key)) throw new Error(`Ligne ${index + 1} : la variable « ${key} » apparaît plusieurs fois.`);
    let value = raw.trim();
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new Error(`Ligne ${index + 1} : texte entre guillemets invalide.`); }
      if (typeof value !== "string") throw new Error(`Ligne ${index + 1} : une valeur texte est attendue.`);
    }
    const previous = existing.get(key);
    if (previous?.type === "number" && value !== "") {
      value = Number(value);
      if (!Number.isFinite(value) || Math.abs(value) > 1e9) throw new Error(`Ligne ${index + 1} : nombre invalide.`);
    }
    if (previous?.type === "boolean" && value !== "") {
      if (/^(true|oui|1)$/i.test(value)) value = true;
      else if (/^(false|non|0)$/i.test(value)) value = false;
      else throw new Error(`Ligne ${index + 1} : indique true ou false.`);
    }
    if (typeof value === "string" && value.length > (previous?.type === "textarea" ? 20000 : 4000)) throw new Error(`Ligne ${index + 1} : valeur trop longue.`);
    updates.set(key, previous ? { ...previous, defaultValue: value } : { key, label: key.replaceAll("_", " "), type: "text", defaultValue: value, help: "", required: false, options: [] });
  }
  const result = fields.map(field => updates.get(field.key) ?? field);
  for (const [key, field] of updates) if (!existing.has(key)) result.push(field);
  if (result.length > 128) throw new Error("Un modèle peut contenir jusqu’à 128 variables.");
  return result;
}
