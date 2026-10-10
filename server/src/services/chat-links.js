const publicHosts = new Set(["ktga.me", "www.ktga.me"]);
const candidates = /(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)[^\s<>"`]+|(?:javascript|data|mailto):[^\s<>"`]+|(?<![\w@/])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,63}(?::\d+)?(?:\/[^\s<>"`]*)?/giu;
const pageLabels = { "": "Casino", profil: "Profil", shop: "Boutique", classements: "Classements", tribunal: "Tribunal", admin: "Administration", faq: "FAQ", guide: "Guide du joueur", patchnotes: "Patchnotes", status: "Etat des services", bugs: "Signalements de bugs", conditions: "Conditions d'utilisation", "mentions-legales": "Mentions legales", confidentialite: "Confidentialite", cookies: "Cookies" };

export function detectChatLinks(content) {
  return [...String(content).matchAll(candidates)].map((match) => {
    const source = match[0].replace(/[.,;:!?\])}]+$/, "");
    let url;
    try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(source) ? source : source.startsWith("//") ? `https:${source}` : `https://${source}`); }
    catch { return { source, allowed: false }; }
    const allowed = ["http:", "https:"].includes(url.protocol) && publicHosts.has(url.hostname) && !url.username && !url.password && (!url.port || url.port === "443") && !source.includes("\\") && ![...url.searchParams.keys()].some((key) => /token|password|verify-email|code|secret/i.test(key));
    return { source, allowed, ...(allowed ? { href: `https://www.ktga.me${url.pathname}${url.search}${url.hash}`, path: `${url.pathname}${url.search}${url.hash}`, pathname: url.pathname, query: url.search } : {}) };
  });
}

export function assertChatLinks(content) {
  if (detectChatLinks(content).some((link) => !link.allowed)) throw new Error("CHAT_EXTERNAL_LINK");
}

export function describeChatLinks(content, { rooms = [], events = [], users = [], canSeeRoom = () => false } = {}) {
  return detectChatLinks(content).filter((link) => link.allowed).map((link) => {
    const parts = link.pathname.split("/").filter(Boolean);
    const query = new URLSearchParams(link.query);
    const code = ["table", "observer"].includes(parts[0]) ? parts[1] : !parts.length ? query.get("room") : "";
    if (code) {
      const room = rooms.find((row) => row.code === code.toUpperCase() || row.id === code);
      if (!room || room.finished) return { ...link, kind: "table", active: false, label: "Partie terminée", detail: "", href: null };
      const visible = room && canSeeRoom(room);
      const owner = visible && users.find((row) => row.id === room.ownerId);
      const name = owner?.profile?.displayName || owner?.pseudo;
      return { ...link, kind: "table", active: true, label: name ? `Table de ${name}` : visible ? room.name || "Table de jeu" : "Table de jeu", detail: visible ? room.name : "", href: visible ? `https://www.ktga.me/table/${encodeURIComponent(room.code)}` : link.href };
    }
    if (parts[0] === "bugs" && /^\d{1,10}$/.test(parts[1] || "")) return { ...link, kind: "bug", label: `BUG ${parts[1]}`, detail: "Signalement de bug" };
    const version = parts[0] === "patchnotes" ? parts[1] || query.get("version") : "";
    if (version && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,39}$/.test(version)) {
      const target = new URL(link.href);
      target.pathname = "/patchnotes";
      target.searchParams.set("version", version);
      return { ...link, kind: "patchnote", label: `Patchnote ${version}`, detail: "Notes de mise à jour", href: target.href };
    }
    const slug = parts[0] === "evenement" ? parts[1] : !parts.length ? query.get("event") : "";
    if (slug) {
      const event = events.find((row) => row.slug === slug && row.status !== "draft");
      return { ...link, kind: "event", label: event?.name || event?.title || "Evenement", detail: "Evenement communautaire" };
    }
    return { ...link, kind: "page", label: pageLabels[parts[0] || ""] || "Page KTGA.ME", detail: parts[0] === "patchnotes" && parts[1] ? `Version ${parts[1]}` : "" };
  });
}
