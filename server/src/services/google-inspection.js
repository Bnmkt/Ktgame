import fs from "node:fs";
import { createPrivateKey } from "node:crypto";
import jwt from "jsonwebtoken";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const scope = "https://www.googleapis.com/auth/webmasters.readonly";
export const GOOGLE_INSPECTION_TTL = 24 * 60 * 60 * 1000;
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const consoleUrl = property => `https://search.google.com/search-console?resource_id=${encodeURIComponent(property)}`;

export function createGoogleInspection({ store, website, credentialFile = process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS, property = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY || website(), send = fetch, now = Date.now }) {
  let credentials, privateKey, configError = "", token, tokenWork;
  const pending = new Map();
  const contains = value => {
    const url = new URL(value);
    if (property.startsWith("sc-domain:")) {
      const domain = property.slice(10).toLowerCase();
      return /^[a-z0-9.-]+$/.test(domain) && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    }
    const site = new URL(property);
    return site.protocol === "https:" && !site.search && !site.hash && site.pathname.endsWith("/") && site.origin === url.origin && url.pathname.startsWith(site.pathname);
  };
  if (credentialFile) {
    try {
      if (fs.statSync(credentialFile).size > 65536) throw new Error();
      credentials = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
      if (credentials.type !== "service_account" || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(credentials.client_email) || !contains(website())) throw new Error();
      privateKey = createPrivateKey(credentials.private_key);
      if (privateKey.asymmetricKeyType !== "rsa" || privateKey.asymmetricKeyDetails.modulusLength < 2048) throw new Error();
    } catch { credentials = null; privateKey = null; configError = "Configuration Google Search Console invalide ou inaccessible."; }
  }
  function configuration() { return { configured: Boolean(privateKey), error: configError, consoleUrl: consoleUrl(property) }; }
  async function requestJson(url, options) {
    const response = await send(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw failure([401, 403].includes(response.status) ? "Accès Google refusé. Vérifie le compte de service, la propriété et l’activation de l’API."
        : response.status === 429 ? "Quota Google atteint. Une nouvelle vérification sera possible plus tard." : "Google Search Console est momentanément indisponible.", 502);
    }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 65536) throw new Error("Oversized Google response"); chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async function accessToken() {
    if (token?.until > now()) return token.value;
    if (tokenWork) return tokenWork;
    tokenWork = (async () => {
      const issuedAt = Math.floor(now() / 1000);
      const assertion = jwt.sign({ iss: credentials.client_email, scope, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 }, privateKey, { algorithm: "RS256", ...(typeof credentials.private_key_id === "string" ? { keyid: credentials.private_key_id } : {}) });
      const data = await requestJson(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
      if (typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 8192 || /[\r\n]/.test(data.access_token) || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 60) throw new Error("Invalid Google token");
      token = { value: data.access_token, until: now() + (Math.min(3600, Number(data.expires_in)) - 60) * 1000 };
      return token.value;
    })();
    try { return await tokenWork; } finally { tokenWork = null; }
  }
  const cacheKey = url => JSON.stringify([property, url]);
  function view(url) {
    if (!privateKey) return { state: configError ? "error" : "not-configured", error: configError };
    const cached = store.googleCache(cacheKey(url));
    return cached ?? { state: "unknown" };
  }
  async function inspect(url) {
    if (!privateKey) throw failure(configError || "Connecte Google Search Console pour vérifier l’indexation.", 503);
    if (!contains(url)) throw failure("Cette URL ne correspond pas à la propriété Google configurée.");
    const key = cacheKey(url), previous = store.googleCache(key);
    if (previous?.nextAttempt > now()) return previous;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 2) throw failure("Trop de vérifications Google en cours. Réessaie dans un instant.", 429);
    const work = (async () => {
      let result;
      try {
        const data = await requestJson(INSPECT_URL, { method: "POST", headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ inspectionUrl: url, siteUrl: property, languageCode: "fr-BE" }) });
        const report = data.inspectionResult?.indexStatusResult;
        if (!report || !["PASS", "NEUTRAL", "FAIL", "PARTIAL", "VERDICT_UNSPECIFIED"].includes(report.verdict)) throw new Error("Invalid Google inspection");
        const link = data.inspectionResult.inspectionResultLink;
        let inspectionUrl = "";
        try { const parsed = new URL(link); if (parsed.origin === "https://search.google.com" && !parsed.username && !parsed.password) inspectionUrl = parsed.href; } catch {}
        result = { state: report.verdict === "PASS" ? "indexed" : ["FAIL", "NEUTRAL"].includes(report.verdict) ? "not-indexed" : "unknown", checkedAt: now(), attemptedAt: now(), nextAttempt: now() + GOOGLE_INSPECTION_TTL, error: "", inspectionUrl };
        for (const field of ["coverageState", "robotsTxtState", "indexingState", "pageFetchState", "lastCrawlTime", "googleCanonical"]) {
          if (typeof report[field] === "string") result[field] = report[field].slice(0, 2000);
        }
      } catch (error) {
        token = null;
        result = { ...(previous ?? { state: "error" }), attemptedAt: now(), nextAttempt: now() + 15 * 60 * 1000, error: error.status ? error.message : "La vérification Google a échoué. Les dernières données valides sont conservées." };
      }
      store.saveGoogleCache(key, result); return result;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  return { configuration, view, inspect };
}
