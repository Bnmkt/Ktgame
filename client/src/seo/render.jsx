import { renderToString } from "react-dom/server";
import { Auth } from "../pages/AuthPage.jsx";
import { PublicGamesOverview, PublicGamesPage } from "../pages/PublicGamesPage.jsx";
import { HelpPage } from "../components/help/HelpContent.jsx";
import { PatchnotesPage } from "../pages/PatchnotesPage.jsx";
import { LegalPage } from "../privacy/LegalPage.jsx";
import { appPath } from "../navigation/routes.js";
import { legalLinks } from "../privacy/Privacy.jsx";

export function renderPublicPage(data) {
  const { meta, settings, games, help, catalog, note } = data;
  const onBack = undefined;
  let page;
  if (meta.view === "lobby") page = <><Auth settings={settings} onAuth={() => {}} /><PublicGamesOverview games={games} siteName={settings.siteName} compact /></>;
  else if (meta.view === "games") page = <PublicGamesPage games={games} id={meta.id} siteName={settings.siteName} />;
  else if (["faq", "guide"].includes(meta.view)) page = <HelpPage mode={meta.view} siteName={settings.siteName} onBack={onBack} initialDocument={help} />;
  else if (meta.view === "patchnotes") page = <PatchnotesPage siteName={settings.siteName} initialCatalog={catalog} initialNote={note} initialVersion={note?.version || meta.id} />;
  else if (legalLinks[meta.view]) page = <LegalPage view={meta.view} siteName={settings.siteName} supportEmail={settings.supportEmail} />;
  else page = <main className="app-shell"><section className="panel"><h1>{meta.status === 404 ? "Page introuvable" : "Accès au site"}</h1><p>{meta.status === 404 ? "Cette page n’existe pas ou n’est pas disponible publiquement." : "Connectez-vous pour accéder à cet espace."}</p><a href={appPath("lobby")}>Retour au casino</a></section></main>;
  return renderToString(<>{page}<footer className="legal-footer"><nav aria-label="Informations et navigation"><a href={appPath("games")}>Jeux et règles</a><a href={appPath("faq")}>FAQ</a><a href={appPath("guide")}>Guide du joueur</a><a href={appPath("patchnotes")}>Patchnotes</a><a href={appPath("status")}>État des services</a>{Object.entries(legalLinks).map(([view, label]) => <a key={view} href={appPath(view)}>{label}</a>)}</nav><small>Jeux gratuits · Jetons virtuels sans valeur monétaire</small></footer></>);
}
