import fs from "node:fs/promises";
import QRCode from "qrcode";
import { ZipFile } from "yazl";
import rateLimit from "express-rate-limit";
import { pageMetadata } from "../../../client/src/seo/metadata.js";
import { campaignUrl } from "../../../client/src/features/communication/config.js";

const clean = (value, max) => {
  if (typeof value !== "string" || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error("Un champ est invalide ou trop long.");
  return value.trim();
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mediaId = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
const safeName = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/^-|-$/g, "") || "ktga";

export function normalizePressKit(input, mediaLibrary) {
  if (!input || !["fr", "en"].includes(input.locale)) throw new Error("Choisis la langue du kit.");
  const value = { locale: input.locale };
  for (const [field, max] of Object.entries({ name: 100, title: 120, tagline: 180, shortDescription: 500, longDescription: 16000, highlights: 3000, contactName: 120, contactEmail: 254, usageRights: 3000 })) value[field] = clean(input[field] ?? "", max);
  if (!value.name || !value.title || !value.shortDescription) throw new Error("Indique un nom, un titre et une présentation courte.");
  if (value.contactEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.contactEmail)) throw new Error("Adresse de contact invalide.");
  if (!Array.isArray(input.assets) || input.assets.length > 12) throw new Error("Un kit peut contenir jusqu’à 12 visuels.");
  const ids = new Set();
  value.assets = input.assets.map(asset => {
    if (!mediaId.test(asset?.id ?? "") || ids.has(asset.id)) throw new Error("Visuel invalide ou présent plusieurs fois.");
    ids.add(asset.id);
    const row = mediaLibrary.get(asset.id);
    if (!row || row.archived) throw new Error("Un visuel n’est plus disponible dans la médiathèque.");
    return { id: asset.id, caption: clean(asset.caption ?? "", 200), credit: clean(asset.credit ?? "", 200) };
  });
  return value;
}

export function publicDestinations({ settings, games, notes, pages, website }) {
  const origin = new URL(website).origin;
  const basePath = new URL(website).pathname.replace(/\/$/, "");
  const sources = { siteName: settings.siteName, games, notes: notes.filter(note => note.status === "published"), customPages: pages, basePath };
  const paths = ["/", "/jeux", "/faq", "/guide", "/patchnotes", "/conditions", "/mentions-legales", "/confidentialite", "/cookies", "/parents"];
  paths.push(...games.filter(game => game.enabled !== false).map(game => `/jeux/${encodeURIComponent(game.id)}`));
  paths.push(...sources.notes.map(note => `/patchnotes?version=${encodeURIComponent(note.version)}`));
  paths.push(...pages.map(page => `/pages/${encodeURIComponent(page.slug)}`));
  return [...new Set(paths)].map(route => {
    const url = new URL(basePath + route, origin);
    const meta = pageMetadata({ ...sources, pathname: url.pathname, search: url.search });
    return { url: url.href, path: url.pathname + url.search, ...meta };
  });
}

