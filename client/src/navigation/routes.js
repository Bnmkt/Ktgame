const paths = { lobby: "", profile: "profil", shop: "shop", leaderboard: "classements", admin: "admin", room: "table", spectator: "observer", event: "evenement", terms: "conditions", legal: "mentions-legales", privacy: "confidentialite", cookies: "cookies", parents: "parents" };

export function appPath(view, id = "", base = import.meta.env?.BASE_URL ?? "/") {
  const prefix = `/${base.replace(/^\/+|\/+$/g, "")}`.replace(/\/$/, "");
  const segment = paths[view] ?? "";
  return `${prefix}/${segment}${["room", "spectator", "event"].includes(view) && id ? `/${encodeURIComponent(id)}` : ""}`;
}

export function readRoute(location, base = import.meta.env?.BASE_URL ?? "/") {
  const root = appPath("lobby", "", base);
  const path = location.pathname;
  if (path !== root.slice(0, -1) && !path.startsWith(root)) return { view: "not-found" };
  const parts = path.slice(root.length).split("/").filter(Boolean);
  const query = new URLSearchParams(location.search);
  if (!parts.length || (parts.length === 1 && parts[0] === "index.html")) {
    if (query.get("room")) return { view: "room", id: query.get("room").toUpperCase() };
    if (query.get("event")) return { view: "event", id: query.get("event") };
    return { view: "lobby" };
  }
  if (parts.length === 1) {
    const view = Object.keys(paths).find((key) => paths[key] === parts[0]);
    if (["profile", "shop", "leaderboard", "admin", "terms", "legal", "privacy", "cookies", "parents"].includes(view)) return { view };
  }
  if (parts.length === 2 && ["table", "observer", "evenement"].includes(parts[0])) {
    try {
      const id = decodeURIComponent(parts[1]);
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) return { view: "not-found" };
      return { view: parts[0] === "table" ? "room" : parts[0] === "observer" ? "spectator" : "event", id: parts[0] === "evenement" ? id : id.toUpperCase() };
    } catch { return { view: "not-found" }; }
  }
  return { view: "not-found" };
}
