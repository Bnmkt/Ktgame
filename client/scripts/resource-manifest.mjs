import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const digest = (data) => createHash("sha256").update(data).digest("hex").slice(0, 24);

export function resourceManifestPlugin() {
  let config;
  return {
    name: "ktga-resource-manifest",
    configResolved(value) { config = value; },
    async generateBundle(_options, bundle) {
      if (config.build.ssr) return;
      const assets = [];
      const add = (file, data, category) => assets.push({ url: `${config.base}${file}`, revision: digest(data), bytes: Buffer.byteLength(data), category });
      for (const [file, entry] of Object.entries(bundle)) {
        if (!/\.(?:js|css|woff2?|png|webp|svg)$/.test(file)) continue;
        // Thousands of unused icon micro-chunks are fetched on demand, not at every first visit.
        if (entry.type === "chunk" && Object.keys(entry.modules).every(id => id.replaceAll("\\", "/").includes("/lucide-react/"))) continue;
        add(file, entry.type === "chunk" ? entry.code : entry.source, "interface");
      }
      async function walk(directory) {
        for (const entry of await readdir(path.join(config.publicDir, directory), { withFileTypes: true }).catch(() => [])) {
          const file = `${directory}/${entry.name}`;
          if (entry.isDirectory()) await walk(file);
          else if (/\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|woff2?|json)$/.test(entry.name)) add(file, await readFile(path.join(config.publicDir, file)), directory.startsWith("audio") ? "audio" : "illustrations");
        }
      }
      for (const directory of ["mascotte_assets/ui", "audio", "guides", "event", "pwa", "locales"]) await walk(directory);
      for (const file of ["favicon.svg", "ktga-preview.png"]) {
        const data = await readFile(path.join(config.publicDir, file)).catch(() => null);
        if (data) add(file, data, "interface");
      }
      assets.sort((a, b) => a.url.localeCompare(b.url));
      this.emitFile({ type: "asset", fileName: "resource-manifest.json", source: JSON.stringify({ version: 1, revision: digest(JSON.stringify(assets)), assets }) });
    }
  };
}
