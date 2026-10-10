import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { checkProductionConfig } from "../src/services/production-config.js";

const { errors, warnings } = checkProductionConfig(process.env);
for (const key of ["HTTPS_KEY_PATH", "HTTPS_CERT_PATH", "HTTPS_PFX_PATH"]) {
  if (!process.env[key]) continue;
  try { fs.accessSync(path.resolve(process.env[key]), fs.constants.R_OK); }
  catch { errors.push(`${key} does not exist or is not readable.`); }
}
for (const warning of warnings) console.warn(`Production warning: ${warning}`);
for (const error of errors) console.error(`Production error: ${error}`);
if (errors.length) process.exitCode = 1;
else console.log("Production check passed.");
