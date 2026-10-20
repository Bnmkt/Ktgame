import { pageMetadata } from "../../../client/src/seo/metadata.js";

export function publicDestinations({ settings, games, notes, pages, website }) {
  const origin = new URL(website).origin, basePath = new URL(website).pathname.replace(/\/$/, "");
  const publishedNotes = notes.filter(note => note.status === "published");
  const sources = { siteName: settings.siteName, games, notes: publishedNotes, customPages: pages, basePath };
  const routes = new Map(["/", "/jeux", "/faq", "/guide", "/patchnotes", "/conditions", "/mentions-legales", "/confidentialite", "/cookies", "/parents"].map(route => [route, null]));
  for (const game of games.filter(game => game.enabled !== false)) routes.set(`/jeux/${encodeURIComponent(game.id)}`, game.updatedAt);
  for (const note of publishedNotes) routes.set(`/patchnotes?version=${encodeURIComponent(note.version)}`, note.updatedAt || note.publishedAt);
  for (const page of pages) routes.set(`/pages/${encodeURIComponent(page.slug)}`, page.updatedAt);
  return [...routes].map(([route, updatedAt]) => {
    const parsed = new URL(basePath + route, origin);
    const meta = pageMetadata({ ...sources, pathname: parsed.pathname, search: parsed.search });
    const url = new URL(meta.canonicalPath, origin);
    return { ...meta, url: url.href, path: url.pathname + url.search, updatedAt };
  });
}
