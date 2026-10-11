import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const validLocale = (value) => value === "fr" || value === "en";
const markers = (value) => [...new Set(value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? [])].sort().join(",");
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function createLocaleStore({ directory, sourceDirectory = new URL("../../../client/src/locales/", import.meta.url) }) {
  const defaults = {}, overrides = {}, snapshots = {};
  for (const language of ["fr", "en"]) {
    defaults[language] = JSON.parse(await fs.readFile(new URL(`${language}.json`, sourceDirectory), "utf8"));
    try { overrides[language] = JSON.parse(await fs.readFile(path.join(directory, `${language}.json`), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; overrides[language] = {}; }
  }
  const sources = { ...defaults.fr };
  const original = (key) => key.includes("::") ? key.slice(key.indexOf("::") + 2) : key;
  function validate(messages, allowNew = false) {
    if (!messages || typeof messages !== "object" || Array.isArray(messages)) throw new Error("Le fichier doit contenir un objet de traductions.");
    if (Object.keys(messages).length > 10000) throw new Error("Le fichier contient trop de textes.");
    for (const [key, value] of Object.entries(messages)) {
      if (!key.trim() || key.length > 12000 || ["__proto__", "prototype", "constructor"].includes(key) || !allowNew && !Object.hasOwn(sources, key)) throw new Error(`Texte inconnu : ${key.slice(0, 80)}`);
      if (value === null || value === "") continue;
      if (typeof value !== "string" || value.length > 12000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("Une traduction doit être un texte valide de 12 000 caractères maximum.");
      if (markers(value) !== markers(Object.hasOwn(sources, key) ? sources[key] : original(key))) throw new Error(`Conserve les variables du texte : ${key.slice(0, 80)}`);
    }
  }
  function refresh(language) {
    const messages = { ...defaults[language], ...overrides[language] };
    snapshots[language] = { locale: language, messages, revision: digest(messages) };
  }
  for (const language of ["fr", "en"]) {
    validate(overrides[language], true);
    for (const key of Object.keys(overrides[language])) if (!Object.hasOwn(sources, key)) sources[key] = original(key);
    refresh(language);
  }
  let queue = Promise.resolve();
  const read = (language) => { if (!validLocale(language)) throw new Error("Langue non prise en charge."); return snapshots[language]; };
  function save(language, { messages, revision, replace = false, allowNew = false }) {
    const operation = queue.then(async () => {
      const previous = read(language);
      if (revision !== previous.revision) { const error = new Error("Les traductions ont changé. Recharge avant d’enregistrer."); error.status = 409; throw error; }
      validate(messages, allowNew === true);
      const next = replace ? {} : { ...overrides[language] };
      for (const [key, value] of Object.entries(messages)) {
        if (value === null || value === defaults[language][key]) delete next[key];
        else next[key] = value;
      }
      validate(next, true);
      const encoded = JSON.stringify(next, null, 2) + "\n";
      if (Buffer.byteLength(encoded) > 2 * 1024 * 1024) throw new Error("Le fichier dépasse 2 Mo.");
      await fs.mkdir(directory, { recursive: true, mode: 0o750 });
      const filename = path.join(directory, `${language}.json`), temporary = `${filename}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, encoded, { mode: 0o640 }); await fs.rename(temporary, filename); }
      finally { await fs.rm(temporary, { force: true }); }
      for (const key of Object.keys(next)) if (!Object.hasOwn(sources, key)) sources[key] = original(key);
      overrides[language] = next; refresh(language);
      return read(language);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  const frenchDefaults = Object.fromEntries(Object.entries(defaults.fr).filter(([key, value]) => value !== (key.includes("::") ? key.slice(key.indexOf("::") + 2) : key)));
  return { read, save, sources, publicRead: (language) => ({ locale: language, revision: digest([read(language).revision, read("fr").revision]), messages: language === "fr" ? { ...frenchDefaults, ...overrides.fr } : overrides.en, fallback: language === "en" ? { ...frenchDefaults, ...overrides.fr } : {} }) };
}

export function registerLocaleRoutes({ app, auth, requireBackOffice, store }) {
  const language = (req, res, next) => validLocale(req.params.locale) ? next() : res.status(404).json({ error: "Langue non prise en charge." });
  app.get("/api/locales/:locale", language, (req, res) => {
    const result = store.publicRead(req.params.locale), etag = `"${result.revision}"`;
    res.set("Cache-Control", "public, max-age=0, must-revalidate").set("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.json(result);
  });
  app.get("/api/admin/locales/:locale", auth, requireBackOffice, language, (req, res) => res.set("Cache-Control", "no-store").json({ ...store.read(req.params.locale), sources: store.sources }));
  app.patch("/api/admin/locales/:locale", auth, requireBackOffice, language, async (req, res) => {
    try { res.json({ ...await store.save(req.params.locale, req.body), sources: store.sources }); }
    catch (error) { res.status(error.status ?? 400).json({ error: error.message }); }
  });
}
