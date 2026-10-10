import { execFileSync } from "node:child_process";
import { cpSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const mode = process.argv.includes("--production") ? ["--mode", "production"] : [];
execFileSync(process.execPath, [vite, "build", ...mode], { cwd, stdio: "inherit" });
execFileSync(process.execPath, [vite, "build", ...mode, "--ssr", "src/seo/render.jsx", "--outDir", "dist-ssr"], { cwd, stdio: "inherit" });
for (const file of readdirSync(new URL("../dist-ssr/assets/", import.meta.url))) {
  cpSync(new URL(`../dist-ssr/assets/${file}`, import.meta.url), new URL(`../dist/assets/${file}`, import.meta.url));
}
