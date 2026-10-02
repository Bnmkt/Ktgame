import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEmailVerificationMessage } from "../src/services/email-verification.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "docs/previews/email-validation-preview.html");
const message = buildEmailVerificationMessage({
  user: { pseudo: "Bnmkt", profile: { displayName: "Bnmkt" } },
  token: "aperçu-validation-email",
  siteName: "KTGA.ME"
}, { PUBLIC_APP_URL: "https://netdis.org/ktga" });

const preview = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Aperçu email — ${message.subject}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #e7e8ea; color: #252729; font-family: Arial, Helvetica, sans-serif; }
    .mail-shell { max-width: 920px; margin: 28px auto; background: #fff; border: 1px solid #c9ccd0; box-shadow: 0 12px 34px rgba(0,0,0,.14); }
    .mail-toolbar { padding: 15px 20px; border-bottom: 1px solid #dde0e3; background: #f7f8f9; }
    .mail-toolbar strong { display: block; font-size: 16px; }
    .mail-toolbar span { color: #646a70; display: block; font-size: 12px; margin-top: 5px; }
    .mail-frame { width: 100%; min-height: 790px; border: 0; display: block; background: #080d0c; }
    @media (max-width: 700px) { .mail-shell { margin: 0; border: 0; } .mail-frame { min-height: 920px; } }
  </style>
</head>
<body>
  <main class="mail-shell">
    <header class="mail-toolbar">
      <strong>${message.subject}</strong>
      <span>KTGA.ME &lt;no-reply@netdis.org&gt; · à Bnmkt</span>
    </header>
    <iframe class="mail-frame" title="Aperçu du contenu de l’email" srcdoc="${message.html.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></iframe>
  </main>
</body>
</html>`;

await mkdir(dirname(output), { recursive: true });
await writeFile(output, preview, "utf8");
console.log(output);
