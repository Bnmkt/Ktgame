import { gameImageUrl } from "../presentation.js";

export const midnightFonts = { rounded: '"Trebuchet MS", sans-serif', classic: 'Georgia, serif', sans: 'Arial, sans-serif', condensed: '"Arial Narrow", Arial, sans-serif' };
const zone = (x, y, width, height, fontSize, minFontSize, color) => ({ x, y, width, height, fontSize, minFontSize, color });
export const defaultMidnightCardDesign = {
  frontImage: "/midnight-dice/mandat-front.svg", backImage: "/midnight-dice/mandat-back.svg",
  headingFont: "rounded", bodyFont: "classic", padding: 2,
  sectionLabels: true,
  zones: {
    title: zone(17, 9, 68, 15, 7, 3, "#121b35"),
    tier: zone(23, 27, 25, 8, 4.2, 2.5, "#f0c56f"),
    bonus: zone(53, 27, 25, 8, 4.2, 2.5, "#f0c56f"),
    condition: zone(32, 48, 59, 15, 4.5, 1.6, "#151d35"),
    examples: zone(31, 76, 61, 12, 3.2, 2, "#161e35")
  },
  exampleGap: 4
};

export function normalizeMidnightImage(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || !gameImageUrl(value)) throw new Error("L’image doit utiliser une URL HTTPS ou un chemin absolu (/images/…).");
  return gameImageUrl(value);
}
function number(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Réglage graphique attendu entre ${minimum} et ${maximum}.`);
  return value;
}
export function normalizeMidnightArtwork(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Illustration de mandat invalide.");
  return { image: normalizeMidnightImage(input.image), x: number(input.x, -1, -100, 100), y: number(input.y, 45, -100, 100), scale: number(input.scale, 1, .15, 4), layer: number(input.layer, 2, 0, 10) };
}
export function normalizeMidnightCardDesign(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Présentation des mandats invalide.");
  const result = { frontImage: input.frontImage === "" ? "" : normalizeMidnightImage(input.frontImage ?? defaultMidnightCardDesign.frontImage), backImage: input.backImage === "" ? "" : normalizeMidnightImage(input.backImage ?? defaultMidnightCardDesign.backImage) };
  result.sectionLabels = input.sectionLabels === undefined ? !result.frontImage || result.frontImage === defaultMidnightCardDesign.frontImage : input.sectionLabels === true;
  for (const field of ["headingFont", "bodyFont"]) {
    result[field] = input[field] ?? defaultMidnightCardDesign[field];
    if (!Object.hasOwn(midnightFonts, result[field])) throw new Error("Police de mandat inconnue.");
  }
  result.padding = number(input.padding, 2, 0, 10); result.exampleGap = number(input.exampleGap, 4, 0, 15);
  result.zones = Object.fromEntries(Object.entries(defaultMidnightCardDesign.zones).map(([id, fallback]) => {
    const source = input.zones?.[id] ?? {}, value = {};
    for (const field of ["x", "y", "width", "height", "fontSize", "minFontSize"]) value[field] = number(source[field], fallback[field], ["x", "y"].includes(field) ? 0 : .5, ["fontSize", "minFontSize"].includes(field) ? 16 : 100);
    if (value.x + value.width > 100 || value.y + value.height > 100 || value.minFontSize > value.fontSize) throw new Error("La zone de texte doit rester dans la carte et respecter sa taille de police minimale.");
    value.color = source.color ?? fallback.color;
    if (typeof value.color !== "string" || !/^#[\da-f]{6}$/i.test(value.color)) throw new Error("Couleur de mandat invalide.");
    return [id, value];
  }));
  return result;
}

// Reuse existing transparent KTGA mascots until the administrator supplies the physical artwork.
export const defaultMidnightCharacters = {
  triple: "/mascotte_assets/02_Midnight/Actions/midnight_la_magie_des_cartes.png",
  balance: "/mascotte_assets/01_Lucky/Emotions_Actions/hibou_vert_mélangeant_des_cartes.png",
  cellar: "/mascotte_assets/03_Jacky/Actions/lapin_magicien_avec_as_de_cœur.png",
  straight: "/mascotte_assets/01_Lucky/Emotions_Actions/hibou_joueur_lançant_les_dés.png",
  summit: "/mascotte_assets/02_Midnight/Actions/midnight_reine_des_jetons_magiques.png",
  even: "/mascotte_assets/02_Midnight/Actions/midnight_joue_aux_dés_magiques.png",
  odd: "/mascotte_assets/01_Lucky/Emotions_Actions/lucky_hibou_victorieux_au_carte_dorée.png",
  "lucky-thirteen": "/mascotte_assets/01_Lucky/Emotions_Actions/lucky_l_hibou_fête_son_jackpot.png"
};
