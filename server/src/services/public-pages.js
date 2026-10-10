import fs from "node:fs";
import path from "node:path";
import { pageMetadata } from "../../../client/src/seo/metadata.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const json = (value) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
const publicSettings = (settings) => Object.fromEntries(["siteName", "siteIcon", "siteSubtitle", "featuredGameId", "registrationsEnabled", "guestAccessEnabled", "supportEmail"].map((key) => [key, settings[key]]));
const publicGames = (games) => games.filter((game) => game.enabled !== false).map(({ id, name, type, minPlayers, maxPlayers, description, descriptiveImage, coverImage }) => ({ id, name, type, minPlayers, maxPlayers, description, descriptiveImage, coverImage }));
const publicNotes = (notes) => notes.filter((note) => note.status === "published").map(({ id, version, versionGroup, title, summary, status, publishedAt, updatedAt }) => ({ id, version, versionGroup, title, summary, status, publishedAt, updatedAt }));

export function createPublicPageService({ template, render, styles = [], settings, games, help, catalog, note, origin = "https://www.ktga.me", basePath = "", now = Date.now }) {
  const canonicalOrigin = new URL(origin).origin;
  let sourceCache;
  const pages = new Map();
  function source() {
    if (!sourceCache || now() >= sourceCache.until) {
      sourceCache = { until: now() + 30000, settings: publicSettings(settings()), games: publicGames(games()), catalog: catalog() };
      sourceCache.catalog = { currentVersion: sourceCache.catalog.currentVersion, notes: publicNotes(sourceCache.catalog.notes) };
      pages.clear();
    }
    return sourceCache;
  }
  function metadata(url) {
    const parsed = new URL(url, canonicalOrigin);
    const data = source();
    return pageMetadata({ pathname: parsed.pathname, search: parsed.search, basePath, siteName: data.settings.siteName, games: data.games, notes: data.catalog.notes });
  }
  function document(url) {
    const meta = metadata(url);
    const cacheKey = `${meta.canonicalPath}:${meta.robots}:${meta.status}`;
    if (meta.status !== 404 && pages.has(cacheKey)) return pages.get(cacheKey);
    const { settings: siteSettings, games: gameList, catalog: releases } = source();
    const data = { meta, settings: siteSettings, games: gameList, catalog: releases };
    if (["faq", "guide"].includes(meta.view)) data.help = help();
    if (meta.view === "patchnotes") {
      const published = note(meta.id || data.catalog.notes[0]?.version);
      data.note = published?.status === "published" ? { ...publicNotes([published])[0], blocks: published.blocks } : null;
    }
    const canonical = canonicalOrigin + meta.canonicalPath;
    const image = canonicalOrigin + basePath + "/ktga-preview.png";
    const structured = meta.indexable ? { "@context": "https://schema.org", "@type": meta.view === "games" && meta.id ? "VideoGame" : meta.view === "lobby" ? "WebSite" : "WebPage", name: meta.view === "lobby" ? data.settings.siteName : meta.title, description: meta.description, url: canonical, inLanguage: "fr-BE", ...(meta.view === "games" && meta.id ? { isAccessibleForFree: true, gamePlatform: "Web browser" } : {}) } : null;
    const head = `<meta name="description" content="${escape(meta.description)}"><meta name="robots" content="${meta.robots}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:type" content="website"><meta property="og:locale" content="fr_BE"><meta property="og:image" content="${escape(image)}"><meta name="twitter:card" content="summary_large_image">${styles.map((href) => `<link rel="stylesheet" href="${escape(basePath + href)}">`).join("")}${structured ? `<script type="application/ld+json">${json(structured)}</script>` : ""}`;
    const html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(meta.title)}</title>`).replace("</head>", `${head}</head>`).replace('<div id="root"></div>', `<div id="root">${render(data)}</div><script type="application/json" id="ktga-page-data">${json(data)}</script>`);
    const result = { html, meta };
    if (meta.status !== 404) { if (pages.size >= 64) pages.delete(pages.keys().next().value); pages.set(cacheKey, result); }
    return result;
  }
  function sitemap() {
    const data = source();
    const entries = ["/", "/jeux", "/faq", "/guide", "/patchnotes", "/conditions", "/mentions-legales", "/confidentialite", "/cookies", "/parents"].map((route) => ({ route }));
    entries.push(...data.games.map((game) => ({ route: `/jeux/${encodeURIComponent(game.id)}` })));
    entries.push(...data.catalog.notes.map((entry) => ({ route: `/patchnotes?version=${encodeURIComponent(entry.version)}`, lastmod: entry.updatedAt || entry.publishedAt })));
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<url><loc>${escape(canonicalOrigin + basePath + entry.route)}</loc>${entry.lastmod && Number.isFinite(Date.parse(entry.lastmod)) ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  }
  return { metadata, document, sitemap, robots: () => `User-agent: *\nAllow: /\n\nSitemap: ${canonicalOrigin}${basePath}/sitemap.xml\n` };
}

export async function registerPublicPages({ app, clientDist, ...sources }) {
  const rendererPath = new URL("../../../client/dist-ssr/render.js", import.meta.url);
  const styleDirectory = new URL("../../../client/dist-ssr/assets/", import.meta.url);
  const { renderPublicPage } = await import(rendererPath.href);
  const styles = fs.readdirSync(styleDirectory).filter((name) => name.endsWith(".css")).map((name) => `/assets/${name}`);
  const service = createPublicPageService({ ...sources, template: fs.readFileSync(path.join(clientDist, "index.html"), "utf8"), render: renderPublicPage, styles });
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send(service.robots()));
  app.get("/sitemap.xml", (_req, res) => res.type("application/xml").send(service.sitemap()));
  app.get("/index.html", (_req, res) => res.redirect(308, `${sources.basePath || ""}/`));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" || /^\/(?:api|socket\.io)(?:\/|$)/.test(req.path) || /\.[a-zA-Z0-9]+$/.test(req.path) && !req.path.startsWith("/patchnotes/")) return next();
    const normalizedPath = req.path.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    if (req.path !== normalizedPath) return res.redirect(308, `${sources.basePath || ""}${normalizedPath}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
    const { html, meta } = service.document(req.url);
    res.status(meta.status).set("X-Robots-Tag", meta.robots).set("Cache-Control", meta.indexable ? "public, max-age=0, must-revalidate" : "private, no-store").type("html").send(html);
  });
  return service;
}
