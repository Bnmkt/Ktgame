import { isEditorDuplication } from "./editor-duplication.js";

// Classify mutations only: security, privacy requests, reports and safe exits stay accessible.
export function softBanRequestFeatures(req, user) {
  const route = req.path.toLowerCase().replace(/\/+$/, "");
  const method = req.method.toUpperCase(), body = req.body ?? {};
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return [];
  if (/^\/api\/patchnotes\/[^/]+\/reaction$/.test(route)) return ["patchnotes:react"];
  if (/^\/api\/tribunal\/cases\/[^/]+\/vote$/.test(route)) return ["tribunal:vote"];
  if (/^\/api\/rooms\/[^/]+\/invite$/.test(route) || /^\/api\/room-invites\/[^/]+\/accept$/.test(route)) return ["invitations"];
  if (route === "/api/me/daily-claim") return ["daily-bonus"];
  if (route === "/api/me/cosmetics") return ["cosmetics:equip"];
  if (route === "/api/me") {
    const profile = user?.profile ?? {};
    const changed = (key, previous) => body[key] !== undefined && String(body[key] ?? "") !== String(previous ?? "");
    return [...(changed("displayName", profile.displayName || user?.pseudo) || changed("pseudo", profile.displayName || user?.pseudo) || changed("bio", profile.bio) || changed("gender", profile.gender) ? ["profile:edit"] : []),
      ...(changed("titleGameId", profile.titleGameId) || changed("titleLevel", profile.titleLevel ?? 0) || changed("titleHidden", profile.titleHidden ?? false) || changed("rankedBadgeGameId", profile.rankedBadgeGameId) ? ["cosmetics:equip"] : [])];
  }
  if (!/^\/api\/admin\/(shop|achievements|community-events|patchnotes|help|locales|games|lobby-notice)(\/|$)/.test(route)) return [];
  if (route.endsWith("/preview")) return [];
  if (isEditorDuplication({ ...req, path: route.slice("/api/admin".length) })) return ["editor:duplicate", ...(route === "/api/admin/shop" ? ["editor:publish"] : [])];
  if (/\/(images?|uploads?)(\/|$)/.test(route)) return ["editor:upload"];
  if (method === "DELETE") return ["editor:delete"];
  const publish = /\/status$/.test(route) || ["published", "scheduled", "active"].includes(body.status) || body.published === true || body.enabled === true || /^\/api\/admin\/(shop|help|locales|games|lobby-notice)(\/|$)/.test(route) || /^\/api\/admin\/achievements(\/|$)/.test(route) && body.enabled !== false;
  return [method === "POST" && /^\/api\/admin\/(shop|achievements|community-events|patchnotes)$/.test(route) ? "editor:create" : "editor:edit", ...(publish ? ["editor:publish"] : [])];
}
