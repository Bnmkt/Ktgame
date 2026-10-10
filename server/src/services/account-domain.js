import { games } from "../games/shared.js";
import { RANKED_GAMES, competitiveFor, equippedRankedBadge } from "./ranked.js";
import { equippedGameTitle, gameProgress, unlockedGameTitles } from "./game-progression.js";
import { mfaSummary } from "./account-security.js";
import { normalizeEmail, validEmail } from "./email-verification.js";
import { activeModeration, activeParentalRevocation, isUnder13, turnsThirteenAt } from "./parental-controls.js";
import { playerAchievementContext, tableTimeMetrics } from "./site-achievements.js";
import { completedMidnightContractCount } from "./result-achievements.js";
import { casinoDateKey, shiftDateKey } from "./time.js";
import { calculateDailyBonusStatus } from "./daily-bonus.js";
import { PlayerProgressCache } from "./player-progress-cache.js";

export const achievementThresholds = {
  gamesPlayed: [1, 5, 50, 200, 1000, 5000, 10000],
  wins: [1, 10, 100, 500, 1000, 5000, 10000],
  staked: [100, 1000, 2000, 5000, 15000, 50000, 100000, 1000000, 10000000],
  dailyClaims: [1, 7, 50, 100, 500],
  dailyStreak: [7, 30, 365],
  gameWins: [1, 10, 50, 100, 500, 1000]
};

export const defaultCosmetics = {
  icons: ["chip"],
  nameEffects: ["none"],
  memberCards: ["default"],
  profileBanners: ["default"],
  profileFrames: ["none"],
  profileEffects: ["none"],
  diceSkins: ["default"],
  cardSkins: ["default"],
  equipped: { icon: "chip", nameEffect: "none", memberCard: "default", profileBanner: "default", profileFrame: "none", profileEffect: "none", diceSkin: "default", cardSkin: "default" }
};

export const shopTypes = ["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"];

export const achievementCompletionId = "achievement-visible-complete";

