import { publicDestinations } from "./public-catalog.js";

export function indexNowCatalog({ settings, games, notes, pages, page, help, website }) {
  const info = settings(), gameList = games(), noteList = notes(), pageList = pages();
  const publicGames = gameList.filter(row => row.enabled !== false).map(({ id, name, description, rules, type, minPlayers, maxPlayers, descriptiveImage, coverImage }) => ({ id, name, description, rules, type, minPlayers, maxPlayers, descriptiveImage, coverImage }));
  const publicNotes = noteList.filter(row => row.status === "published").map(({ id, version, title, summary }) => ({ id, version, title, summary }));
  const branding = { siteName: info.siteName, siteSubtitle: info.siteSubtitle, siteIcon: info.siteIcon, siteIconImage: info.siteIconImage };
  return publicDestinations({ settings: info, games: gameList, notes: noteList, pages: pageList, website: website() }).map(row => {
    let content = { title: row.title, description: row.description, branding };
    if (row.view === "page") { const full = page(row.id); if (full) { const { title, description, format, content: text, html, style, script, presentation } = full; content.page = { title, description, format, text, html, style, script, presentation }; } }
    else if (row.view === "games") content.games = row.id ? publicGames.find(game => game.id === row.id) : publicGames;
    else if (row.view === "patchnotes") {
      content.presentation = row.id ? "release-reader-v2" : "release-archive-v1";
      const full = row.id ? notes(row.id) : null;
      content.notes = row.id ? { version: full?.version, title: full?.title, summary: full?.summary, blocks: full?.blocks?.map(({ type, category, title, content, metadata }) => ({ type, category, title, content, metadata })) } : publicNotes;
    }
    else if (["faq", "guide"].includes(row.view)) content.help = help().entries.filter(entry => entry.kind === row.view);
    else if (row.view === "lobby") { content.games = publicGames; content.presentation = "public-casino-info-v1"; }
    if (row.systemRoute === "/jeux") content.games = publicGames;
    return { ...row, content };
  });
}
