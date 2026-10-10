import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const failures = [];
let checked = 0;
function checkCase(target, from) {
  let directory = root;
  const relative = path.relative(root, target);
  if (relative.startsWith("..")) return;
  for (const component of relative.split(path.sep)) {
    const names = fs.readdirSync(directory);
    if (!names.includes(component)) { failures.push(`${from}: missing file or case mismatch: ${relative}`); return; }
    directory = path.join(directory, component);
  }
  checked++;
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (/\.(?:jsx?|mjs)$/.test(entry.name)) {
      const source = fs.readFileSync(filename, "utf8");
      const literals = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])(\.[^"']+)\1/g;
      for (const match of source.matchAll(literals)) checkCase(path.resolve(directory, match[2]), path.relative(root, filename));
    }
  }
}
for (const directory of ["server/src", "server/scripts", "client/src"]) walk(path.join(root, directory));
for (const failure of failures) console.error(failure);
console.log(`Checked ${checked} relative imports for exact filename case.`);
if (failures.length) process.exitCode = 1;
