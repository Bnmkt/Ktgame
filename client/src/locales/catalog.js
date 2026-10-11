import en from "./en.json" with { type: "json" };

export const languages = [{ code: "fr", name: "Français", region: "fr-BE" }, { code: "en", name: "English", region: "en-GB" }];
export const catalogs = { fr: {}, en };
export const validLocale = (value) => value === "fr" || value === "en";
export const placeholders = (value) => [...new Set(String(value).match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? [])].sort();

export function translate(locale, overrides, key, values = {}, fallback = {}) {
  if (typeof key !== "string") return key;
  const source = key.includes("::") ? key.slice(key.indexOf("::") + 2) : key;
  const own = (dictionary, name) => dictionary && Object.hasOwn(dictionary, name) ? dictionary[name] : undefined;
  const text = overrides && Object.hasOwn(overrides, key)
    ? overrides[key] || own(fallback, key) || source
    : own(catalogs[locale], key) || own(catalogs[locale], source) || own(fallback, key) || source;
  if (typeof text !== "string") return text;
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name] ?? "") : match);
}
