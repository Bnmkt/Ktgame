export const softBanOptions = [
  ["rooms:create", "Tables", "Créer et gérer ses tables"],
  ["rooms:join", "Tables", "Rejoindre les tables des autres joueurs"],
  ["rooms:spectate", "Tables", "Observer une partie"],
  ["ranked", "Tables", "Participer au classé"],
  ["games", "Jeux", "Accéder à tous les jeux"],
  ["community-events", "Communauté", "Participer aux événements communautaires"],
  ["chat:global", "Communauté", "Écrire dans le chat global"],
  ["chat:table", "Communauté", "Écrire dans le chat de table"],
  ["chat:private", "Communauté", "Envoyer des messages privés"],
  ["friends", "Communauté", "Ajouter et accepter des amis"],
  ["invitations", "Communauté", "Envoyer et accepter des invitations de table"],
  ["tribunal:vote", "Communauté", "Voter au tribunal"],
  ["patchnotes:react", "Communauté", "Réagir aux patchnotes"],
  ["shop", "Économie et profil", "Acheter des objets et des packs"],
  ["daily-bonus", "Économie et profil", "Récupérer le bonus quotidien"],
  ["profile:edit", "Économie et profil", "Modifier son identité publique et sa bio"],
  ["cosmetics:equip", "Économie et profil", "Changer ses cosmétiques, titres et insignes"],
  ["editor:create", "Outils d’édition", "Créer du contenu"],
  ["editor:edit", "Outils d’édition", "Modifier du contenu"],
  ["editor:duplicate", "Outils d’édition", "Dupliquer du contenu"],
  ["editor:delete", "Outils d’édition", "Supprimer du contenu"],
  ["editor:publish", "Outils d’édition", "Publier et programmer du contenu"],
  ["editor:upload", "Outils d’édition", "Importer des images"],
];

export const defaultSoftBanRestrictions = ["community-events", "rooms:join", "rooms:spectate", "ranked", "friends", "invitations", "chat:global", "chat:table", "chat:private", "tribunal:vote"];
const known = new Set(softBanOptions.map(([id]) => id));
export function normalizeSoftBanRestrictions(value) {
  return [...new Set((Array.isArray(value) ? value : defaultSoftBanRestrictions).filter(id => known.has(id) || /^game:[a-z0-9-]{2,60}$/.test(id)))];
}

export function validSoftBanRestrictions(value, games) {
  return Array.isArray(value) && value.length <= 200 && value.every(id => known.has(id) || games.some(game => id === `game:${game.id}`));
}

export function softBanRestricts(feature, restrictions) {
  const ids = normalizeSoftBanRestrictions(restrictions);
  return ids.includes(feature) || feature.startsWith("game:") && ids.includes("games");
}

export function softBanLimited(user, feature, now = Date.now()) {
  const moderation = user?.moderation;
  return moderation?.type === "soft" && (!moderation.endsAt || Date.parse(moderation.endsAt) > now) && softBanRestricts(feature, moderation.restrictions);
}