export function normalizeCampaign(input, website, destinations) {
  const value = { name: clean(input?.name ?? "", 100), destination: clean(input?.destination ?? "", 500), source: clean(input?.source ?? "", 80), medium: clean(input?.medium ?? "", 80), campaign: clean(input?.campaign ?? "", 80), content: clean(input?.content ?? "", 80), notes: clean(input?.notes ?? "", 1500) };
  if (!value.name) throw new Error("Indique un nom pour ce lien.");
  const url = campaignUrl(value, website);
  const target = new URL(value.destination, website).href;
  if (!destinations.some(page => page.url === target && page.status === 200)) throw new Error("Choisis une destination publique existante.");
  value.destination = target;
  if (!/^#[0-9a-f]{6}$/i.test(input.color ?? "#102820")) throw new Error("Couleur de QR code invalide.");
  const color = input.color ?? "#102820";
  const luminance = color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  if (1.05 / (luminance + .05) < 4.5) throw new Error("Choisis une couleur plus sombre pour garder le QR code lisible.");
  return { ...value, color: color.toLowerCase(), url };
}

export function seoReport(destinations) {
  const seen = new Map();
  return destinations.map(page => {
    const suggestions = [];
    if (!page.indexable) suggestions.push("Cette page est volontairement exclue de l’indexation.");
    if (page.title.length > 65) suggestions.push("Le titre peut être tronqué dans les résultats de recherche.");
    if (page.description.length < 70) suggestions.push("La description mérite d’être précisée.");
    if (page.description.length > 170) suggestions.push("La description peut être tronquée dans les résultats de recherche.");
    if (seen.has(page.title)) suggestions.push("Une autre page utilise ce titre.");
    seen.set(page.title, page.url);
    return { ...page, suggestions };
  });
}

export function pressKitText(kit, website) {
  return `# ${kit.title}\n\n${kit.tagline}\n\n${kit.shortDescription}\n\n${kit.longDescription}\n\n## ${kit.locale === "en" ? "Highlights" : "Points clés"}\n\n${kit.highlights.split("\n").filter(Boolean).map(line => `- ${line}`).join("\n")}\n\n## Contact\n\n${kit.contactName}\n${kit.contactEmail}\n${website}\n\n## ${kit.locale === "en" ? "Credits and usage" : "Crédits et réutilisation"}\n\n${kit.usageRights}\n\n${kit.assets.map((asset, i) => `${i + 1}. ${asset.caption}${asset.credit ? ` — ${asset.credit}` : ""}`).join("\n")}\n`;
}

export async function pressKitArchive(kit, website, mediaLibrary) {
  let total = 0;
  const files = [];
  for (const [index, asset] of kit.assets.entries()) {
    const row = mediaLibrary.get(asset.id);
    if (!row || row.archived) throw new Error("Un visuel du kit n’est plus disponible.");
    const target = mediaLibrary.target(asset.id), info = await fs.stat(target);
    total += info.size;
    if (total > 30 * 1024 * 1024) throw new Error("Les visuels du kit dépassent 30 Mo. Retire certains fichiers.");
    files.push({ ...asset, image: `visuels/${index + 1}-${safeName(row.name)}.${asset.id.split(".").at(-1)}`, target });
  }
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(pressKitText(kit, website)), "kit-presse.md");
  zip.addBuffer(Buffer.from(JSON.stringify({ version: 1, website, ...kit, assets: files.map(({ target, ...asset }) => asset) }, null, 2)), "kit-presse.json");
  zip.addBuffer(await QRCode.toBuffer(website, { width: 1024, margin: 4, errorCorrectionLevel: "M" }), "qr-site.png");
  const paragraphs = text => text.split(/\n\s*\n/).map(part => `<p>${escape(part).replaceAll("\n", "<br>")}</p>`).join("");
  const html = `<!doctype html><html lang="${kit.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(kit.title)}</title><style>body{margin:0;background:#0c1615;color:#f8ecd2;font:16px/1.6 system-ui}main{max-width:960px;margin:auto;padding:40px 24px}h1,h2{color:#e8c777}h1{font-size:36px}a{color:#7dc9ed}figure{margin:28px 0}img{max-width:100%;height:auto;max-height:540px;object-fit:contain}figcaption{color:#b8ae99}section{border-top:1px solid #514b38;margin-top:28px;padding-top:20px}@media print{body{background:white;color:black}}</style></head><body><main><h1>${escape(kit.title)}</h1><p>${escape(kit.tagline)}</p><strong>${escape(kit.shortDescription)}</strong>${paragraphs(kit.longDescription)}<section><h2>${kit.locale === "en" ? "Highlights" : "Points clés"}</h2><ul>${kit.highlights.split("\n").filter(Boolean).map(line => `<li>${escape(line)}</li>`).join("")}</ul></section><section><h2>Contact</h2><p>${escape(kit.contactName)}<br>${escape(kit.contactEmail)}</p><a href="${escape(website)}">${escape(website)}</a></section><section><h2>${kit.locale === "en" ? "Images" : "Visuels"}</h2>${files.map(asset => `<figure><img src="${escape(asset.image)}" alt="${escape(asset.caption)}"><figcaption>${escape(asset.caption)}${asset.credit ? ` · ${escape(asset.credit)}` : ""}</figcaption></figure>`).join("")}</section><section><h2>${kit.locale === "en" ? "Credits and usage" : "Crédits et réutilisation"}</h2>${paragraphs(kit.usageRights)}</section></main></body></html>`;
  zip.addBuffer(Buffer.from(html), "index.html");
  for (const file of files) zip.addFile(file.target, file.image, { compress: false });
  zip.end();
  return zip.outputStream;
}

