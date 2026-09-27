import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const required = ["NODE_ENV", "HOST", "PORT", "APP_BASE_PATH", "JWT_SECRET", "CLIENT_ORIGIN", "SQLITE_PATH"];
const errors = [];
const warnings = [];

for (const key of required) {
  if (!process.env[key]) errors.push(`${key} is missing.`);
}

if (process.env.NODE_ENV !== "production") warnings.push("NODE_ENV is not production.");
if (process.env.JWT_SECRET === "replace-with-a-long-random-secret" || process.env.JWT_SECRET?.length < 32) {
  errors.push("JWT_SECRET must be a real long secret.");
}

const hasPem = Boolean(process.env.HTTPS_KEY_PATH && process.env.HTTPS_CERT_PATH);
const hasPfx = Boolean(process.env.HTTPS_PFX_PATH);
if (!hasPem && !hasPfx) errors.push("HTTPS is not configured. Set HTTPS_KEY_PATH/HTTPS_CERT_PATH or HTTPS_PFX_PATH.");

function checkReadable(filePath, label) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    errors.push(`${label} does not exist: ${resolved}`);
    return;
  }
  try {
    fs.accessSync(resolved, fs.constants.R_OK);
  } catch {
    errors.push(`${label} is not readable by this user: ${resolved}`);
  }
}

if (hasPem) {
  checkReadable(process.env.HTTPS_KEY_PATH, "HTTPS_KEY_PATH");
  checkReadable(process.env.HTTPS_CERT_PATH, "HTTPS_CERT_PATH");
}

if (hasPfx) {
  checkReadable(process.env.HTTPS_PFX_PATH, "HTTPS_PFX_PATH");
}

if (!process.env.CLIENT_ORIGIN?.split(",").map((origin) => origin.trim()).includes("https://netdis.org")) {
  errors.push("CLIENT_ORIGIN must include https://netdis.org.");
}

if (process.env.APP_BASE_PATH !== "/ktga") warnings.push("APP_BASE_PATH is expected to be /ktga for this deployment.");
if (String(process.env.PORT) !== "4000") warnings.push("PORT is expected to be 4000 for the current client build.");

if (warnings.length) {
  console.warn("Production warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Production check failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Run this check on the backend server after certificates have been issued, not on a local machine with server-only certificate paths.");
  process.exit(1);
}

console.log("Production check passed.");
