import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPendingGameplayReset } from "./gameplay-reset.js";

const data = fileURLToPath(new URL("../../data/", import.meta.url));
// This import must run before db.js or any service opens its persistent state.
const result = applyPendingGameplayReset({
  filename: process.env.SQLITE_PATH ? path.resolve(process.cwd(), process.env.SQLITE_PATH) : path.join(data, "ktga.sqlite"),
  chatFilename: process.env.CHAT_DB_PATH ? path.resolve(process.cwd(), process.env.CHAT_DB_PATH) : path.join(data, "chat.sqlite")
});
if (result) console.info(`Gameplay reset completed: ${result.id}. Accounts and site configuration preserved.`);