export function registerCommunicationRoutes({ app, auth, requireBackOffice, requireAdmin, store, mediaLibrary, settings, website, games, notes, pages }) {
  const catalog = () => publicDestinations({ settings: settings(), website: website(), games: games(), notes: notes(), pages: pages() });
  const heavy = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Attends un instant avant de générer un nouvel export." } });
  const wrap = handler => async (req, res, next) => { res.set("Cache-Control", "private, no-store"); try { await handler(req, res); } catch (error) { if (res.headersSent) return next(error); res.status(error.status || 400).json({ error: error.message }); } };
  app.get("/api/admin/communication", auth, requireBackOffice, wrap((_req, res) => res.json({ kits: store.list("kit"), campaigns: store.list("campaign"), destinations: catalog(), media: Object.fromEntries(mediaLibrary.list().map(({ id, name, image }) => [id, { name, image }])), site: { siteName: settings().siteName, supportEmail: settings().supportEmail, website: website() } })));
  app.get("/api/admin/communication/seo", auth, requireBackOffice, wrap((_req, res) => res.json({ pages: seoReport(catalog()), sitemap: new URL("sitemap.xml", website().replace(/\/?$/, "/")).href, robots: new URL("robots.txt", website().replace(/\/?$/, "/")).href, checkedAt: new Date().toISOString() })));
  for (const [path, kind, normalize] of [["kits", "kit", input => normalizePressKit(input, mediaLibrary)], ["campaigns", "campaign", input => normalizeCampaign(input, website(), catalog())]]) {
    app.post(`/api/admin/communication/${path}`, auth, requireBackOffice, wrap((req, res) => res.status(201).json(store.save(kind, null, normalize(req.body)))));
    app.get(`/api/admin/communication/${path}/:id`, auth, requireBackOffice, wrap((req, res) => { const value = store.get(kind, req.params.id); if (!value) return res.status(404).json({ error: "Document introuvable." }); res.json(value); }));
    app.put(`/api/admin/communication/${path}/:id`, auth, requireBackOffice, wrap((req, res) => res.json(store.save(kind, req.params.id, normalize(req.body), req.body.revision))));
    app.delete(`/api/admin/communication/${path}/:id`, auth, requireAdmin, wrap((req, res) => { store.remove(kind, req.params.id, req.body.revision); res.json({ ok: true }); }));
  }
  app.get("/api/admin/communication/kits/:id/export", auth, requireBackOffice, heavy, wrap(async (req, res) => {
    const kit = store.get("kit", req.params.id);
    if (!kit) return res.status(404).json({ error: "Kit introuvable." });
    const stream = await pressKitArchive(kit, website(), mediaLibrary);
    res.attachment(`${safeName(kit.name)}.zip`).type("application/zip");
    stream.on("error", error => res.destroy(error));
    res.on("close", () => { if (!res.writableEnded) stream.destroy(); });
    stream.pipe(res);
  }));
  app.post("/api/admin/communication/qr", auth, requireBackOffice, heavy, wrap(async (req, res) => {
    const campaign = normalizeCampaign(req.body, website(), catalog());
    const options = { width: 1024, margin: 4, errorCorrectionLevel: "M", color: { dark: campaign.color, light: "#ffffff" } };
    if (!["png", "svg"].includes(req.body.format)) throw new Error("Choisis PNG ou SVG.");
    const content = req.body.format === "svg" ? await QRCode.toString(campaign.url, { ...options, type: "svg" }) : (await QRCode.toBuffer(campaign.url, options)).toString("base64");
    res.json({ format: req.body.format, content, url: campaign.url });
  }));
}
