export const PRIVACY_VERSION = "2026-09-27";
export const CONSENT_DAYS = 180;
export const sitePages = { lobby: "Accueil", profile: "Profil", shop: "Boutique", leaderboard: "Classements", room: "Table", spectator: "Spectateur", event: "Evenement", admin: "Administration" };
export const browserFamilies = { firefox: "Firefox", edge: "Edge", chrome: "Chrome", safari: "Safari", other: "Autre" };
export const tableTimeMetrics = {
  tableActiveSeconds: "Temps actif cumule aux tables (secondes)",
  roundActiveSeconds: "Temps actif cumule en manches (secondes)",
  longestTableSeconds: "Plus long temps actif sur une table (secondes)",
  longestRoundSeconds: "Plus long temps actif dans une manche (secondes)"
};

export function tableActivityContext(room, userId) {
  if (!room?.players?.some((player) => player.id === userId && !player.isBot)) return null;
  const playing = !!room.state && !room.finished && !room.state.finished;
  const roundNumber = playing ? (room.state.handNumber ?? room.state.round ?? 1) : 0;
  return { roomId: room.id, gameId: room.gameId, phase: playing ? "playing" : room.state ? "finished" : "waiting", roundNumber,
    roundKey: playing ? `${room.activityMatchId ?? room.createdAt}:${roundNumber}` : "" };
}
const slots = { icons: "icon", nameEffects: "nameEffect", memberCards: "memberCard", profileBanners: "profileBanner", profileFrames: "profileFrame", profileEffects: "profileEffect", diceSkins: "diceSkin", cardSkins: "cardSkin" };
export const playerContextFields = {
  "player.tokens": "Joueur : solde de jetons", "player.accountAgeDays": "Joueur : anciennete en jours",
  "player.ownedItemIds": "Inventaire : objets possedes", "player.equippedItemIds": "Inventaire : objets equipes",
  "player.inventoryCount": "Inventaire : nombre d'objets", "player.favoriteGameIds": "Joueur : jeux favoris",
  "player.friendCount": "Joueur : nombre d'amis", "player.achievementIds": "Joueur : succes debloques",
  "player.gameLevel": "Joueur : niveau dans le jeu courant", "player.gameXp": "Joueur : XP dans le jeu courant", "player.highestGameLevel": "Joueur : plus haut niveau", "player.totalGameXp": "Joueur : XP totale"
};

export function playerAchievementContext(user, shop, now = Date.now()) {
  const cosmetics = user.cosmetics ?? {};
  const owned = shop.filter((item) => Array.isArray(cosmetics[item.type]) && cosmetics[item.type].includes(item.value));
  return {
    tokens: Number(user.tokens) || 0,
    achievementIds: [...new Set(user.achievements?.unlocked ?? [])].filter((id) => typeof id === "string"),
    accountAgeDays: Math.max(0, Math.floor((now - (Date.parse(user.createdAt) || now)) / 86400000)),
    ownedItemIds: owned.map((item) => item.id),
    equippedItemIds: owned.filter((item) => cosmetics.equipped?.[slots[item.type]] === item.value).map((item) => item.id),
    inventoryCount: Object.keys(slots).reduce((n, key) => n + (Array.isArray(cosmetics[key]) ? cosmetics[key].length : 0), 0),
    favoriteGameIds: (user.profile?.favoriteGames ?? []).slice(0, 5), friendCount: user.friends?.length ?? 0
  };
}

export function browserFamily(ua = "") {
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS/i.test(ua)) return "chrome";
  return /Safari/i.test(ua) ? "safari" : "other";
}

export function validActivityConsent(user, now = Date.now()) {
  const value = user?.privacyConsent;
  return value?.version === PRIVACY_VERSION && value.enabled === true && value.ageConfirmed === true && Date.parse(value.expiresAt) > now;
}

export function setActivityConsent(user, input, now = Date.now()) {
  const chosenAt = Number(input.chosenAt);
  if (input.version !== PRIVACY_VERSION || !Number.isFinite(chosenAt) || chosenAt > now + 60000 || chosenAt < now - CONSENT_DAYS * 86400000) throw new Error("Choix expire : veuillez le renouveler.");
  if (chosenAt < (user.privacyConsent?.chosenAt ?? 0)) throw new Error("Un choix plus recent existe deja pour ce compte.");
  if (input.enabled === true && input.ageConfirmed !== true) throw new Error("Le suivi facultatif necessite une confirmation d'age (13 ans minimum).");
  if (input.enabled === true && user.registrationAuthorization?.ageBand === "under13") throw new Error("Le suivi facultatif reste desactive pour ce compte mineur.");
  if (input.enabled === true && user.profile?.birthDate) {
    const minimum = new Date(now); minimum.setUTCFullYear(minimum.getUTCFullYear() - 13);
    if (new Date(user.profile.birthDate) > minimum) throw new Error("Le suivi facultatif n'est pas disponible avant 13 ans.");
  }
  user.privacyConsent = { version: PRIVACY_VERSION, enabled: input.enabled === true, ageConfirmed: input.ageConfirmed === true, chosenAt, expiresAt: new Date(chosenAt + CONSENT_DAYS * 86400000).toISOString() };
  if (!user.privacyConsent.enabled) delete user.siteActivity;
  return user.privacyConsent;
}

