export const CAMPAIGN_FIELDS = ["source", "medium", "campaign", "content"];

export function campaignUrl(input, website) {
  const base = new URL(website);
  const url = new URL(input.destination || "/", base);
  if (!/^https?:$/.test(url.protocol) || url.origin !== base.origin || url.username || url.password) throw new Error("Choisis une page publique de ce site.");
  for (const key of [...url.searchParams.keys()]) if (key !== "version") throw new Error("Seul le paramètre public de version est autorisé dans la destination.");
  if (url.hash) throw new Error("Retire le fragment de la destination.");
  for (const field of CAMPAIGN_FIELDS) {
    const value = String(input[field] ?? "").trim();
    if (value && !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error("Les paramètres de campagne utilisent des lettres sans accent, des chiffres, des tirets ou des underscores (80 maximum).");
    if (value) url.searchParams.set(`utm_${field}`, value);
  }
  return url.href;
}

export function suggestedKit(site, locale = "fr") {
  const english = locale === "en";
  return {
    name: english ? "Main press kit" : "Kit presse principal", locale,
    title: site.siteName || "KTGA.ME",
    tagline: english ? "Cards, dice and friends." : "Des cartes, des dés et des amis.",
    shortDescription: english ? "Free multiplayer card and dice games in your browser, with virtual chips of no monetary value." : "Des jeux de cartes et de dés multijoueurs gratuits, dans le navigateur, avec des jetons virtuels sans valeur monétaire.",
    longDescription: english ? "Play familiar card and dice games with friends on KTGA.ME. Create a table, share its link and play directly in your browser." : "KTGA.ME réunit des jeux de cartes et de dés pour jouer entre amis. Crée une table, partage son lien et retrouve les autres joueurs directement dans ton navigateur.",
    highlights: english ? "Free to play\nMultiplayer in your browser\nVirtual chips without monetary value\nGame progression and ranked play" : "Gratuit à jouer\nMultijoueur dans le navigateur\nJetons virtuels sans valeur monétaire\nProgression par jeu et parties classées",
    contactName: "", contactEmail: site.supportEmail || "", usageRights: "", assets: []
  };
}
