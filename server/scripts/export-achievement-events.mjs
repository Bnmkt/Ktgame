import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { achievementRuleSchemas } from "../src/services/achievement-rules.js";
import { games } from "../src/games/shared.js";

const data = JSON.stringify({ version: 2, ...achievementRuleSchemas(games) }, null, 2) + "\n";
if (process.argv[2]) {
  const destination = path.resolve(process.argv[2]);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, data);
  console.log(`Achievement schemas exported to ${destination}`);
} else process.stdout.write(data);
