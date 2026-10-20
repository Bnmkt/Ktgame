import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export function publicAddress(address) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast" && (parsed.kind() === "ipv4" || parsed.match(ipaddr.parse("2000::"), 3));
  } catch { return false; }
}

export function externalUrl(value) {
  if (typeof value !== "string" || value.length > 1500 || /[\s\x00-\x1f\\]/.test(value)) throw new Error("URL HTTPS invalide.");
  let url; try { url = new URL(value); } catch { throw new Error("URL HTTPS invalide."); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (url.protocol !== "https:" || url.port && url.port !== "443" || url.username || url.password || url.hash || hostname.endsWith(".") || !isIP(hostname) && !hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(hostname) || isIP(hostname) && !publicAddress(hostname)) throw new Error("Utilise une URL HTTPS publique, sans identifiants ni port personnalisé.");
  return url;
}

export async function resolveExternal(value, resolve = lookup, timeoutMs = 8000) {
  const url = externalUrl(value), host = url.hostname.replace(/^\[|\]$/g, "");
  let timer;
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
    resolve(host, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("La résolution DNS a expiré.")), timeoutMs); timer.unref?.(); })
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw new Error("Cette adresse ne pointe pas exclusivement vers Internet public.");
  return { url, addresses };
}

export async function fetchExternalJson(value, { resolve = lookup, request = https.request, timeoutMs = 8000, maxBytes = 524288 } = {}) {
  // Validate every DNS answer, then pin the socket to that validated result to prevent rebinding.
  const result = await resolveExternal(value, resolve, timeoutMs);
  return new Promise((resolveResult, reject) => {
    const address = result.addresses[0];
    const req = request(result.url, { method: "GET", agent: false, headers: { Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": "KTGA-Platform-Metrics/1.0" }, lookup: (_host, options, callback) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family) }, response => {
      if (response.statusCode < 200 || response.statusCode >= 300) { response.resume(); req.destroy(new Error(`L’API a répondu HTTP ${response.statusCode}. Les redirections ne sont pas suivies.`)); return; }
      if (!/(?:application\/(?:[\w.-]+\+)?json)(?:;|$)/i.test(response.headers["content-type"] ?? "") || ![undefined, "identity"].includes(response.headers["content-encoding"])) { response.resume(); req.destroy(new Error("L’API doit renvoyer du JSON non compressé.")); return; }
      const chunks = []; let size = 0;
      response.on("data", chunk => { size += chunk.length; if (size > maxBytes) req.destroy(new Error("La réponse JSON dépasse 512 Ko.")); else chunks.push(chunk); });
      response.on("error", reject);
      response.on("end", () => { try { const data = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!data || typeof data !== "object") throw new Error(); resolveResult(data); } catch { reject(new Error("Réponse JSON invalide.")); } });
    });
    const timer = setTimeout(() => req.destroy(new Error("L’API n’a pas répondu à temps.")), timeoutMs); timer.unref?.();
    req.on("close", () => clearTimeout(timer)); req.on("error", error => reject(new Error(error.message.startsWith("L’API") || error.message.startsWith("La réponse") ? error.message : "Impossible de joindre l’API externe.")));
    req.end();
  });
}
