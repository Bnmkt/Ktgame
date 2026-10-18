import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const sourceBuildKey = (manifest, lock) => createHash("sha256").update(manifest).update(lock).digest("hex");

export async function sourceBuildDependencies(client, tools = "/var/lib/ktga-build-tools") {
  const key = sourceBuildKey(await fs.readFile(path.join(client, "package.json")), await fs.readFile(path.join(client, "package-lock.json")));
  const directory = path.join(tools, key);
  try {
    for (const target of [tools, directory, path.join(directory, "node_modules"), path.join(directory, ".ready")]) {
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022)) throw new Error("Permissions invalides.");
    }
    if ((await fs.readFile(path.join(directory, ".ready"), "utf8")).trim() !== key) throw new Error("Installation incomplète.");
  } catch {
    throw new Error("Dépendances de reconstruction absentes ou périmées. Relancer deploy/debian/setup-source-editor.sh sur le serveur.");
  }
  return directory;
}

export function sourceBuildCommand(workspace, dependencies, ssr = false) {
  return ["--collect", "--wait", "--pipe", "--quiet", "--uid=ktga-build", "-p", `WorkingDirectory=${workspace}`, "-p", "ProtectSystem=strict", "-p", "ProtectHome=true", "-p", "PrivateNetwork=true", "-p", "NoNewPrivileges=true", "-p", "MemoryMax=1500M", "-p", "CPUQuota=100%", "-p", `ReadWritePaths=${workspace}`, "-p", "InaccessiblePaths=/etc/ktga /var/lib/ktga", "/usr/bin/env", "-i", "PATH=/usr/bin:/bin", `HOME=${workspace}`, "VITE_API_URL=https://api.ktga.me", "VITE_AUDIENCE_READY=true", "/usr/bin/node", `${dependencies}/node_modules/vite/bin/vite.js`, "build", "--mode", "production", "--configLoader", "runner", ...(ssr ? ["--ssr", "src/seo/render.jsx", "--outDir", "dist-ssr"] : [])];
}