// Only administrator-declared game markers are read, never arbitrary URL values.
export function allowedUrlMarkers(catalog) {
  const values = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.field === "markers" && ["contains", "containsAny", "containsAll"].includes(node.operator)) {
      for (const value of Array.isArray(node.value) ? node.value : [node.value]) if (/^(secret|challenge):[a-z0-9-]{1,48}$/.test(value)) values.add(value);
    }
    for (const child of node.all ?? node.any ?? []) walk(child);
    if (node.not) walk(node.not);
  };
  for (const entry of catalog) if (entry.enabled !== false && entry.rule?.event === "site.visit") walk(entry.rule.condition);
  return [...values].slice(0, 100);
}

export function createSiteActivityTracker() {
  const sessions = new Map();
  return {
    forget(id) { sessions.delete(id); },
    record(user, input, ua, markers, now = Date.now(), table = null) {
      if (!validActivityConsent(user, now)) throw new Error("Le suivi facultatif est desactive.");
      if (!Object.hasOwn(sitePages, input.page)) throw new Error("Page inconnue.");
      const previous = sessions.get(user.id);
      if (previous && now - previous.at < 5000) return [];
      if (sessions.size >= 10000) for (const [id, session] of sessions) if (now - session.at > 90000) sessions.delete(id);
      if (sessions.size >= 10000 && !previous) return [];
      const elapsed = previous ? now - previous.at : 0;
      const seconds = elapsed >= 5000 && elapsed <= 45000 ? Math.floor(elapsed / 1000) : 0;
      const safeMarkers = Array.isArray(input.markers) ? [...new Set(input.markers.filter((value) => markers.includes(value)))].slice(0, 10) : [];
      const day = new Date(now).toISOString().slice(0, 10);
      const visit = !previous || elapsed > 90000 || previous.page !== input.page || previous.markers !== safeMarkers.join(",") || user.siteActivity?.lastDay !== day;
      sessions.set(user.id, { at: now, page: input.page, markers: safeMarkers.join(","), roomId: table?.roomId, roundKey: table?.roundKey });
      const stats = user.siteActivity ??= { activeSeconds: 0, visitDays: 0, pages: [] };
      stats.activeSeconds += seconds;
      if (stats.lastDay !== day) { stats.visitDays++; stats.lastDay = day; }
      if (!stats.pages.includes(input.page)) stats.pages.push(input.page);
      const payload = { page: input.page, browser: browserFamily(ua), markers: safeMarkers, seconds, activeSeconds: stats.activeSeconds, visitDays: stats.visitDays, pageCount: stats.pages.length };
      const events = [...(visit ? [{ type: "site.visit", payload }] : []), ...(seconds ? [{ type: "site.activity", payload }] : [])];
      if (table) {
        // Keep one table/round cursor, never a growing per-room history.
        if (stats.table?.id !== table.roomId) stats.table = { id: table.roomId, seconds: 0, roundKey: "", roundSeconds: 0 };
        if (stats.table.roundKey !== table.roundKey) { stats.table.roundKey = table.roundKey; stats.table.roundSeconds = 0; }
        const tableSeconds = previous?.roomId === table.roomId ? seconds : 0;
        const roundSeconds = table.roundKey && previous?.roomId === table.roomId && previous?.roundKey === table.roundKey ? seconds : 0;
        stats.table.seconds += tableSeconds;
        stats.table.roundSeconds += roundSeconds;
        stats.tableActiveSeconds = (stats.tableActiveSeconds ?? 0) + tableSeconds;
        stats.roundActiveSeconds = (stats.roundActiveSeconds ?? 0) + roundSeconds;
        stats.longestTableSeconds = Math.max(stats.longestTableSeconds ?? 0, stats.table.seconds);
        stats.longestRoundSeconds = Math.max(stats.longestRoundSeconds ?? 0, stats.table.roundSeconds);
        const timing = { gameId: table.gameId, roomId: table.roomId, phase: table.phase, roundNumber: table.roundNumber, tableSeconds: stats.table.seconds, roundSeconds: stats.table.roundSeconds, tableActiveSeconds: stats.tableActiveSeconds, roundActiveSeconds: stats.roundActiveSeconds };
        if (tableSeconds) events.push({ type: "table.activity", payload: { ...timing, seconds: tableSeconds } });
        if (roundSeconds) events.push({ type: "game.round.activity", payload: { ...timing, seconds: roundSeconds } });
      }
      return events;
    }
  };
}
