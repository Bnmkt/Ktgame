import "dotenv/config";
import { verifyEmailDelivery } from "../src/services/email-verification.js";

const result = await verifyEmailDelivery();
console.log(JSON.stringify({ configured: result.configured, ok: result.ok, ...(result.ok ? {} : { code: result.code, responseCode: result.responseCode, command: result.command }) }));
if (!result.ok) process.exitCode = 1;
