const browserNames = new Set(["Chrome", "Edge", "Firefox", "Safari", "Opera", "Other"]);
const systems = new Set(["Windows", "macOS", "Linux", "Android", "iOS", "Other"]);
const errorKinds = new Set(["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError", "ResourceError", "UnhandledRejection"]);
const socketCodes = new Set(["timeout", "transport_error", "transport_close", "namespace_error", "offline", "unknown"]);
const routeSegments = new Set("api auth login register logout me config games rooms room users profile public shop inventory equip achievements history transactions friends request notifications accept decline chat messages channels journal read community-events carousel action events admin settings status health patchnotes help guide parental privacy activity activity-config guardian-activity email verify reset-password password-reset security mfa totp setup enable disable challenge data-requests bugs uploads comments links groups resolution-plan batch publish mine metadata diagnostics-version".split(" "));
const number = (value, max) => Math.min(max, Math.max(0, Math.trunc(Number(value) || 0)));
const at = (value) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : "";

export function safeDiagnosticRoute(value) {
  try {
    const pathname = new URL(String(value), "https://local.invalid").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const index = parts.indexOf("api");
    if (index < 0) return "/api/:route";
    return "/" + parts.slice(index, index + 8).map((part) => routeSegments.has(part) ? part : ":id").join("/");
  } catch { return "/api/:route"; }
}

export function sanitizeBugDiagnostics(input, { userId = "", version = "" } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return {
    version: /^[a-z0-9._+-]{1,40}$/i.test(version) ? version : "",
    capturedAt: at(input.capturedAt),
    startedAt: at(input.startedAt),
    browser: browserNames.has(input.browser) ? input.browser : "Other",
    browserMajor: number(input.browserMajor, 999),
    system: systems.has(input.system) ? input.system : "Other",
    resolution: { width: number(input.resolution?.width, 20000), height: number(input.resolution?.height, 20000) },
    viewport: { width: number(input.viewport?.width, 20000), height: number(input.viewport?.height, 20000) },
    userId: String(userId).slice(0, 80),
    javascript: (Array.isArray(input.javascript) ? input.javascript : []).slice(-10).map((entry) => ({
      at: at(entry?.at), kind: errorKinds.has(entry?.kind) ? entry.kind : "Error",
      code: ["missing_value", "missing_function", "undefined_name", "syntax", "range", "resource", "unhandled", "unknown"].includes(entry?.code) ? entry.code : "unknown",
      file: /^[a-z0-9_.-]{1,100}\.(?:js|mjs|jsx)$/i.test(entry?.file) ? entry.file : "",
      line: number(entry?.line, 1000000), column: number(entry?.column, 1000000)
    })),
    api: (Array.isArray(input.api) ? input.api : []).slice(-10).map((entry) => ({
      at: at(entry?.at), method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(entry?.method) ? entry.method : "GET",
      route: safeDiagnosticRoute(entry?.route), status: number(entry?.status, 599)
    })),
    websocket: (Array.isArray(input.websocket) ? input.websocket : []).slice(-10).map((entry) => ({ at: at(entry?.at), code: socketCodes.has(entry?.code) ? entry.code : "unknown" }))
  };
}

export function redactBugPublicText(value, max = 6000) {
  return String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").slice(0, max)
    .replace(/(?:https?:\/\/)[^\s<>]+/gi, (url) => { try { const parsed = new URL(url); return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/(?:reset|verify|token|secret)[^\s]*/gi, "/[retiré]")}`; } catch { return "[lien retiré]"; } })
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email retiré]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[adresse retirée]")
    .replace(/\b(?:password|passwd|mot de passe|cookie|authorization|bearer|token|secret|api[_-]?key)\s*(?:[:=]|\s)\s*["']?[^\s,;"']+/gi, "[secret retiré]")
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, "[jeton retiré]").trim();
}
