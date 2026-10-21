import { renderToStaticMarkup } from "react-dom/server";
import { legalDocuments } from "../privacy/LegalPage.jsx";
import { legalLinks } from "../privacy/Privacy.jsx";
import { gameRules } from "../config/site.js";
import { appPath } from "../navigation/routes.js";

const styles = `
.cp-document-intro { font-size:18px; line-height:1.7; margin:0 0 28px; }
.cp-document-grid { display:grid; grid-template-columns:220px minmax(0,1fr); gap:32px; align-items:start; }
.cp-document-outline { position:sticky; top:110px; display:grid; gap:12px; font-size:13px; }
.cp-document-body { min-width:0; }
.cp-document-body section { padding:0 0 24px; margin:0 0 24px; border-bottom:1px solid var(--site-border); scroll-margin-top:110px; }
.cp-document-body h2 { margin-top:0; font-size:22px; }
.cp-game-intro { display:grid; grid-template-columns:minmax(180px,0.8fr) minmax(0,1.2fr); gap:28px; align-items:center; margin-bottom:32px; }
.cp-game-intro img { display:block; width:100%; max-height:300px; object-fit:contain; }
.cp-game-facts { display:flex; flex-wrap:wrap; gap:20px; }
.cp-game-facts dt { color:var(--site-muted); font-size:12px; }
.cp-game-facts dd { margin:5px 0 0; font-weight:700; }
.cp-game-play { display:inline-flex; padding:10px 18px; border:1px solid var(--site-primary); border-radius:5px; font-weight:700; }
@media(max-width:760px) { .cp-document-grid,.cp-game-intro { grid-template-columns:minmax(0,1fr); } .cp-document-outline { position:static; display:flex; flex-wrap:wrap; padding-bottom:18px; border-bottom:1px solid var(--site-border); } }
`;
const field = (key, label, defaultValue = "", type = "text") => ({ key, label, type, defaultValue, required: false });
const outline = sections => <nav className="cp-document-outline" aria-label="Sommaire">{sections.map(([id, title]) => <a key={id} href={`#cp-${id}`}>{title}</a>)}</nav>;

export function systemPageSeeds({ settings, games }) {
  const common = { site_name: settings.siteName || "KTGA.ME", contact_email: settings.supportEmail || "contact@netdis.org" };
  const variables = [field("site_name", "Nom du site", common.site_name), field("contact_email", "Email de contact", common.contact_email)];
  const templates = [
    { id: "system-information-layout", name: "KTGA · Informations", format: "html", layout: "{content}", variables, style: styles },
    { id: "system-game-layout", name: "KTGA · Règles de jeu", format: "html", layout: "{content}", variables: [...variables, field("game_name", "Jeu"), field("game_description", "Description"), field("game_players", "Joueurs"), field("game_type", "Type"), field("game_image", "Image", "/favicon.svg", "image")], style: styles }
  ];
  const routes = { terms: "/conditions", legal: "/mentions-legales", privacy: "/confidentialite", cookies: "/cookies", parents: "/parents" };
  const pages = Object.entries(legalDocuments("{contact_email}", text => text)).map(([view, document]) => ({
    id: `system-page-${view}`, systemRoute: routes[view], slug: `ktga-${view}`, title: legalLinks[view], description: document.intro,
    format: "html", templateId: "system-information-layout", variableValues: {}, indexable: true,
    content: renderToStaticMarkup(<><p className="cp-document-intro">{document.intro}</p><div className="cp-document-grid">{outline(document.sections)}<article className="cp-document-body">{document.sections.map(([id, title, body]) => <section id={`cp-${id}`} key={id}><h2>{title}</h2>{body}</section>)}</article></div></>)
  }));
  pages.push({ id: "system-page-games", systemRoute: "/jeux", slug: "ktga-jeux", title: "Jeux gratuits en ligne", description: "Découvrez les jeux de cartes et de dés gratuits de KTGA, leurs règles et leurs variantes.", format: "html", templateId: "system-information-layout", variableValues: {}, indexable: true, content: "<p>Découvrez les jeux gratuits de {site_name}, leurs règles et leurs variantes : jeux de dés, jeux de cartes et parties entre amis.</p>" });
  for (const game of games) {
    const rules = gameRules[game.id], sections = (rules?.sections ?? []).map((section, index) => [`regles-${index}`, section.title, section.items]);
    pages.push({
      id: `system-page-game-${game.id}`, systemRoute: `/jeux/${game.id}`, slug: `ktga-regles-${game.id}`, title: game.name, description: game.description || rules?.goal || game.name,
      format: "html", templateId: "system-game-layout", variableValues: {}, indexable: true,
      content: renderToStaticMarkup(<><div className="cp-game-intro"><img src="{game_image}" alt="{game_name}"/><div><h2>{rules?.goal || game.description}</h2><p>{"{game_description}"}</p><dl className="cp-game-facts"><div><dt>Joueurs</dt><dd>{"{game_players}"}</dd></div><div><dt>Type</dt><dd>{"{game_type}"}</dd></div><div><dt>Accès</dt><dd>Gratuit</dd></div></dl><a className="cp-game-play" href={`${appPath("lobby")}#connexion`}>Jouer sur {"{site_name}"}</a><p>Les jetons n’ont aucune valeur monétaire. Aucun achat ni retrait d’argent réel.</p></div></div><div className="cp-document-grid">{outline(sections)}<article className="cp-document-body">{sections.map(([id, title, items]) => <section id={`cp-${id}`} key={id}><h2>{title}</h2><ul>{items.map((text, index) => <li key={index}>{text}</li>)}</ul></section>)}</article></div><p><a href={appPath("games")}>Tous les jeux</a></p></>)
    });
  }
  return { templates, pages };
}