// The same projections serve in-process game updates and the accounts process.
export function createAccountDomain({ configurationCache, platformSettings, rankedConfig, achievementCatalog, playerStatistics }) {
  const achievementProgressCache = new PlayerProgressCache();
  const memberStatsCache = new PlayerProgressCache();
  const progressionConfig = (db) => platformSettings(db).gameProgression;

  function normalizePublicProfile(profile = {}, fallbackName = "") {
    const birthDate = String(profile.birthDate ?? "").slice(0, 10);
    return {
      displayName: String(profile.displayName ?? fallbackName ?? "").slice(0, 32),
      birthDate: /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : "",
      gender: String(profile.gender ?? "").slice(0, 32),
      bio: normalizePlainText(profile.bio, 180),
      titleGameId: games.some((game) => game.id === profile.titleGameId) ? profile.titleGameId : "",
      titleLevel: Number.isSafeInteger(profile.titleLevel) && profile.titleLevel >= 0 && profile.titleLevel <= 1000 ? profile.titleLevel : 0,
      titleHidden: Boolean(profile.titleHidden),
      rankedBadgeGameId: RANKED_GAMES.includes(profile.rankedBadgeGameId) ? profile.rankedBadgeGameId : "",
      favoriteGames: Array.isArray(profile.favoriteGames) ? [...new Set(profile.favoriteGames.map(String))].slice(0, 5) : []
    };
  }

  function normalizePlainText(value, maxLength = 180) {
    return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n").slice(0, maxLength);
  }

  function ageFromBirthDate(birthDate) {
    if (!birthDate) return "";
    const born = new Date(`${birthDate}T00:00:00.000Z`);
    if (Number.isNaN(born.getTime())) return "";
    const now = new Date();
    let age = now.getUTCFullYear() - born.getUTCFullYear();
    const beforeBirthday = now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age >= 0 && age <= 120 ? age : "";
  }

  function ensureUserSocial(user) {
    user.profile = normalizePublicProfile(user.profile, user.pseudo);
    user.friends = Array.isArray(user.friends) ? [...new Set(user.friends)] : [];
    user.friendRequests = {
      incoming: Array.isArray(user.friendRequests?.incoming) ? [...new Set(user.friendRequests.incoming)] : [],
      outgoing: Array.isArray(user.friendRequests?.outgoing) ? [...new Set(user.friendRequests.outgoing)] : []
    };
    user.roomInvites = Array.isArray(user.roomInvites) ? user.roomInvites : [];
    user.notifications = Array.isArray(user.notifications) ? user.notifications : [];
    user.blockedUsers = Array.isArray(user.blockedUsers) ? [...new Set(user.blockedUsers.map(String))] : [];
    user.mutedUsers = Array.isArray(user.mutedUsers) ? [...new Set(user.mutedUsers.map(String))] : [];
    return user;
  }

  function displayNameFor(user) {
    return normalizePublicProfile(user.profile, user.pseudo).displayName || user.pseudo;
  }

  function friendCodeFor(user) {
    return String(user?.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase();
  }

  function maskedEmail(value) {
    const [local = "", domain = ""] = normalizeEmail(value).split("@");
    if (!domain) return "";
    return `${local.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
  }

  function publicProfileFor(user) {
    const profile = normalizePublicProfile(user.profile, user.pseudo);
    const { birthDate: _birthDate, ...publicProfile } = profile;
    return publicProfile;
  }

  function playerRankedBadge(user, db) {
    if (!user.profile?.rankedBadgeGameId) return null;
    return equippedRankedBadge(user, rankedConfig(db));
  }

  function playerProgression(user, db, includeTitles = false) {
    const config = progressionConfig(db);
    const ranked = rankedConfig(db);
    return games.map((game) => {
      const progress = gameProgress(user, game.id, config);
      return { ...progress, gameName: game.name, ...(RANKED_GAMES.includes(game.id) ? { competitive: competitiveFor(user,game.id,ranked.games[game.id],includeTitles) } : {}), ...(includeTitles ? { unlockedTitles: unlockedGameTitles(config, game.id, progress.highestLevel) } : {}) };
    });
  }

  function playerTitle(user, db) {
    return equippedGameTitle(user, progressionConfig(db), games.map((game) => game.id));
  }

  function serializeUserInternal(user, db) {
    ensureUserSocial(user);
    const verificationRequired = platformSettings(db).emailVerificationRequired;
    const settings = platformSettings(db);
    const moderation = activeModeration(user);
    const parentalRevocation = activeParentalRevocation(user);
    return { rankedBadge: playerRankedBadge(user, db), gameProgression: playerProgression(user, db, true), gameTitle: playerTitle(user, db), id: user.id, login: user.email ?? user.pseudo, email: user.email ?? "", emailVerified: Boolean(user.emailVerifiedAt), requiresEmailUpgrade: !user.guest && !validEmail(user.email), requiresEmailVerification: !user.guest && verificationRequired && validEmail(user.email) && !user.emailVerifiedAt, pseudo: displayNameFor(user), friendCode: friendCodeFor(user), tokens: user.tokens, guest: Boolean(user.guest), admin: Boolean(user.admin), editor: Boolean(user.editor), active: user.active !== false, lastDailyClaim: user.lastDailyClaim, dailyBonus: dailyBonusStatus(user, db), cosmetics: normalizeCosmetics(user.cosmetics), achievements: normalizeAchievements(user.achievements), profileStats: normalizeProfileStats(user.profileStats), profile: user.profile, friendCount: user.friends.length, mfa: mfaSummary(user), minor: isUnder13(user) ? { restricted: true, restrictions: settings.minorRestrictions, turnsThirteenAt: turnsThirteenAt(user.profile?.birthDate) } : null, moderation: moderation ? { type: moderation.type, reason: moderation.reason ?? "", endsAt: moderation.endsAt ?? "" } : null, parentalRevocation: parentalRevocation ? { reason: parentalRevocation.reason ?? "", endsAt: parentalRevocation.revokedUntil } : null };
  }

  function sanitizeFriendUser(user, db) {
    ensureUserSocial(user);
    refreshPublicProfileStats(user, db);
    return { id: user.id, rankedBadge: playerRankedBadge(user, db), gameTitle: playerTitle(user, db), pseudo: displayNameFor(user), friendCode: friendCodeFor(user), age: ageFromBirthDate(user.profile.birthDate), cosmetics: normalizeCosmetics(user.cosmetics), profileStats: normalizeProfileStats(user.profileStats), profile: publicProfileFor(user) };
  }

  function publicUserPayload(user, db, viewerId = "") {
    ensureUserSocial(user);
    refreshPublicProfileStats(user, db);
    const statistics = playerStatistics(db, user.id);
    const wins = statistics.wins;
    const achievements = achievementStatus(user, db);
    const viewer = db.users.find((row) => row.id === viewerId);
    if (viewer) ensureUserSocial(viewer);
    const firstDayKey = shiftDateKey(casinoDateKey(), -364);
    const activityMap = new Map(Object.entries(statistics.activity));
    const activity = [];
    for (let i = 0; i < 365; i += 1) {
      const key = shiftDateKey(firstDayKey, i);
      activity.push({ date: key, count: activityMap.get(key) ?? 0 });
    }
    return {
      id: user.id,
      pseudo: displayNameFor(user),
      friendCode: friendCodeFor(user),
      ranked: RANKED_GAMES.map((gameId)=>({gameId, ...competitiveFor(user,gameId,rankedConfig(db).games[gameId],viewerId===user.id)})),
      gameProgression: playerProgression(user, db).map((row)=>row.competitive && viewerId===user.id ? {...row,competitive:competitiveFor(user,row.gameId,rankedConfig(db).games[row.gameId],true)} : row),
      gameTitle: playerTitle(user, db),
      rankedBadge: playerRankedBadge(user, db),
      cosmetics: normalizeCosmetics(user.cosmetics),
      profileStats: normalizeProfileStats(user.profileStats),
      profile: publicProfileFor(user),
      age: ageFromBirthDate(user.profile.birthDate),
      friendCount: user.friends.length,
      relationship: {
        self: viewerId === user.id,
        isFriend: viewer?.friends?.includes(user.id) ?? false,
        requested: viewer?.friendRequests?.outgoing?.includes(user.id) ?? false,
        incoming: viewer?.friendRequests?.incoming?.includes(user.id) ?? false,
        blocked: viewer?.blockedUsers?.includes(user.id) ?? false,
        muted: viewer?.mutedUsers?.includes(user.id) ?? false
      },
      stats: {
        gamesPlayed: statistics.gamesPlayed,
        wins,
        winRate: statistics.gamesPlayed ? Math.round((wins / statistics.gamesPlayed) * 100) : 0,
        achievementsUnlocked: achievements.filter((achievement) => achievement.unlocked).length,
        achievementsTotal: achievements.length
      },
      activity
    };
  }

  function normalizeCosmetics(cosmetics = {}) {
    return {
      icons: [...new Set([...(cosmetics.icons ?? []), ...defaultCosmetics.icons])],
      nameEffects: [...new Set([...(cosmetics.nameEffects ?? []), ...defaultCosmetics.nameEffects])],
      memberCards: [...new Set([...(cosmetics.memberCards ?? []), ...defaultCosmetics.memberCards])],
      profileBanners: [...new Set([...(cosmetics.profileBanners ?? []), ...defaultCosmetics.profileBanners])],
      profileFrames: [...new Set([...(cosmetics.profileFrames ?? []), ...defaultCosmetics.profileFrames])],
      profileEffects: [...new Set([...(cosmetics.profileEffects ?? []), ...defaultCosmetics.profileEffects])],
      diceSkins: [...new Set([...(cosmetics.diceSkins ?? []), ...defaultCosmetics.diceSkins])],
      cardSkins: [...new Set([...(cosmetics.cardSkins ?? []), ...defaultCosmetics.cardSkins])],
      equipped: { ...defaultCosmetics.equipped, ...(cosmetics.equipped ?? {}) }
    };
  }

  function normalizeAchievements(achievements = {}) {
    return {
      unlocked: [...new Set(achievements.unlocked ?? [])],
      unlockedAt: achievements.unlockedAt ?? {},
      suppressed: [...new Set(achievements.suppressed ?? [])]
    };
  }

  function refreshPublicProfileStats(user, db) {
    if (!user) return user;
    user.profileStats = normalizeProfileStats(user.profileStats);
    user.profileStats.publicStats = publicMemberStats(user, db);
    return user;
  }

  function normalizeProfileStats(profileStats = {}) {
    const legacyCustomId = profileStats.customAchievementId ?? "";
    const defaultVisibleProfileStats = ["age", "gender", "friends", "gamesPlayed", "wins", "winRate", "achievements"];
    return {
      memberCardStats: (Array.isArray(profileStats.memberCardStats) && profileStats.memberCardStats.length ? profileStats.memberCardStats.slice(0, 2) : [profileStats.memberCardStat ?? "winRate", "achievementsUnlocked"]).map((stat) => stat === "overallWinRate" ? "winRate" : stat),
      customAchievementId: legacyCustomId,
      customAchievementIds: Array.isArray(profileStats.customAchievementIds)
        ? [profileStats.customAchievementIds[0] ?? "", profileStats.customAchievementIds[1] ?? ""]
        : [legacyCustomId, ""],
      visibleProfileStats: Array.isArray(profileStats.visibleProfileStats)
        ? profileStats.visibleProfileStats.filter((key) => defaultVisibleProfileStats.includes(key))
        : defaultVisibleProfileStats,
      publicStats: Array.isArray(profileStats.publicStats) ? profileStats.publicStats.slice(0, 2) : []
    };
  }

  function publicMemberStats(user, db) {
    return configurationCache.read(() => {
      const catalog = achievementCatalog(db), progress = userAchievementProgress(user, db), statistics = playerStatistics(db, user.id);
      const achievements = normalizeAchievements(user.achievements), profileStats = normalizeProfileStats(user.profileStats), today = casinoDateKey();
      const input = [achievements.unlocked, achievements.suppressed, profileStats.memberCardStats, profileStats.customAchievementIds, profileStats.customAchievementId, today];
      return memberStatsCache.get(user.id, [catalog, progress, statistics], input, () => calculateMemberStats(catalog, progress, statistics, achievements, profileStats, today));
    });
  }

  function calculateMemberStats(catalog, progress, statistics, achievements, profileStats, today) {
    const persisted = new Set(achievements.unlocked), suppressed = new Set(achievements.suppressed);
    const wins = statistics.wins;
    const todayGames = statistics.activity[today] ?? 0;
    const unlockedCount = catalog.reduce((count, entry) => count + Number(!suppressed.has(entry.id) && (persisted.has(entry.id) || (progress[entry.id] ?? 0) >= entry.target)), 0);
    const ratio = statistics.gamesPlayed ? `${Math.round((wins / statistics.gamesPlayed) * 100)}%` : "0%";
    return profileStats.memberCardStats.map((stat, index) => {
      if (stat === "hidden") return null;
      if (stat === "todayGames") return { key: stat, label: "Aujourd'hui", value: todayGames.toLocaleString("fr-BE") };
      if (stat === "achievementsUnlocked") return { key: stat, label: "Succès", value: `${unlockedCount}/${catalog.length}` };
      if (stat === "customAchievement") {
        const custom = catalog.find((achievement) => achievement.id === (profileStats.customAchievementIds[index] || profileStats.customAchievementId));
        return { key: stat, label: "Milestone", value: custom?.title ?? "Aucun" };
      }
      return { key: stat, label: "Winrate", value: ratio };
    }).filter(Boolean).slice(0, 2);
  }

  function dailyBonusStatus(user, db) {
    const settings = platformSettings(db);
    const baseTokens = settings.dailyTokens;
    if (!user || user.guest) return { claims: 0, streak: 0, multiplier: 1, nextMultiplier: 1, nextReward: baseTokens, claimedToday: false };
    return calculateDailyBonusStatus(playerStatistics(db, user.id).claimDates, baseTokens, new Date(), {
      defaultMultiplier: settings.dailyBonusDefaultMultiplier,
      maxMultiplier: settings.dailyBonusMaxMultiplier,
      rules: settings.dailyBonusRules
    });
  }

  function longestDateStreak(dates) {
    let best = 0;
    let current = 0;
    let previous = null;
    for (const date of dates) {
      const time = new Date(`${date}T00:00:00.000Z`).getTime();
      if (previous === null || time - previous === 86400000) current += 1;
      else current = 1;
      best = Math.max(best, current);
      previous = time;
    }
    return best;
  }

  function cosmeticCount(user) {
    const cosmetics = normalizeCosmetics(user.cosmetics);
    return shopTypes.reduce((sum, key) => sum + cosmetics[key].length, 0);
  }

  function userAchievementProgress(user, db) {
    return configurationCache.read(() => {
      const references = [playerStatistics(db, user.id), achievementCatalog(db), progressionConfig(db)];
      // Include every mutable input read by the calculation, not derived profile stats.
      const accountAgeDays = Math.max(0, Math.floor((Date.now() - (Date.parse(user.createdAt) || Date.now())) / 86400000));
      const input = [user.tokens, user.createdAt, accountAgeDays, user.cosmetics, user.achievements, user.achievementProgress,
        user.gameXp, user.siteActivity, user.profile?.favoriteGames, user.friends?.length];
      return achievementProgressCache.get(user.id, references, input, () => calculateAchievementProgress(user, db));
    });
  }

  function calculateAchievementProgress(user, db) {
    const statistics = playerStatistics(db, user.id);
    const { staked, shopSpent, claimDates: dates, resultIds } = statistics;
    const cosmetics = normalizeCosmetics(user.cosmetics);
    const ownedCount = shopTypes.reduce((sum, key) => sum + cosmetics[key].length, 0);
    const cosmeticTypes = ["icons", "nameEffects", "memberCards", "diceSkins", "cardSkins"].filter((key) => cosmetics[key].length > 1).length;
    const dailyStreak = longestDateStreak(dates);
    const progress = {};
    for (const value of achievementThresholds.gamesPlayed) progress[`classic-games-${value}`] = statistics.gamesPlayed;
    for (const value of achievementThresholds.wins) progress[`classic-wins-${value}`] = statistics.wins;
    for (const value of achievementThresholds.staked) progress[`classic-staked-${value}`] = staked;
    for (const value of achievementThresholds.dailyClaims) progress[`classic-daily-${value}`] = dates.length;
    for (const value of achievementThresholds.dailyStreak) progress[`classic-daily-streak-${value}`] = dailyStreak;
    for (const game of games) {
      const gameWins = statistics.gameWins[game.id] ?? 0;
      for (const value of achievementThresholds.gameWins) progress[`game-${game.id}-wins-${value}`] = gameWins;
    }
    progress["shop-first-purchase"] = statistics.shopPurchases ? 1 : 0;
    progress["shop-collector-10"] = ownedCount;
    progress["shop-collector-25"] = ownedCount;
    progress["shop-fashionista"] = cosmeticTypes;
    progress["shop-big-spender"] = shopSpent;
    for (const id of resultIds) progress[id] = 1;
    progress["midnight-all-contracts"] = completedMidnightContractCount(resultIds);
    const metricValues = {
      ...Object.fromEntries(Object.keys(tableTimeMetrics).map((key) => [key, Number(user.siteActivity?.[key]) || 0])),
      ...playerAchievementContext(user, []),
      gamesPlayed: statistics.gamesPlayed,
      wins: statistics.wins,
      staked,
      dailyClaims: dates.length,
      dailyStreak,
      shopPurchases: statistics.shopPurchases,
      shopSpent,
      cosmeticCount: ownedCount,
      cosmeticTypes,
      midnightContractsCompleted: completedMidnightContractCount(resultIds)
    };
    for (const [gameId, wins] of Object.entries(statistics.gameWins)) metricValues[`gameWins.${gameId}`] = wins;
    const config = progressionConfig(db);
    const progression = games.map((game) => gameProgress(user, game.id, config));
    metricValues.highestGameLevel = Math.max(1, ...progression.map((row) => row.highestLevel));
    metricValues.totalGameXp = progression.reduce((total, row) => total + row.xp, 0);
    for (const row of progression) { metricValues[`gameLevel.${row.gameId}`] = row.highestLevel; metricValues[`gameCurrentLevel.${row.gameId}`] = row.level; metricValues[`gameMastery.${row.gameId}`] = row.mastery; metricValues[`gameXp.${row.gameId}`] = row.xp; }
    for (const entry of achievementCatalog(db)) {
      if (entry.rule?.source === "metric" && metricValues[entry.rule.metric] !== undefined) progress[entry.id] = metricValues[entry.rule.metric];
      if (entry.rule?.legacyResultId && resultIds.includes(entry.rule.legacyResultId)) progress[entry.id] = Math.max(progress[entry.id] ?? 0, 1);
      if (user.achievementProgress?.[entry.id]) progress[entry.id] = Math.max(progress[entry.id] ?? 0, Number(user.achievementProgress[entry.id].value) || 0);
    }
    for (const id of normalizeAchievements(user.achievements).unlocked) progress[id] = Math.max(progress[id] ?? 0, 1);
    const catalog = achievementCatalog(db);
    const normalizedAchievements = normalizeAchievements(user.achievements);
    const persisted = new Set(normalizedAchievements.unlocked);
    const suppressed = new Set(normalizedAchievements.suppressed);
    const isComplete = (entry) => !suppressed.has(entry.id) && (persisted.has(entry.id) || (progress[entry.id] ?? 0) >= entry.target);
    const countedUnlocked = catalog.filter((entry) => !["achievement-collector-50", achievementCompletionId].includes(entry.id) && isComplete(entry)).length;
    progress["achievement-collector-50"] = countedUnlocked;
    progress[achievementCompletionId] = catalog.filter((entry) => entry.id !== achievementCompletionId && isComplete(entry)).length;
    return progress;
  }

  function achievementStatus(user, db) {
    const achievements = normalizeAchievements(user.achievements);
    const progress = userAchievementProgress(user, db);
    return achievementCatalog(db).map((entry) => {
      const { rule: _rule, builtIn: _builtIn, enabled: _enabled, ...publicEntry } = entry;
      const value = progress[entry.id] ?? 0;
      const suppressed = achievements.suppressed.includes(entry.id);
      const unlocked = !suppressed && (achievements.unlocked.includes(entry.id) || value >= entry.target);
      return { ...publicEntry, description: entry.secret && !unlocked ? "Succès secret" : entry.description, progress: Math.min(value, entry.target), unlocked, suppressed, unlockedAt: achievements.unlockedAt[entry.id] ?? null };
    });
  }

  function sanitizeNotification(notification, user = null) {
    const roomInvite = notification.type === "room-invite"
      ? user?.roomInvites?.find((invite) => invite.code === notification.roomCode && (!notification.actorId || invite.fromId === notification.actorId))
      : null;
    let title = notification.title ?? "Notification";
    let message = notification.message ?? "";
    if (notification.type === "room-invite") {
      title = "Invitation à une table";
      message = message.replace(" t'invite sur ", " t'invite à la table ");
    }
    if (notification.type === "achievement" && title === "Succès débloqué") {
      const [achievementTitle, ...descriptionParts] = message.split(" · ");
      const entry = achievementCatalog().find((achievement) => achievement.title === achievementTitle);
      title = `${entry?.group ?? "Casino"} - ${achievementTitle}`;
      message = descriptionParts.join(" · ") || entry?.description || "";
    }
    return {
      id: notification.id,
      type: notification.type ?? "info",
      title,
      message,
      actorId: notification.actorId ?? "",
      roomCode: notification.roomCode ?? "",
      inviteId: roomInvite?.id ?? "",
      createdAt: notification.createdAt
    };
  }

  return { normalizePublicProfile, normalizePlainText, ageFromBirthDate, ensureUserSocial, displayNameFor, friendCodeFor, maskedEmail, publicProfileFor, playerRankedBadge, playerProgression, playerTitle, serializeUserInternal, sanitizeFriendUser, publicUserPayload, normalizeCosmetics, normalizeAchievements, refreshPublicProfileStats, normalizeProfileStats, publicMemberStats, calculateMemberStats, dailyBonusStatus, longestDateStreak, cosmeticCount, userAchievementProgress, calculateAchievementProgress, achievementStatus, sanitizeNotification, achievementProgressCache, memberStatsCache };
}
