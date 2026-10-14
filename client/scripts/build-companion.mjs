import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { ZipFile } = require("yazl");
const files = ["discord-presence.mjs", "companion-installation.mjs", "lancer.cmd", "activer-demarrage.cmd", "desactiver-demarrage.cmd", "LIRE-MOI.txt"];
const directory = new URL("../public/downloads/", import.meta.url);
fs.mkdirSync(directory, { recursive: true });
const archive = new ZipFile();
const destination = fs.createWriteStream(new URL("ktga-discord-companion.zip", directory));
const finished = new Promise((resolve, reject) => { destination.on("close", resolve); destination.on("error", reject); archive.outputStream.on("error", reject); });
archive.outputStream.pipe(destination);
for (const name of files) {
  const source = new URL(`../../desktop/companion/${name}`, import.meta.url);
  let content = fs.readFileSync(source);
  if (name.endsWith(".cmd")) content = Buffer.from(content.toString("utf8").replace(/\r?\n/g, "\r\n"));
  archive.addBuffer(content, `KTGA-Compagnon/${name}`, { mode: 0o100644 });
}
archive.end(); await finished;
console.log(`Compagnon construit : ${fileURLToPath(new URL("ktga-discord-companion.zip", directory))}`);
