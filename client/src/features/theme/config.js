export const THEME_VERSION = 1;
export const THEME_FIELDS = [
  { group: "Couleurs", key: "primary", label: "Couleur principale", value: "#e8c777" },
  { group: "Couleurs", key: "secondary", label: "Couleur secondaire", value: "#69d5aa" },
  { group: "Couleurs", key: "link", label: "Liens", value: "#7dc9ed" },
  { group: "Couleurs", key: "success", label: "Confirmation", value: "#69d8a7" },
  { group: "Couleurs", key: "danger", label: "Erreur et suppression", value: "#ff8b95" },
  { group: "Surfaces", key: "page", label: "Fond de page", value: "#07080a" },
  { group: "Surfaces", key: "surface", label: "Panneaux", value: "#101718" },
  { group: "Surfaces", key: "raised", label: "Surfaces secondaires", value: "#1b2425" },
  { group: "Surfaces", key: "header", label: "Navigation", value: "#101514" },
  { group: "Surfaces", key: "card", label: "Cartes de contenu", value: "#11191a" },
  { group: "Textes", key: "text", label: "Texte principal", value: "#f8ecd2" },
  { group: "Textes", key: "muted", label: "Texte secondaire", value: "#b8ae99" },
  { group: "Composants", key: "border", label: "Bordures", value: "#514b38" },
  { group: "Composants", key: "buttonTop", label: "Bouton : haut", value: "#c99a38" },
  { group: "Composants", key: "buttonBottom", label: "Bouton : bas", value: "#8b5d17" },
  { group: "Composants", key: "buttonText", label: "Bouton : texte", value: "#170f04" },
  { group: "Composants", key: "input", label: "Champs : fond", value: "#fffaf0" },
  { group: "Composants", key: "inputText", label: "Champs : texte", value: "#171b20" },
  { group: "Composants", key: "radius", label: "Arrondi des cartes", value: 8, min: 0, max: 8, unit: "px" },
  { group: "Composants", key: "buttonRadius", label: "Arrondi des boutons", value: 8, min: 0, max: 8, unit: "px" },
  { group: "Composants", key: "borderWidth", label: "Épaisseur des bordures", value: 1, min: 0, max: 3, unit: "px" },
  { group: "Image de fond", key: "imageOpacity", label: "Opacité de l'image", value: 0.2, min: 0, max: 1, step: 0.05 },
  { group: "Lisibilité", key: "contentOpacity", label: "Opacité du voile", value: 0.94, min: 0, max: 1, step: 0.01, percent: true },
  { group: "Lisibilité", key: "contentBlur", label: "Flou du décor intérieur", value: 0, min: 0, max: 24, unit: "px" },
  { group: "Ombre du contenu", key: "contentShadowColor", label: "Couleur de l'ombre", value: "#000000" },
  { group: "Ombre du contenu", key: "contentShadowOpacity", label: "Opacité de l'ombre", value: 0, min: 0, max: 1, step: 0.01, percent: true },
  { group: "Ombre du contenu", key: "contentShadowX", label: "Décalage horizontal", value: 0, min: -64, max: 64, unit: "px" },
  { group: "Ombre du contenu", key: "contentShadowY", label: "Décalage vertical", value: 8, min: -64, max: 64, unit: "px" },
  { group: "Ombre du contenu", key: "contentShadowBlur", label: "Diffusion de l'ombre", value: 32, min: 0, max: 96, unit: "px" },
  { group: "Ombre du contenu", key: "contentShadowSpread", label: "Étendue de l'ombre", value: 0, min: -32, max: 64, unit: "px" }
];
export const DEFAULT_TOKENS = Object.fromEntries(THEME_FIELDS.map(field => [field.key, field.value]));
export const DEFAULT_THEME = { id: "ktga-default", name: "KTGA original", tokens: DEFAULT_TOKENS, backgroundImage: "" };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const themeImageAllowed = value => value === "" || typeof value === "string" && /^\/api\/media\/[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/.test(value);

export function validateTheme(value) {
  if (!object(value) || typeof value.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value.id) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 80 || !object(value.tokens)) throw new Error("Theme invalide.");
  const tokens = {};
  for (const field of THEME_FIELDS) {
    const input = Object.hasOwn(value.tokens, field.key) ? value.tokens[field.key] : field.value;
    if (typeof field.value === "string") {
      if (typeof input !== "string" || !/^#[0-9a-f]{6}$/i.test(input)) throw new Error(`Couleur invalide : ${field.label}.`);
      tokens[field.key] = input.toLowerCase();
    } else {
      if (typeof input !== "number" || !Number.isFinite(input) || input < field.min || input > field.max) throw new Error(`Valeur invalide : ${field.label}.`);
      tokens[field.key] = Math.round(input * 100) / 100;
    }
  }
  const backgroundImage = value.backgroundImage ?? "";
  if (!themeImageAllowed(backgroundImage)) throw new Error("Utilise une image de la mediatheque pour le fond.");
  return { id: value.id, name: value.name.trim(), tokens, backgroundImage };
}

export function normalizeTheme(value) {
  try { return validateTheme(value); } catch { return structuredClone(DEFAULT_THEME); }
}

export function themeVariables(value, resolveImage = image => image) {
  const theme = normalizeTheme(value);
  const variables = Object.fromEntries(THEME_FIELDS.map(field => [`--site-${field.key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, `${theme.tokens[field.key]}${field.unit || ""}`]));
  variables["--site-image"] = theme.backgroundImage ? `url("${resolveImage(theme.backgroundImage)}")` : "none";
  variables["--site-content-backdrop"] = theme.tokens.contentBlur > 0 ? `blur(${theme.tokens.contentBlur}px)` : "none";
  return variables;
}

export function importTheme(text) {
  if (typeof text !== "string" || text.length > 50000) throw new Error("Fichier de thème trop volumineux.");
  const data = JSON.parse(text);
  if (data.version !== THEME_VERSION) throw new Error("Version de theme non prise en charge.");
  return validateTheme(data.theme);
}

export function contrastRatio(first, second) {
  const luminance = color => {
    const rgb = color.match(/[a-f0-9]{2}/gi).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
