export const mascotSources = {
  lucky: {
    welcome: "01_Lucky/Emotions_Actions/hibou_lucky_joyeux_et_accueillant.png",
    point: "01_Lucky/Emotions_Actions/lucky_la_chouette_montre_le_chemin.png",
    dice: "01_Lucky/Emotions_Actions/hibou_joueur_lançant_les_dés.png",
    cards: "01_Lucky/Emotions_Actions/hibou_vert_mélangeant_des_cartes.png",
    victory: "01_Lucky/Emotions_Actions/hibou_lucky_en_pose_triomphante.png",
    think: "01_Lucky/Emotions_Actions/hibou_vert_en_pleine_réflexion_re_glancing_at.png",
    detective: "01_Lucky/Emotions_Actions/hibou_détective_lucky_à_la_loupe.png"
  },
  midnight: {
    welcome: "02_Midnight/Base_Emotions_Poses/renarde_midnight_enjouée_aux_bras_ouverts.png",
    dice: "02_Midnight/Actions/midnight_joue_aux_dés_magiques.png",
    victory: "02_Midnight/Base_Emotions_Poses/renarde_bleue_victoire_éclatante.png"
  },
  jacky: {
    welcome: "03_Jacky/Base_Emotions/lapin_mascotte_accueillant_en_lunettes_de_soleil.png",
    cards: "03_Jacky/Actions/lapin_croupier_distribuant_les_cartes.png",
    victory: "03_Jacky/Base_Emotions/lapin_mascotte_bondissant_en_mode_victoire.png"
  },
  nixie: {
    welcome: "04_Nixie/Emotions/axolotl_rose_au_sourire_éclatant.png",
    victory: "04_Nixie/Emotions/axolotl_rose_corail_en_plein_saut.png"
  },
  milo: {
    welcome: "05_Milo/emotions/neutral_joy.png",
    point: "05_Milo/emotions/pointing left.png",
    victory: "05_Milo/emotions/victorious.png"
  }
};

export const mascotScenes = {
  casino: "99_Shared_Banners/Group_Assets/jacky_au_cœur_du_casino_ktga.png",
  terrace: "05_Milo/Membercard_Profile/terrasse_casino_au_bord_de_l_eau_étoilée.png"
};

export function mascotAsset(character = "lucky", pose = "welcome", width = 360) {
  const key = Object.hasOwn(mascotSources, character) ? character : "lucky";
  const selectedPose = Object.hasOwn(mascotSources[key], pose) ? pose : "welcome";
  return `mascotte_assets/ui/${key}-${selectedPose}-${width >= 720 ? 720 : 360}.webp`;
}

export function gameMascot(gameId, type) {
  if (gameId === "midnight-dice") return { character: "midnight", pose: "dice" };
  const cards = type === "cards" || ["belote", "texas-holdem", "blackjack", "bataille", "president", "golf-solitaire", "accordion", "velvet-ruse"].includes(gameId);
  return cards ? { character: "jacky", pose: "cards" } : { character: "lucky", pose: "dice" };
}
