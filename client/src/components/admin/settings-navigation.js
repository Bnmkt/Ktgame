export const SETTINGS_SECTIONS = [
  { id: "identity", group: "Site", title: "Identité et contact", detail: "Nom, accueil, jeu à l'affiche et contact" },
  { id: "branding", group: "Site", title: "Logos et application", detail: "Icône du site, favicon et PWA" },
  { id: "theme", group: "Site", title: "Thèmes et apparence", detail: "Couleurs, surfaces et image de fond" },
  { id: "notice", group: "Site", title: "Annonce", detail: "Message affiché dans le casino" },
  { id: "access", group: "Accès et protection", title: "Connexion et inscriptions", detail: "Invités, Discord et validation email" },
  { id: "editing", group: "Accès et protection", title: "Permissions d'édition", detail: "Limites de duplication" },
  { id: "moderation", group: "Accès et protection", title: "Restrictions", detail: "Actions bloquées par les softbans" },
  { id: "economy", group: "Jeu et progression", title: "Économie", detail: "Jetons initiaux et mises" },
  { id: "bonus", group: "Jeu et progression", title: "Bonus quotidiens", detail: "Paliers, plafonds et simulation" },
  { id: "progression", group: "Jeu et progression", title: "XP et titres", detail: "Formule, niveaux et récompenses" },
  { id: "pacing", group: "Jeu et progression", title: "Rythme des parties", detail: "IA et temporisations des manches" },
  { id: "maintenance", group: "Exploitation", title: "Maintenance", detail: "Réinitialisation des données de jeu" }
];

export const matchingSettings = (search = "") => {
  const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const query = normalize(search.trim());
  return SETTINGS_SECTIONS.filter(row => normalize(`${row.title} ${row.detail} ${row.group}`).includes(query));
};
