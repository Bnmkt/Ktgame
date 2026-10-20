import { createHash } from "node:crypto";

const xml = value => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const plain = value => String(value ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]*>/g, "").replace(/[#*`_]/g, "").replace(/\s+/g, " ").trim();

export function buildRss({ notes, website, siteName = "KTGA.ME", now = Date.now() }) {
  const base = website.replace(/\/?$/, "/");
  const published = notes.filter(note => note.status === "published" && Number.isFinite(Date.parse(note.publishedAt)) && Date.parse(note.publishedAt) <= now)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || String(a.id).localeCompare(String(b.id))).slice(0, 50);
  const lastModified = Math.max(0, ...published.map(note => Math.max(Date.parse(note.publishedAt), Date.parse(note.updatedAt) || 0)));
  const items = published.map(note => {
    const link = new URL(`patchnotes?version=${encodeURIComponent(note.version)}`, base).href;
    return `<item><title>${xml(`${note.version} · ${note.title}`)}</title><link>${xml(link)}</link><guid isPermaLink="false">${xml(new URL(`patchnotes#${encodeURIComponent(note.id || note.version)}`, base).href)}</guid><pubDate>${new Date(note.publishedAt).toUTCString()}</pubDate><description>${xml(plain(note.summary))}</description></item>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(siteName)} · Mises à jour</title><link>${xml(base)}</link><description>Les nouveautés, améliorations et correctifs de ${xml(siteName)}.</description><language>fr-BE</language><atom:link href="${xml(new URL("rss.xml", base).href)}" rel="self" type="application/rss+xml"/>${lastModified ? `<lastBuildDate>${new Date(lastModified).toUTCString()}</lastBuildDate>` : ""}${items}</channel></rss>`;
  return { body, lastModified, etag: `"${createHash("sha256").update(body).digest("hex")}"` };
}

export function registerRssRoute({ app, notes, website, settings, now = Date.now }) {
  app.get("/rss.xml", (req, res) => {
    const feed = buildRss({ notes: notes(), website: website(), siteName: settings().siteName, now: now() });
    res.set("Cache-Control", "public, max-age=300, must-revalidate").set("ETag", feed.etag);
    if (feed.lastModified) res.set("Last-Modified", new Date(feed.lastModified).toUTCString());
    if (req.get("If-None-Match")?.split(",").some(tag => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === feed.etag)) return res.status(304).end();
    res.type("application/rss+xml").send(feed.body);
  });
}
