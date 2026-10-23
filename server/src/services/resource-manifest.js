const publicFile = /\/api\/(?:media\/[a-f0-9]{64}\.(?:png|jpg|webp|gif)|game-images\/[a-f0-9]{64}\.(?:png|gif)|ranked\/insignia-images\/[a-f0-9]{64})(?![a-zA-Z0-9_.-])/g;

export function publicResourceManifest(sources, media = []) {
  const found = new Set();
  function visit(value) {
    if (typeof value === "string") for (const match of value.matchAll(publicFile)) found.add(match[0]);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  }
  visit(sources);
  const sizes = new Map(media.map(row => [row.image, row.bytes]));
  const assets = [...found].sort().map(url => ({ url, revision: url.split("/").at(-1).split(".")[0], bytes: sizes.get(url) ?? 0, category: "collections" }));
  return { version: 1, assets };
}

export function registerResourceManifest({ app, sources, media }) {
  let cached, expires = 0;
  app.get("/api/resources", (_req, res) => {
    if (!cached || Date.now() >= expires) { cached = publicResourceManifest(sources(), media()); expires = Date.now() + 60000; }
    res.set("Cache-Control", "public, max-age=60").json(cached);
  });
}
