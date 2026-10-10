const pages = {
  lobby: ["Jeux de cartes et de dés gratuits en ligne", "Jouez gratuitement aux jeux de cartes et de dés sur KTGA.ME : Yahtzee, 421, belote, blackjack et bien plus. Des jetons virtuels, sans valeur monétaire."],
  games: ["Jeux et règles", "Découvrez les jeux gratuits de KTGA.ME, leurs règles et leurs variantes : jeux de dés, jeux de cartes et parties entre amis."],
  faq: ["Questions fréquentes", "Les réponses à vos questions sur KTGA.ME : inscription, jeux gratuits, progression, maîtrises, parties classées et sécurité du compte."],
  guide: ["Guide du joueur", "Découvrez comment jouer sur KTGA.ME : créer une table, rejoindre ses amis, progresser dans les jeux et participer aux parties classées."],
  patchnotes: ["Patchnotes et mises à jour", "Découvrez les nouveautés, améliorations et corrections des jeux et fonctionnalités de KTGA.ME."],
  terms: ["Conditions d’utilisation", "Les conditions d’utilisation des jeux gratuits de KTGA.ME et les règles de participation."],
  legal: ["Mentions légales", "Informations sur l’éditeur et l’hébergement de KTGA.ME, ainsi que les coordonnées de contact."],
  privacy: ["Confidentialité", "Découvrez comment KTGA.ME protège vos données personnelles et comment exercer vos droits."],
  cookies: ["Cookies et préférences", "Informations sur les cookies nécessaires au fonctionnement de KTGA.ME et vos préférences."],
  parents: ["Informations pour les parents", "Découvrez les protections et le parcours parental prévus pour les jeunes joueurs de KTGA.ME."]
};
const paths = { lobby: "", games: "jeux", faq: "faq", guide: "guide", patchnotes: "patchnotes", terms: "conditions", legal: "mentions-legales", privacy: "confidentialite", cookies: "cookies", parents: "parents" };
const privatePaths = { profil: "profile", shop: "shop", classements: "leaderboard", tribunal: "tribunal", admin: "admin", status: "status", bugs: "bugs", table: "room", observer: "spectator", evenement: "event" };

export function pageMetadata({ pathname = "/", search = "", basePath = "", siteName = "KTGA.ME", games = [], notes = [] } = {}) {
  const base = basePath.replace(/\/$/, "");
  const relative = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  const parts = relative.split("/").filter(Boolean);
  const query = new URLSearchParams(search);
  let view = parts.length === 0 ? "lobby" : Object.keys(paths).find((key) => paths[key] === parts[0]);
  let status = 200;
  let canonical = parts.length ? `/${parts.join("/")}` : "/";
  let id = "";
  if (!view && parts.length === 1 && privatePaths[parts[0]] && !["table", "observer", "evenement"].includes(parts[0])) view = privatePaths[parts[0]];
  if (parts.length === 2 && ["table", "observer", "evenement", "bugs"].includes(parts[0]) && /^[a-zA-Z0-9_-]+$/.test(parts[1])) { view = privatePaths[parts[0]]; id = parts[1]; }
  if (parts.length > 1 && !(["games", "patchnotes", "room", "spectator", "event", "bugs"].includes(view) && parts.length === 2)) view = undefined;
  if (view === "lobby" && (query.has("room") || query.has("event"))) view = query.has("room") ? "room" : "event";
  if (view === "games") id = parts[1] || "";
  if (view === "patchnotes") id = parts[1] || query.get("version") || "";
  let [title, description] = pages[view] || ["Accès au site", "Connectez-vous à KTGA.ME pour accéder à cet espace."];
  const game = id && view === "games" ? games.find((entry) => entry.id === id && entry.enabled !== false) : null;
  const note = id && view === "patchnotes" ? notes.find((entry) => entry.version === id && entry.status === "published") : null;
  if (game) { title = `${game.name} : règles et jeu gratuit`; description = `${game.description || `Découvrez ${game.name} sur ${siteName}.`} Retrouvez les règles et jouez gratuitement avec des jetons virtuels sans valeur monétaire.`; }
  if (note) { title = `Patchnote ${note.version} - ${note.title}`; description = String(note.summary || `Les nouveautés de la version ${note.version} de ${siteName}.`).replace(/[#*`\[\]]/g, " "); canonical = `/patchnotes?version=${encodeURIComponent(note.version)}`; }
  if (!view || (view === "games" && id && !game) || (view === "patchnotes" && id && !note)) { status = 404; view = "not-found"; title = "Page introuvable"; description = "Cette page n’existe pas ou n’est pas disponible publiquement."; }
  const sensitive = [...query.keys()].some((key) => /token|password|verify|parental|receipt|secret|challenge|code/i.test(key));
  const indexable = Boolean(pages[view]) && status === 200 && !sensitive;
  return { view, id, status, indexable, title: `${siteName} - ${title}`, description: description.replace(/\s+/g, " ").trim().slice(0, 220), canonicalPath: `${base}${canonical}`, robots: indexable ? "index, follow" : "noindex, follow" };
}

export function readPublicPageData() {
  try { return JSON.parse(document.getElementById("ktga-page-data")?.textContent || "null"); } catch { return null; }
}

export function applyPageMetadata(meta, origin = "https://www.ktga.me") {
  document.title = meta.title;
  const url = new URL(meta.canonicalPath, origin).href;
  const values = { description: meta.description, robots: meta.robots, "og:title": meta.title, "og:description": meta.description, "og:url": url, "og:type": "website", "og:locale": "fr_BE", "og:image": `${origin}/ktga-preview.png`, "twitter:card": "summary_large_image" };
  for (const [name, content] of Object.entries(values)) {
    const attribute = name.startsWith("og:") ? "property" : "name";
    let element = document.head.querySelector(`meta[${attribute}="${name}"]`);
    if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, name); document.head.append(element); }
    element.content = content;
  }
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.append(canonical); }
  canonical.href = url;
}
