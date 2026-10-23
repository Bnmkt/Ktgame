import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { resourceManifestPlugin } from "./scripts/resource-manifest.mjs";

export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react(), resourceManifestPlugin()],
    build: isSsrBuild ? { cssCodeSplit: false, ssrEmitAssets: true } : { rollupOptions: { input: { main: "index.html", activity: "discord-activity/index.html" } } }
  };
});
