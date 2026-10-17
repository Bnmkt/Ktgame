import path from "node:path";
import { mediaPath } from "./media-library.js";

export function normalizeBranding(value = {}) {
  const pwa = value.pwaIcons && typeof value.pwaIcons === "object" ? value.pwaIcons : {};
  return { siteIconMode: value.siteIconMode === "icon" ? "icon" : "image", siteIconImage: mediaPath(value.siteIconImage), faviconImage: mediaPath(value.faviconImage), pwaIcons: Object.fromEntries(["180", "192", "512", "maskable"].map(key => [key, mediaPath(pwa[key])])) };
}

export function validateBranding(value, library) {
  const config = normalizeBranding(value);
  for (const [key, image] of Object.entries({ siteIconImage: config.siteIconImage, faviconImage: config.faviconImage, ...config.pwaIcons })) {
    if (!image) continue;
    const row = library.get(image.split("/").at(-1));
    if (!row || row.archived || row.mime !== "image/png") throw new Error("Choisis une image PNG de la médiathèque.");
    const size = { "180": 180, "192": 192, "512": 512, maskable: 512 }[key];
    if (size && (row.width !== size || row.height !== size)) throw new Error(`L’icône doit mesurer ${size} × ${size} pixels.`);
  }
  return config;
}

export function registerBrandingRoutes({ app, settings, websiteUrl, publicDirectory }) {
  app.get("/api/branding/manifest.webmanifest", (_req, res) => {
    const current = settings(), origin = new URL(websiteUrl()).origin;
    res.set("Cache-Control", "public, max-age=60").type("application/manifest+json").json({ id: `${origin}/`, name: current.siteName, short_name: current.siteName, description: current.siteSubtitle, start_url: `${origin}/`, scope: `${origin}/`, display: "standalone", background_color: "#0c1311", theme_color: "#15211e", icons: [
      { src: current.pwaIcons?.["192"] || `${origin}/api/branding/pwa/192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: current.pwaIcons?.["512"] || `${origin}/api/branding/pwa/512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: current.pwaIcons?.maskable || `${origin}/api/branding/pwa/maskable`, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ].map(icon => ({ ...icon, src: new URL(icon.src, origin).href })) });
  });
  app.get("/api/branding/:kind{/:size}", (req, res) => {
    const current = settings(), { kind, size } = req.params;
    let image, fallback;
    if (kind === "site") { image = current.siteIconImage; fallback = "favicon.svg"; }
    else if (kind === "favicon") { image = current.faviconImage; fallback = "favicon.svg"; }
    else if (kind === "pwa" && ["180", "192", "512", "maskable"].includes(size)) { image = current.pwaIcons?.[size]; fallback = `pwa/icon-${size === "maskable" ? "maskable-512" : size}.png`; }
    else return res.status(404).end();
    res.set("Cache-Control", "public, max-age=60").set("X-Content-Type-Options", "nosniff");
    if (image) return res.redirect(302, image);
    res.sendFile(path.resolve(publicDirectory, fallback));
  });
}
