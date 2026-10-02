import { useEffect, useState } from "react";
import { Pagination } from "../components/feedback/Feedback.jsx";
import { usePagination } from "../components/common/usePagination.js";
import { DailyActivityChart } from "../components/profile/DailyActivityChart.jsx";
export { DailyActivityChart } from "../components/profile/DailyActivityChart.jsx";
import { Activity, BadgeCheck, Boxes, CalendarDays, Check, Coins, Eye, EyeOff, Flag, Gem, KeyRound, Mail, Percent, ReceiptText, Search, Shield, ShoppingBag, Sparkles, Trophy, User, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { api, setToken } from "../api.js";
import { Wardrobe } from "../components/profile/Wardrobe.jsx";
import { AccountSecurity } from "../components/profile/AccountSecurity.jsx";
import { ReportPlayerDialog } from "../components/profile/ReportPlayerDialog.jsx";
import { ConfirmActionButton } from "../components/common/ConfirmAction.jsx";
import { Die, PlayingCard } from "../components/game/GamePieces.jsx";
import { CosmeticPreview, DisplayName, FriendCode, ProfileCosmeticEffect, ProfileCosmeticFrame, ProfileCosmeticShell, profileCosmeticClassName, shopTypeLabel } from "../components/cosmetics/Cosmetics.jsx";
import { memberCardOptions, publicProfileStatOptions } from "../config/site.js";
import { gameTitle } from "../features/games/config.js";
import { CompactNumber, achievementTypeLabel, ageFromBirthDate, formatDate, formatExactNumber, memberCardStats, memberStatOptions, shopCategoryLabel, transactionLabel } from "../utils/presentation.jsx";
import { shopPackDefinitions } from "../utils/shop-packs.js";

function packDiscountPercent(count) {
  return Math.min(35, Math.max(0, count - 1) * 5);
}

function useLedgerPage(kind, filters, count, step, revision, enabled, onError) {
  const [page, setPage] = useState({ rows: [], total: 0, hasMore: false });
  const [loading, setLoading] = useState(false);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const offset = count - step;
    const query = new URLSearchParams({ ...JSON.parse(filterKey), paged: "1", limit: String(step), offset: String(offset) });
    setLoading(true);
    if (!offset) setPage({ rows: [], total: 0, hasMore: false });
    const timer = setTimeout(() => {
      api(`/api/${kind}?${query}`).then((result) => {
        if (active) setPage((previous) => ({ ...result, rows: offset ? [...new Map([...previous.rows, ...result.rows].map((row) => [row.id, row])).values()] : result.rows }));
      }).catch((error) => { if (active) onError(error.message); }).finally(() => { if (active) setLoading(false); });
    }, filters.search ? 200 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, filterKey, count, step, revision, enabled, onError]);
  return { ...page, loading };
}

function ProfilePlayerChip({ player, winner }) {
  const name = player?.pseudo || player?.profile?.displayName || "Joueur";
  return <span className={`admin-player-chip ${winner ? "winner" : ""} ${player?.isBot ? "bot" : ""}`} title={`${name}${player?.isBot ? " · IA" : ""}${winner ? " · vainqueur" : ""}`}><i>{player?.isBot ? "IA" : name.slice(0, 1).toUpperCase()}</i><b>{name}</b>{winner && <em>Gagnant</em>}</span>;
}

function ProfileParticipantList({ players = [], winners = [] }) {
  const visible = players.slice(0, 4);
  const remaining = players.slice(4);
  return <div className="admin-participants"><span className="admin-participants-label">{players.length} participant{players.length > 1 ? "s" : ""}</span><div className="admin-participant-preview">{visible.map((player) => <ProfilePlayerChip key={player.id} player={player} winner={winners.includes(player.id)} />)}{remaining.length > 0 && <details><summary>+{remaining.length}</summary><div>{remaining.map((player) => <ProfilePlayerChip key={player.id} player={player} winner={winners.includes(player.id)} />)}</div></details>}</div></div>;
}

export function Profile({ user, setUser, mode = "profile", onOpenShop, onAchievements }) {
  const isShop = mode === "shop";
  const [tab, setTab] = useState(isShop ? "shop" : "account");
  const [accountSubtab, setAccountSubtab] = useState("details");
  const [form, setForm] = useState({ login: user.login ?? user.pseudo, displayName: user.profile?.displayName ?? user.pseudo, birthDate: user.profile?.birthDate ?? "", gender: user.profile?.gender ?? "", bio: user.profile?.bio ?? "", password: "" });
  const [statForm, setStatForm] = useState({ memberCardStats: user.profileStats?.memberCardStats ?? [user.profileStats?.memberCardStat ?? "winRate", "achievementsUnlocked"], customAchievementIds: user.profileStats?.customAchievementIds ?? [user.profileStats?.customAchievementId ?? "", ""], visibleProfileStats: user.profileStats?.visibleProfileStats ?? publicProfileStatOptions.map(([key]) => key) });
  const [statistics, setStatistics] = useState(null);
  const [ledgerRevision, setLedgerRevision] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [games, setGames] = useState([]);
  const [favorites, setFavorites] = useState(user.profile?.favoriteGames ?? []);
  const [publicProfile, setPublicProfile] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [achievementType, setAchievementType] = useState("games");
  const [shop, setShop] = useState([]);
  const [shopMode, setShopMode] = useState("items");
  const [shopType, setShopType] = useState("icons");
  const [shopCategory, setShopCategory] = useState("classic");
  const [previewItemId, setPreviewItemId] = useState("");
  const [packTheme, setPackTheme] = useState("japanese-traditional");
  const [packSelection, setPackSelection] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({ search: "", game: "all", result: "all" });
  const [transactionFilters, setTransactionFilters] = useState({ search: "", game: "all", event: "all", direction: "all" });
  const [historyLimit, setHistoryLimit] = useState(40);
  const [transactionLimit, setTransactionLimit] = useState(60);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [purchaseConfirmation, setPurchaseConfirmation] = useState(null);
  const [purchasePending, setPurchasePending] = useState(false);
  const [smallRockOpen, setSmallRockOpen] = useState(false);
  const [smallRockStartedAt, setSmallRockStartedAt] = useState(0);
  const [smallRockNow, setSmallRockNow] = useState(Date.now());
  const [smallRockMessage, setSmallRockMessage] = useState("");
  const [smallRockUnlocked, setSmallRockUnlocked] = useState(false);
  const historyPage = useLedgerPage("history", historyFilters, historyLimit, 40, ledgerRevision, tab === "history", setError);
  const searchReasons = (statistics?.transactionReasons ?? []).filter((reason) => transactionLabel(reason).toLowerCase().includes(transactionFilters.search.trim().toLowerCase())).join(",");
  const transactionPage = useLedgerPage("transactions", { ...transactionFilters, searchReasons }, transactionLimit, 60, ledgerRevision, tab === "transactions", setError);
  const history = historyPage.rows;
  const transactions = transactionPage.rows;

  useEffect(() => {
    api("/api/achievements").then(setAchievements).catch((err) => setError(err.message));
    api("/api/shop").then(setShop).catch((err) => setError(err.message));
    api("/api/games").then(setGames).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    api("/api/me/statistics").then((result) => { if (active) setStatistics(result); }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [user.id, user.tokens, ledgerRevision]);

  useEffect(() => {
    if (!smallRockOpen) return undefined;
    setSmallRockNow(Date.now());
    const interval = setInterval(() => setSmallRockNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [smallRockOpen]);

  async function reloadLedger() {
    setTransactionLimit(60);
    setLedgerRevision((value) => value + 1);
    api("/api/achievements").then(setAchievements).catch(() => {});
  }

  async function saveProfile() {
    setError("");
    setMessage("");
    try {
      const updated = await api("/api/me", { method: "PATCH", body: JSON.stringify({ ...form, ...statForm }) });
      if (updated.sessionToken) setToken(updated.sessionToken);
      setUser(updated);
      setForm({ login: updated.login ?? updated.pseudo, displayName: updated.profile?.displayName ?? updated.pseudo, birthDate: updated.profile?.birthDate ?? "", gender: updated.profile?.gender ?? "", bio: updated.profile?.bio ?? "", password: "" });
      setFavorites(updated.profile?.favoriteGames ?? []);
      setStatForm({ memberCardStats: updated.profileStats?.memberCardStats ?? ["winRate", "achievementsUnlocked"], customAchievementIds: updated.profileStats?.customAchievementIds ?? [updated.profileStats?.customAchievementId ?? "", ""], visibleProfileStats: updated.profileStats?.visibleProfileStats ?? publicProfileStatOptions.map(([key]) => key) });
      setMessage("Profil mis à jour.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEmail() {
    setError("");
    setMessage("");
    try {
      const result = await api("/api/me/email", { method: "POST", body: JSON.stringify({ email: form.login }) });
      if (result.token) setToken(result.token);
      if (result.user) {
        setUser(result.user);
        setForm((current) => ({ ...current, login: result.user.login ?? form.login }));
      }
      setMessage("Adresse enregistrée. Un email de vérification vient d’être envoyé.");
    } catch (err) { setError(err.message); }
  }

  async function savePublicInfo() {
    setError("");
    setMessage("");
    try {
      const updated = await api("/api/me", { method: "PATCH", body: JSON.stringify({ ...form, favoriteGames: favorites, ...statForm }) });
      if (updated.sessionToken) setToken(updated.sessionToken);
      setUser(updated);
      setForm({ login: updated.login ?? updated.pseudo, displayName: updated.profile?.displayName ?? updated.pseudo, birthDate: updated.profile?.birthDate ?? "", gender: updated.profile?.gender ?? "", bio: updated.profile?.bio ?? "", password: "" });
      setFavorites(updated.profile?.favoriteGames ?? []);
      setStatForm({ memberCardStats: updated.profileStats?.memberCardStats ?? ["winRate", "achievementsUnlocked"], customAchievementIds: updated.profileStats?.customAchievementIds ?? [updated.profileStats?.customAchievementId ?? "", ""], visibleProfileStats: updated.profileStats?.visibleProfileStats ?? publicProfileStatOptions.map(([key]) => key) });
      setMessage("Paramètres mis à jour.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function openPublicProfile(id) {
    setError("");
    try {
      setPublicProfile(await api(`/api/users/${id}/public`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function requestFriendFromProfileModal(userId) {
    await api("/api/friends/request", { method: "POST", body: JSON.stringify({ userId }) });
    await openPublicProfile(userId);
  }

  function toggleFavorite(gameId) {
    setFavorites((list) => {
      if (list.includes(gameId)) return list.filter((id) => id !== gameId);
      if (list.length >= 5) return list;
      return [...list, gameId];
    });
  }

  async function purchase(itemId) {
    setError("");
    setMessage("");
    try {
      const result = await api("/api/shop/purchase", { method: "POST", body: JSON.stringify({ itemId }) });
      const updated = result.user ?? result;
      setUser(updated);
      onAchievements?.(result.achievementUnlocks ?? []);
      await reloadLedger();
      setMessage("Élément débloqué et équipé.");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  function selectPackTheme(nextTheme) {
    setPackTheme(nextTheme);
    const available = shop.filter((item) => item.packs?.includes(nextTheme) && !item.rewardOnly && !user.cosmetics?.[item.type]?.includes(item.value));
    setPackSelection(available.map((item) => item.id));
    setPreviewItemId(available[0]?.id ?? "");
  }

  function openPackShop() {
    setShopMode("packs");
    selectPackTheme(packTheme);
  }

  function togglePackItem(item) {
    if (user.cosmetics?.[item.type]?.includes(item.value)) return;
    setPackSelection((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
    setPreviewItemId(item.id);
  }

  async function purchasePack() {
    setError("");
    setMessage("");
    try {
      const result = await api("/api/shop/purchase-pack", { method: "POST", body: JSON.stringify({ packId: effectivePackTheme, itemIds: selectedPackItems.map((item) => item.id) }) });
      setUser(result.user);
      setPackSelection([]);
      onAchievements?.(result.achievementUnlocks ?? []);
      await reloadLedger();
      setMessage(`Pack débloqué avec ${result.pricing?.discountPercent ?? 0}% de réduction.`);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function confirmPurchase() {
    if (!purchaseConfirmation || purchasePending) return;
    setPurchasePending(true);
    const completed = purchaseConfirmation.kind === "item"
      ? await purchase(purchaseConfirmation.item.id)
      : await purchasePack();
    setPurchasePending(false);
    if (completed) setPurchaseConfirmation(null);
  }

  async function openSmallRock() {
    setSmallRockOpen(true);
    setSmallRockMessage("");
    try {
      const result = await api("/api/secrets/small-rock/start", { method: "POST" });
      setSmallRockStartedAt(Number(result.startedAt) || Date.now());
      setSmallRockUnlocked(Boolean(result.unlocked));
      setSmallRockNow(Date.now());
    } catch (err) {
      setSmallRockMessage(err.message);
    }
  }

  async function touchSmallRock() {
    setSmallRockMessage("");
    try {
      const result = await api("/api/secrets/small-rock/claim", { method: "POST" });
      setSmallRockUnlocked(true);
      setSmallRockMessage("La pierre répond. Quelque chose t’observe depuis l’autre côté.");
      onAchievements?.(result.unlocked ?? []);
      setAchievements(await api("/api/achievements"));
    } catch (err) {
      setSmallRockMessage(err.message);
      if (err.message.includes("recommence")) {
        const restarted = await api("/api/secrets/small-rock/start", { method: "POST" }).catch(() => null);
        if (restarted?.startedAt) setSmallRockStartedAt(Number(restarted.startedAt));
      }
    }
  }

  const totalWon = statistics?.credits ?? 0;
  const totalStaked = statistics?.debits ?? 0;
  const shopSpent = statistics?.shopSpent ?? 0;
  const dailyClaims = statistics?.dailyClaims ?? 0;
  const bonusStreak = user.dailyBonus?.streak ?? 0;
  const todayGames = statistics?.todayGames ?? 0;
  const wins = statistics?.wins ?? 0;
  const gamesPlayed = statistics?.gamesPlayed ?? 0;
  const displayedStats = memberCardStats({ ...user, statistics }, history, achievements);
  const shopTypes = ["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"];
  const shopCategoryOrder = ["classic", "premium", "premiumShape", "premiumAnimated"];
  const availableShopCategories = shopCategoryOrder.filter((category) => shop.some((item) => item.type === shopType && item.category === category));
  const effectiveShopCategory = availableShopCategories.includes(shopCategory) ? shopCategory : availableShopCategories[0];
  const filteredShop = shop.filter((item) => item.type === shopType && item.category === effectiveShopCategory);
  const shopPages = usePagination(filteredShop, `${shopType}:${effectiveShopCategory}`, 12);
  const previewItem = shop.find((item) => item.id === previewItemId) ?? shopPages.rows[0];
  const packDefinitions = shopPackDefinitions(shop);
  const availablePackThemes = Object.keys(packDefinitions);
  const effectivePackTheme = availablePackThemes.includes(packTheme) ? packTheme : availablePackThemes[0];
  const packItems = shop.filter((item) => item.packs?.includes(effectivePackTheme)).sort((left, right) => shopTypes.indexOf(left.type) - shopTypes.indexOf(right.type));
  const packPages = usePagination(packItems, effectivePackTheme, 12);
  const selectedPackItems = packItems.filter((item) => packSelection.includes(item.id) && !user.cosmetics?.[item.type]?.includes(item.value));
  const packPreviewItem = shop.find((item) => item.id === previewItemId && item.packs?.includes(effectivePackTheme)) ?? packItems[0];
  const packSubtotal = selectedPackItems.reduce((sum, item) => sum + item.price, 0);
  const packDiscount = packDiscountPercent(selectedPackItems.length);
  const packTotal = Math.ceil(packSubtotal * (100 - packDiscount) / 100);
  const historyGameIds = statistics?.gameIds ?? [];
  const filteredHistory = history;
  const transactionGameIds = statistics?.transactionGameIds ?? [];
  const transactionEvents = [...(statistics?.transactionReasons ?? [])].sort((left, right) => transactionLabel(left).localeCompare(transactionLabel(right), "fr"));
  const filteredTransactions = transactions;
  const historyRows = history;
  const transactionRows = transactions;
  const unlockedAchievements = achievements.filter((achievement) => achievement.unlocked);
  const milestoneAchievements = achievements.filter((achievement) => achievement.milestone && achievement.unlocked);
  const achievementTypes = ["games", "milestones", "secrets", "shop"];
  const [selectedAchievementGame, setSelectedAchievementGame] = useState("Tous");
  const shownAchievements = achievements.filter((achievement) => achievementType === "milestones" ? achievement.milestone : achievementType === "secrets" ? achievement.secret : achievementType === "shop" ? achievement.categories?.includes("Boutique") || achievement.group === "Boutique" : !(achievement.categories?.includes("Boutique") || achievement.group === "Boutique") && !achievement.secret);
  const achievementGameFilters = [...new Set(shownAchievements.map((achievement) => achievement.gameId).filter(Boolean))].sort((a, b) => gameTitle(a).localeCompare(gameTitle(b), "fr"));
  const effectiveAchievementGame = selectedAchievementGame === "Tous" || achievementGameFilters.includes(selectedAchievementGame) ? selectedAchievementGame : "Tous";
  const filteredAchievements = shownAchievements.filter((achievement) => effectiveAchievementGame === "Tous" || achievement.gameId === effectiveAchievementGame).sort((a, b) => Number(b.milestone) - Number(a.milestone) || Number(b.unlocked) - Number(a.unlocked) || ((b.progress / Math.max(1, b.target)) - (a.progress / Math.max(1, a.target))) || a.title.localeCompare(b.title, "fr"));
  const unlockedShownAchievements = filteredAchievements.filter((achievement) => achievement.unlocked);
  const achievementGroups = filteredAchievements.reduce((groups, achievement) => {
    groups[achievement.group] = [...(groups[achievement.group] ?? []), achievement];
    return groups;
  }, {});



  const smallRockElapsed = Math.max(0, smallRockNow - smallRockStartedAt);
  const smallRockSeconds = Math.floor(smallRockElapsed / 1000);
  const smallRockClock = `${String(Math.floor(smallRockSeconds / 60)).padStart(2, "0")}:${String(smallRockSeconds % 60).padStart(2, "0")}`;

  return (
    <main className={`app-shell ${isShop ? "shop-shell" : "profile-shell"}`}>
      <div className="page-heading"><div><span className="eyebrow">{isShop ? "Collections" : "Espace personnel"}</span><h1>{isShop ? "Boutique" : `Profil de ${user.pseudo}`}</h1></div></div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <div className={isShop ? "shop-page-layout" : "profile-layout"}>
        {!isShop && <aside className="profile-card">
          <ProfileCosmeticShell user={user}><div className={`vip-card member-${user.cosmetics?.equipped?.memberCard ?? "default"}`}>
            <span className="vip-label">{memberCardOptions[user.cosmetics?.equipped?.memberCard ?? "default"]} · {user.guest ? "Pass invité" : "Carte membre"}</span>
            <strong><DisplayName user={user} /></strong>
            <FriendCode code={user.friendCode} />
            <div className="vip-stats">{displayedStats.map((stat, index) => <div className="vip-ratio" key={`${stat.label}-${index}`}>{stat.icon}<span>{stat.label}</span><strong title={stat.exactValue ?? String(stat.value)}>{stat.value}</strong></div>)}</div>
          </div></ProfileCosmeticShell>
          <div className="profile-stats">
            <div><span>Parties</span><strong><CompactNumber value={gamesPlayed} label="Nombre exact de parties" /></strong></div>
            <div><span>Victoires</span><strong><CompactNumber value={wins} label="Nombre exact de victoires" /></strong></div>
            <div><span>Winrate</span><strong>{gamesPlayed ? `${Math.round((wins / gamesPlayed) * 100)}%` : "0%"}</strong></div>
            <div><span>Aujourd'hui</span><strong><CompactNumber value={todayGames} label="Parties jouées aujourd’hui" /></strong></div>
            <div><span>Succès</span><strong title={`${formatExactNumber(unlockedAchievements.length)} succès sur ${formatExactNumber(achievements.length)}`}><CompactNumber value={unlockedAchievements.length} />/<CompactNumber value={achievements.length} /></strong></div>
            <div><span>Bonus</span><strong><CompactNumber value={dailyClaims} label="Bonus réclamés" /></strong></div>
            <div><span>Série bonus</span><strong><CompactNumber value={bonusStreak} suffix=" j" label="Jours consécutifs de la série en cours" /></strong></div>
            <div><span>Gains</span><strong><CompactNumber value={totalWon} label="Gains exacts" /></strong></div>
            <div><span>Mises</span><strong><CompactNumber value={totalStaked} label="Mises exactes" /></strong></div>
            <div><span>Boutique</span><strong><CompactNumber value={shopSpent} label="Dépenses boutique exactes" /></strong></div>
            <div><span>Solde</span><strong><CompactNumber value={user.tokens} label="Solde exact" /></strong></div>
          </div>
        </aside>}
        <section className={isShop ? "shop-page-panel" : "profile-panel"}>
          {!isShop && <nav className="profile-tabs" aria-label="Profil">
            <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}><User size={18} /> Compte</button>
            <button className={tab === "customize" ? "active" : ""} onClick={() => setTab("customize")}><Sparkles size={18} /> Style</button>
            <button className={tab === "achievements" ? "active" : ""} onClick={() => setTab("achievements")}><BadgeCheck size={18} /> Succès</button>
            <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><Trophy size={18} /> Historique</button>
            <button className={tab === "transactions" ? "active" : ""} onClick={() => setTab("transactions")}><ReceiptText size={18} /> Transactions</button>
          </nav>}
          <div className={isShop ? "shop-page-content" : "profile-content"}>
          {tab === "account" && <nav className="segmented-tabs account-subtabs" aria-label="Réglages du compte"><button className={accountSubtab === "details" ? "active" : ""} onClick={() => setAccountSubtab("details")}><User size={17} /> Informations</button><button className={accountSubtab === "settings" ? "active" : ""} onClick={() => setAccountSubtab("settings")}><Eye size={17} /> Affichage public</button></nav>}
          {tab === "account" && accountSubtab === "details" && <>
            <header className="account-page-heading"><div><span className="eyebrow">Compte joueur</span><h2>Informations du profil</h2><p>Gère séparément ce que les autres joueurs voient et les informations privées de connexion.</p></div><button className="secondary" onClick={() => openPublicProfile(user.id)}><Eye size={17} />Voir mon profil</button></header>
            {user.guest ? <p>Les invités ne peuvent pas modifier un compte. Crée un compte pour conserver tes jetons et ton historique.</p> : <div className="settings-grid account-settings-grid">
              <section className="settings-card account-identity-card">
                <div className="account-section-heading"><span><UserRound size={20} /></span><div><h3>Identité publique</h3><p>Le pseudo et la bio sont visibles sur ton profil public.</p></div></div>
                <div className="account-identity-layout">
                  <div className="account-public-fields">
                    <label>Pseudo en jeu<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={32} placeholder="Nom affiché en partie" /><small>Affiché sur ta member card et dans les parties.</small></label>
                    <label>Bio<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={180} placeholder="Quelques mots sur ton style de jeu" /><small>{form.bio.length}/180 caractères</small></label>
                  </div>
                  <div className="account-personal-fields">
                    <div className="account-fields-caption"><CalendarDays size={17} /><span><strong>Informations personnelles</strong><small>La date complète reste privée.</small></span></div>
                    <label>Date de naissance<input value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} type="date" disabled={Boolean(user.profile?.birthDate)} />{user.profile?.birthDate && <small>Pour corriger cette date, contacte l’administration.</small>}</label>
                    <div className="account-age-gender-row"><label>Genre<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Non renseigné</option><option value="Homme">Homme</option><option value="Femme">Femme</option><option value="Non-binaire">Non-binaire</option><option value="Autre">Autre</option><option value="Préfère ne pas dire">Préfère ne pas dire</option></select></label><div className="derived-field"><span>Âge calculé</span><strong>{ageFromBirthDate(form.birthDate) || "-"}</strong></div></div>
                  </div>
                </div>
              </section>
              <section className="settings-card">
                <div className="panel-heading"><span>Jeux favoris</span><small>Choisis jusqu'à 5 jeux affichés sur ton profil public.</small></div>
                <div className="favorite-game-grid">{games.map((game) => <button key={game.id} className={favorites.includes(game.id) ? "favorite-game active" : "favorite-game"} onClick={() => toggleFavorite(game.id)} disabled={!favorites.includes(game.id) && favorites.length >= 5}>{game.name}</button>)}</div>
              </section>
              <section className="settings-card account-security-card">
                <div className="account-section-heading"><span><Shield size={20} /></span><div><h3>Connexion et sécurité</h3><p>Ces informations ne sont jamais affichées aux autres joueurs.</p></div></div>
                <div className="account-security-layout">
                  <div className="account-email-editor"><div className="account-email-summary"><Mail size={20} /><span><small>Adresse de connexion</small><strong>{user.emailVerified ? "Adresse vérifiée" : "Vérification requise"}</strong><em>Privée</em></span></div><label><span className="sr-only">Adresse email</span><input type="email" autoComplete="email" value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} placeholder="nom@exemple.be" /></label><button type="button" className="secondary" onClick={saveEmail} disabled={!form.login || form.login === user.login && user.emailVerified}><Mail size={16} />{form.login === user.login ? "Renvoyer la vérification" : "Modifier l’adresse"}</button></div>
                  <label><span className="field-label"><KeyRound size={15} />Nouveau mot de passe</span><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} maxLength={128} type="password" autoComplete="new-password" placeholder="Laisser vide pour conserver l’actuel" /><small>10 caractères minimum avec une lettre, un chiffre, une majuscule et un caractère spécial.</small></label>
                </div>
                <AccountSecurity user={user} onUser={setUser} onError={setError} onMessage={setMessage} />
              </section>
              <div className="settings-actions account-save-actions"><span>Les modifications du profil et des favoris seront enregistrées ensemble.</span><button onClick={savePublicInfo}>Enregistrer les modifications</button></div>
            </div>}
          </>}
          {tab === "account" && accountSubtab === "settings" && <>
            <header className="account-page-heading"><div><span className="eyebrow">Confidentialité du profil</span><h2>Affichage public</h2><p>Choisis les statistiques résumées sur ta carte puis les détails visibles sur ton profil.</p></div><button className="secondary" onClick={() => openPublicProfile(user.id)}><Eye size={17} />Prévisualiser</button></header>
            {user.guest ? <p>Les invités ne peuvent pas modifier l’affichage d’un profil public.</p> : <div className="profile-display-settings">
              <section className="settings-card member-stat-settings">
                <div className="account-section-heading"><span><Trophy size={20} /></span><div><h3>Member card</h3><p>Deux emplacements compacts apparaissent sur toutes les versions de ta carte.</p></div></div>
                <div className="member-stat-slots">{[0, 1].map((index) => {
                  const selected = statForm.memberCardStats[index] === "overallWinRate" ? "winRate" : statForm.memberCardStats[index] ?? "hidden";
                  return <div className="member-stat-slot" key={index}><span className="member-stat-index">{index + 1}</span><div><label htmlFor={`member-stat-${index}`}>Statistique affichée</label><select id={`member-stat-${index}`} value={selected} onChange={(event) => { const memberCardStats = [...statForm.memberCardStats]; memberCardStats[index] = event.target.value; setStatForm({ ...statForm, memberCardStats }); }}>{memberStatOptions().map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{selected === "customAchievement" && <label className="member-custom-achievement">Succès personnalisé<select value={statForm.customAchievementIds[index] ?? ""} onChange={(event) => { const ids = [...statForm.customAchievementIds]; ids[index] = event.target.value; setStatForm({ ...statForm, customAchievementIds: ids }); }}><option value="">Choisir un milestone</option>{milestoneAchievements.map((achievement) => <option key={achievement.id} value={achievement.id}>{achievement.title}</option>)}</select></label>}</div></div>;
                })}</div>
              </section>
              <section className="settings-card public-stat-settings">
                <div className="account-section-heading"><span><Eye size={20} /></span><div><h3>Fiche du profil public</h3><p>Active uniquement les indicateurs que les autres joueurs peuvent consulter.</p></div></div>
                <div className="profile-stat-visibility">{publicProfileStatOptions.map(([key, label]) => {
                  const visible = statForm.visibleProfileStats.includes(key);
                  return <label className={`profile-stat-toggle ${visible ? "active" : ""}`} key={key}><span><strong>{label}</strong><small>{visible ? "Visible sur le profil" : "Masqué aux autres joueurs"}</small></span><input type="checkbox" checked={visible} onChange={(event) => setStatForm({ ...statForm, visibleProfileStats: event.target.checked ? [...new Set([...statForm.visibleProfileStats, key])] : statForm.visibleProfileStats.filter((entry) => entry !== key) })} /><i aria-hidden="true" /></label>;
                })}</div>
              </section>
              <div className="settings-actions account-save-actions"><span>Les changements prennent effet sur les prochaines ouvertures de ton profil.</span><button onClick={savePublicInfo}>Enregistrer l’affichage</button></div>
            </div>}
          </>}
          {tab === "customize" && <Wardrobe user={user} setUser={setUser} catalog={shop} onOpenShop={onOpenShop} />}
          {tab === "shop" && <>

            {!user.guest && <button className="secret-rock-trigger" type="button" onClick={openSmallRock} aria-label="Examiner la pierre" title="Une pierre inhabituelle"><Gem size={25} /></button>}
            {user.guest ? <p>Connecte-toi avec un compte pour acheter des éléments de personnalisation.</p> : <div className="shop-layout">
              <div className="shop-main" ref={shopMode === "items" ? shopPages.anchor : packPages.anchor}>
                <div className="shop-mode-tabs segmented-tabs"><button className={shopMode === "items" ? "active" : ""} onClick={() => setShopMode("items")}><ShoppingBag size={17} /> Objets</button><button className={shopMode === "packs" ? "active" : ""} onClick={openPackShop}><Boxes size={17} /> Packs</button></div>
                {shopMode === "items" ? <>
                  <div className="shop-selector segmented-tabs">{shopTypes.map((type) => <button key={type} className={shopType === type ? "active" : ""} onClick={() => { setShopType(type); setShopCategory("classic"); setPreviewItemId(""); }}>{shopTypeLabel(type)}</button>)}</div>
                  <div className="shop-subselector">{availableShopCategories.map((category) => <button key={category} className={effectiveShopCategory === category ? "active" : ""} onClick={() => { setShopCategory(category); setPreviewItemId(""); }}>{shopCategoryLabel(category)}</button>)}</div>
                  <div className="shop-grid">{shopPages.rows.map((item) => {
              const owned = user.cosmetics?.[item.type]?.includes(item.value);
              const selected = previewItem?.id === item.id;
              return <article className={`${owned ? "shop-item owned" : "shop-item"} ${selected ? "selected" : ""} ${item.rewardOnly ? "reward-only" : ""}`} key={item.id} onClick={() => setPreviewItemId(item.id)}><div className="shop-item-head"><span>{item.rewardOnly ? "Récompense de succès" : `${shopCategoryLabel(item.category)} · ${shopTypeLabel(item.type)}`}</span><strong>{item.name}</strong><p>{item.description}</p></div><div className="shop-buy"><div className="shop-price">{item.rewardOnly ? <><Trophy size={16} /> Secret</> : <><Coins size={16} /> <CompactNumber value={item.price} label="Prix exact" /></>}</div><button className={owned || item.rewardOnly ? "secondary" : ""} disabled={owned || item.rewardOnly} onClick={(event) => { event.stopPropagation(); setPurchaseConfirmation({ kind: "item", item }); }}>{owned ? "Débloqué" : item.rewardOnly ? "Succès requis" : "Acheter"}</button></div></article>;
                  })}</div>
                  <Pagination {...shopPages} pageSizes={[12, 24, 48]} label="Pages de la boutique" />
                </> : <div className="pack-shop">
                  <div className="pack-theme-tabs">{availablePackThemes.map((theme) => <button key={theme} className={effectivePackTheme === theme ? "active" : ""} onClick={() => selectPackTheme(theme)}><strong>{packDefinitions[theme].name}</strong><small>{packDefinitions[theme].description}</small></button>)}</div>
                  <section className="pack-builder-head"><div><span>Pack personnalisable</span><h3>{packDefinitions[effectivePackTheme]?.name}</h3><p>Coche les objets qui t’intéressent. Chaque objet supplémentaire ajoute 5% de remise, jusqu’à 35%.</p></div><div className="pack-discount-badge"><Percent size={20} /><strong>{packDiscount}%</strong><small>de réduction</small></div></section>
                  <div className="pack-item-grid">{packPages.rows.map((item) => {
                    const owned = user.cosmetics?.[item.type]?.includes(item.value);
                    const selected = packSelection.includes(item.id) && !owned;
                    return <button type="button" key={item.id} className={`pack-item ${selected ? "selected" : ""} ${owned ? "owned" : ""}`} onClick={() => { setPreviewItemId(item.id); togglePackItem(item); }} disabled={owned}><span className="pack-checkbox">{owned || selected ? <Check size={15} /> : null}</span><span><small>{shopTypeLabel(item.type)} · {shopCategoryLabel(item.category)}</small><strong>{item.name}</strong></span><b>{owned ? "Déjà acquis" : <CompactNumber value={item.price} label="Prix exact" />}</b></button>;
                  })}</div>
                  <div className="pack-actions">
                  {packPages.totalPages > 1 && <Pagination {...packPages} pageSizes={[12, 24, 48]} label="Pages des objets du pack" />}
                  <section className="pack-checkout"><div className="pack-price-breakdown"><span><small><CompactNumber value={selectedPackItems.length} /> objet{selectedPackItems.length > 1 ? "s" : ""}</small><del>{packDiscount > 0 ? <CompactNumber value={packSubtotal} label="Sous-total exact" /> : ""}</del></span><strong><Coins size={20} /> <CompactNumber value={packTotal} label="Total exact" /></strong></div><button disabled={!selectedPackItems.length} onClick={() => setPurchaseConfirmation({ kind: "pack" })}>Acheter la sélection{packDiscount ? ` · -${packDiscount}%` : ""}</button></section>
                  </div>
                </div>}
              </div>
              <CosmeticPreview user={user} item={shopMode === "packs" ? packPreviewItem : previewItem} stats={displayedStats} />
            </div>}
          </>}
          {tab === "achievements" && <>
            <div className="achievement-head">
              <div><h2>Succès</h2><p>{unlockedShownAchievements.length} / {filteredAchievements.length} débloqués dans {achievementTypeLabel(achievementType)}</p></div>
              <div className="achievement-total"><BadgeCheck size={20} /> {filteredAchievements.length ? Math.round((unlockedShownAchievements.length / filteredAchievements.length) * 100) : 0}%</div>
            </div>
            <div className="segmented-tabs achievement-type-tabs">{achievementTypes.map((type) => <button key={type} className={achievementType === type ? "active" : ""} onClick={() => { setAchievementType(type); setSelectedAchievementGame("Tous"); }}>{achievementTypeLabel(type)}</button>)}</div>
            {achievementGameFilters.length > 1 && <div className="achievement-game-filter"><label><span>Filtrer par jeu</span><select value={effectiveAchievementGame} onChange={(event) => setSelectedAchievementGame(event.target.value)}><option value="Tous">Tous les jeux</option>{achievementGameFilters.map((gameId) => <option key={gameId} value={gameId}>{gameTitle(gameId)}</option>)}</select></label><small>{filteredAchievements.length} succès affiché{filteredAchievements.length > 1 ? "s" : ""}</small></div>}
            <div className="achievement-groups">{Object.entries(achievementGroups).map(([group, rows]) => (
              <section className="achievement-group" key={group}>
                <h3>{group}</h3>
                <div className="achievement-grid">{rows.map((achievement) => {
                  const ratio = achievement.target ? Math.min(1, achievement.progress / achievement.target) : 0;
                  return <article key={achievement.id} className={`achievement-card ${achievement.unlocked ? "unlocked" : "locked"} ${achievement.milestone ? "milestone" : ""} ${achievement.secret ? "secret" : ""}`}>
                    <div className="achievement-icon">{achievement.unlocked ? <BadgeCheck size={22} /> : <Trophy size={22} />}</div>
                    <div>
                      <div className="achievement-title-line"><strong>{achievement.title}</strong>{achievement.milestone && <span>Milestone</span>}{achievement.secret && <span>Secret</span>}</div>
                      <p>{achievement.description}</p>
                      <div className="achievement-progress"><span style={{ width: `${ratio * 100}%` }} /></div>
                      <small><CompactNumber value={achievement.progress} label="Progression exacte" /> / <CompactNumber value={achievement.target} label="Objectif exact" />{achievement.unlockedAt ? ` · ${formatDate(achievement.unlockedAt)}` : ""}</small>
                    </div>
                  </article>;
                })}</div>
              </section>
            ))}</div>
            {!achievements.length && <div className="empty-state">Aucun succès disponible.</div>}
          </>}
          {tab === "history" && <>
            <div className="profile-ledger-heading"><div><span className="eyebrow">Parties terminées</span><h2>Historique des parties</h2><p>Retrouve rapidement une table, un jeu ou un adversaire.</p></div><strong>{historyPage.total} résultat{historyPage.total > 1 ? "s" : ""}</strong></div>
            <div className="admin-ledger-filters profile-ledger-filters"><label className="admin-search-field">Rechercher<span><Search size={16} /><input value={historyFilters.search} onChange={(event) => { setHistoryFilters({ ...historyFilters, search: event.target.value }); setHistoryLimit(40); }} placeholder="Table, code ou joueur" /></span></label><label>Jeu<select value={historyFilters.game} onChange={(event) => { setHistoryFilters({ ...historyFilters, game: event.target.value }); setHistoryLimit(40); }}><option value="all">Tous les jeux</option>{historyGameIds.map((gameId) => <option key={gameId} value={gameId}>{gameTitle(gameId)}</option>)}</select></label><label>Événement<select value={historyFilters.result} onChange={(event) => { setHistoryFilters({ ...historyFilters, result: event.target.value }); setHistoryLimit(40); }}><option value="all">Toutes les parties</option><option value="won">Victoires</option><option value="played">Autres résultats</option></select></label></div>
            <div className="admin-history-list profile-history-list">{historyRows.map((row) => { const won = row.winners?.includes(user.id); const winnerNames = (row.winners ?? []).map((id) => row.players?.find((player) => player.id === id)?.pseudo).filter(Boolean); return <article key={row.id} className={won ? "won" : ""}><header><div><span className="eyebrow">{gameTitle(row.gameId)}</span><strong>{row.name || `Table ${row.code || "sans nom"}`}</strong><small>{formatDate(row.finishedAt)}{row.code ? ` · code ${row.code}` : ""}</small></div><span className={`status-badge ${won ? "status-active" : "status-inactive"}`}>{won ? "Victoire" : "Participation"}</span></header><div className="admin-history-metrics"><span><small>Ton gain</small><strong className={(row.playerGain ?? 0) > 0 ? "positive" : ""}><CompactNumber value={row.playerGain ?? 0} label="Gain exact" /></strong></span><span><small>Pot</small><strong><CompactNumber value={row.pot ?? 0} label="Pot exact" /></strong></span><span><small>Vainqueur(s)</small><strong>{winnerNames.length ? winnerNames.join(", ") : "Dealer / aucun"}</strong></span></div><ProfileParticipantList players={row.players} winners={row.winners} /></article>; })}</div>
            {historyPage.loading && <p role="status">Chargement...</p>}
            {!historyPage.loading && !filteredHistory.length && <div className="empty-state">Aucune partie ne correspond aux filtres.</div>}
            {historyPage.hasMore && <button type="button" disabled={historyPage.loading} className="secondary admin-load-more" onClick={() => setHistoryLimit((value) => value + 40)}>Afficher 40 parties supplémentaires</button>}
          </>}
          {tab === "transactions" && <>
            <div className="profile-ledger-heading"><div><span className="eyebrow">Portefeuille</span><h2>Transactions de jetons</h2><p>Achats, mises, gains et bonus sont regroupés dans un journal filtrable.</p></div><strong>{transactionPage.total} résultat{transactionPage.total > 1 ? "s" : ""}</strong></div>
            <div className="admin-transaction-summary profile-transaction-summary"><button type="button" className={transactionFilters.event === "all" ? "active" : ""} onClick={() => { setTransactionFilters({ ...transactionFilters, event: "all" }); setTransactionLimit(60); }}><span>Toutes</span><strong><CompactNumber value={statistics?.transactions ?? 0} /></strong></button><button type="button" className={transactionFilters.event === "daily-claim" ? "active bonus" : "bonus"} onClick={() => { setTransactionFilters({ ...transactionFilters, event: "daily-claim" }); setTransactionLimit(60); }}><span>Bonus quotidiens</span><strong><CompactNumber value={dailyClaims} /></strong></button><div><span>Crédits affichés</span><strong className="positive"><CompactNumber prefix="+" value={filteredTransactions.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0)} label="Crédits exacts" /></strong></div><div><span>Débits affichés</span><strong className="negative"><CompactNumber prefix="−" value={Math.abs(filteredTransactions.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0))} label="Débits exacts" /></strong></div></div>
            <div className="admin-ledger-filters admin-transaction-filters profile-ledger-filters"><label className="admin-search-field">Rechercher<span><Search size={16} /><input value={transactionFilters.search} onChange={(event) => { setTransactionFilters({ ...transactionFilters, search: event.target.value }); setTransactionLimit(60); }} placeholder="Opération, motif ou table" /></span></label><label>Jeu<select value={transactionFilters.game} onChange={(event) => { setTransactionFilters({ ...transactionFilters, game: event.target.value }); setTransactionLimit(60); }}><option value="all">Tous les jeux</option><option value="global">Casino / sans jeu</option>{transactionGameIds.map((gameId) => <option key={gameId} value={gameId}>{gameTitle(gameId)}</option>)}</select></label><label>Événement<select value={transactionFilters.event} onChange={(event) => { setTransactionFilters({ ...transactionFilters, event: event.target.value }); setTransactionLimit(60); }}><option value="all">Tous les événements</option>{transactionEvents.map((reason) => <option key={reason} value={reason}>{transactionLabel(reason)}</option>)}</select></label><label>Sens<select value={transactionFilters.direction} onChange={(event) => { setTransactionFilters({ ...transactionFilters, direction: event.target.value }); setTransactionLimit(60); }}><option value="all">Crédits et débits</option><option value="credit">Crédits uniquement</option><option value="debit">Débits uniquement</option></select></label></div>
            <div className="admin-transaction-list profile-transaction-list">{transactionRows.map((row) => <article key={row.id} className={`${row.amount >= 0 ? "credit" : "debit"} ${row.reason === "daily-claim" ? "daily-bonus" : ""}`}><div className="admin-transaction-icon">{row.reason === "daily-claim" ? <Activity size={18} /> : <Coins size={18} />}</div><div className="admin-transaction-main"><span className="eyebrow">{row.gameId ? gameTitle(row.gameId) : "Casino"}{row.reason === "daily-claim" ? " · Bonus" : ""}</span><strong>{transactionLabel(row.reason)}</strong><small>{formatDate(row.createdAt)}{row.note ? ` · ${row.note}` : ""}</small></div>{row.reason === "daily-claim" && <div className="admin-bonus-tags"><span>×{Number(row.dailyBonusMultiplier ?? 1).toLocaleString("fr-FR")}</span>{row.dailyBonusStreak ? <span>{row.dailyBonusStreak} j consécutifs</span> : row.dailyBonusClaims ? <span>Bonus n°{row.dailyBonusClaims}</span> : null}</div>}<div className="admin-transaction-amount"><strong className={row.amount >= 0 ? "positive" : "negative"}><CompactNumber prefix={row.amount > 0 ? "+" : "−"} value={Math.abs(row.amount)} label="Montant exact" /></strong><small>Solde : <CompactNumber value={row.balance} label="Solde exact" /></small></div></article>)}</div>
            {transactionPage.loading && <p role="status">Chargement...</p>}
            {!transactionPage.loading && !filteredTransactions.length && <div className="empty-state">Aucune transaction ne correspond aux filtres.</div>}
            {transactionPage.hasMore && <button type="button" disabled={transactionPage.loading} className="secondary admin-load-more" onClick={() => setTransactionLimit((value) => value + 60)}>Afficher 60 transactions supplémentaires</button>}
          </>}
          </div>
        </section>
      </div>
      {purchaseConfirmation && <div className="modal-backdrop shop-confirmation-layer" onClick={() => { if (!purchasePending) setPurchaseConfirmation(null); }}><div className="modal shop-confirmation-modal" onClick={(event) => event.stopPropagation()}>
        <div className="shop-confirmation-icon"><ShoppingBag size={28} /></div>
        <span className="eyebrow">Confirmation d’achat</span>
        <h2>{purchaseConfirmation.kind === "item" ? purchaseConfirmation.item.name : packDefinitions[effectivePackTheme]?.name}</h2>
        <p>{purchaseConfirmation.kind === "item" ? <>Débloquer et équiper cet élément pour <strong><CompactNumber value={purchaseConfirmation.item.price} label="Prix exact" /> jetons</strong> ?</> : <>Acheter les <strong>{selectedPackItems.length} éléments</strong> sélectionnés pour <strong><CompactNumber value={packTotal} label="Prix exact" /> jetons</strong>{packDiscount ? ` avec ${packDiscount}% de réduction` : ""} ?</>}</p>
        <div className="shop-confirmation-balance"><span>Solde actuel<strong><CompactNumber value={user.tokens} label="Solde exact" /></strong></span><span>Après achat<strong><CompactNumber value={Math.max(0, Number(user.tokens) - (purchaseConfirmation.kind === "item" ? Number(purchaseConfirmation.item.price) : packTotal))} label="Solde prévisionnel exact" /></strong></span></div>
        <div className="actions"><button type="button" disabled={purchasePending || (purchaseConfirmation.kind === "item" ? Number(purchaseConfirmation.item.price) > Number(user.tokens) : packTotal > Number(user.tokens))} onClick={confirmPurchase}><Coins size={18} /> {purchasePending ? "Achat en cours…" : "Confirmer l’achat"}</button><button type="button" className="secondary" disabled={purchasePending} onClick={() => setPurchaseConfirmation(null)}>Annuler</button></div>
      </div></div>}
      {smallRockOpen && <div className="modal-backdrop secret-rock-backdrop" onClick={() => setSmallRockOpen(false)}><div className="modal secret-rock-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title-row"><div><small>Anomalie temporelle</small><h2>Une petite pierre</h2></div><button className="secondary icon-toggle" onClick={() => setSmallRockOpen(false)} aria-label="Fermer"><X size={18} /></button></div>
        <div className="secret-rock-scene"><div className={smallRockUnlocked ? "secret-rock unlocked" : "secret-rock"}><Gem size={54} /></div><time>{smallRockStartedAt ? smallRockClock : "--:--"}</time><p>{smallRockUnlocked ? "Tu as déjà découvert ce que cette pierre attendait." : "Le temps s’écoule, mais la pierre semble attendre un instant très précis."}</p></div>
        {smallRockMessage && <div className={smallRockUnlocked ? "success" : "error"}>{smallRockMessage}</div>}
        <button className="secret-rock-action" type="button" onClick={touchSmallRock} disabled={!smallRockStartedAt || smallRockUnlocked}><Gem size={18} /> {smallRockUnlocked ? "Secret découvert" : "Toucher la pierre"}</button>
      </div></div>}
      {publicProfile && <PublicProfileModal profile={publicProfile} currentUser={user} onClose={() => setPublicProfile(null)} onFriendRequest={requestFriendFromProfileModal} onReport={setReportTarget} />}
      {reportTarget && <ReportPlayerDialog player={reportTarget} onClose={() => setReportTarget(null)} />}
    </main>
  );
}


export function shortStatLabel(label) {
  const normalized = String(label ?? "").toLowerCase();
  if (normalized.includes("win")) return "Winrate";
  if (normalized.includes("succ")) return "Succès";
  if (normalized.includes("milestone")) return "Milestone";
  if (normalized.includes("aujourd")) return "Aujourd'hui";
  if (normalized.includes("partie")) return "Parties";
  return String(label ?? "Stat");
}

export function PublicProfileModal({ profile, currentUser, onClose, onFriendRequest, onReport }) {
  const [relationship, setRelationship] = useState(profile.relationship ?? {});
  const [connectionBusy, setConnectionBusy] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const favoriteGames = profile.profile?.favoriteGames ?? [];
  const hasBio = Boolean(profile.profile?.bio?.trim());
  const hasDetails = hasBio || favoriteGames.length > 0;
  const visibleStatKeys = new Set(profile.profileStats?.visibleProfileStats ?? publicProfileStatOptions.map(([key]) => key));
  const publicStats = [
    profile.age ? ["age", "Âge", profile.age] : null,
    profile.profile?.gender ? ["gender", "Genre", profile.profile.gender] : null,
    ["friends", "Amis", <CompactNumber value={profile.friendCount} label="Nombre exact d’amis" />],
    ["gamesPlayed", "Parties", <CompactNumber value={profile.stats?.gamesPlayed} label="Nombre exact de parties" />],
    ["wins", "Victoires", <CompactNumber value={profile.stats?.wins} label="Nombre exact de victoires" />],
    ["winRate", "Winrate", `${profile.stats?.winRate ?? 0}%`],
    ["achievements", "Succès", <span title={`${formatExactNumber(profile.stats?.achievementsUnlocked)} succès sur ${formatExactNumber(profile.stats?.achievementsTotal)}`}><CompactNumber value={profile.stats?.achievementsUnlocked} /> / <CompactNumber value={profile.stats?.achievementsTotal} /></span>]
  ].filter((entry) => entry && visibleStatKeys.has(entry[0]));
  async function controlConnection(kind, method) {
    setConnectionBusy(kind);
    setConnectionError("");
    try {
      await api(`/api/connections/${kind}/${profile.id}`, { method });
      if (kind === "hidden") {
        setRelationship((value) => ({ ...value, blocked: method === "POST", muted: false, isFriend: method === "POST" ? false : value.isFriend, requested: method === "POST" ? false : value.requested }));
        if (method === "POST") onClose();
      } else setRelationship((value) => ({ ...value, muted: method === "POST" }));
      window.dispatchEvent(new Event("ktga-connections-updated"));
    } catch (error) { setConnectionError(error.message); }
    finally { setConnectionBusy(""); }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={profileCosmeticClassName(profile, "modal public-profile-modal")} onClick={(e) => e.stopPropagation()}>
        <ProfileCosmeticEffect user={profile} />
        <ProfileCosmeticFrame user={profile} />
        <div className="public-profile-scroll"><div className="modal-title-row">
          <div>
            <h2>Profil de {profile.pseudo}</h2>
          </div>
          <div className="modal-title-actions">
            {currentUser && !currentUser.guest && !relationship.self && !relationship.blocked && <button className="secondary" disabled={relationship.isFriend || relationship.requested} onClick={() => onFriendRequest?.(profile.id)}>{relationship.isFriend ? "Ami" : relationship.requested ? "Demande envoyée" : "Ajouter en ami"}</button>}
            {currentUser && !currentUser.guest && !relationship.self && !relationship.blocked && <button className="secondary icon-toggle" disabled={connectionBusy === "muted"} title={relationship.muted ? "Réafficher les messages" : "Masquer les messages"} aria-label={relationship.muted ? "Réafficher les messages de ce joueur" : "Masquer les messages de ce joueur"} onClick={() => controlConnection("muted", relationship.muted ? "DELETE" : "POST")}>{relationship.muted ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>}
            {currentUser && !currentUser.guest && !relationship.self && !relationship.blocked && <ConfirmActionButton className="danger-button icon-toggle" disabled={connectionBusy === "hidden"} title="Masquer ce joueur" aria-label="Masquer ce joueur" dialogTitle="Masquer ce joueur ?" message="Vous ne pourrez plus vous ajouter, vous inviter ou échanger des messages. Cette action le retire aussi de vos amis." confirmLabel="Masquer" danger onConfirm={() => controlConnection("hidden", "POST")}><EyeOff size={16} /></ConfirmActionButton>}
            {currentUser && !currentUser.guest && !relationship.self && relationship.blocked && <button className="secondary" disabled={connectionBusy === "hidden"} onClick={() => controlConnection("hidden", "DELETE")}><Eye size={16} />Réafficher</button>}
            {currentUser && !currentUser.guest && !relationship.self && <button className="secondary profile-report-button" onClick={() => onReport?.(profile)}><Flag size={16} /> Signaler</button>}
            <button className="secondary icon-toggle" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        {connectionError && <div className="error" role="alert">{connectionError}</div>}
        <div className={`public-profile-layout ${hasDetails ? "" : "public-profile-layout-solo"}`}>
          <aside>
            <div className={`vip-card member-${profile.cosmetics?.equipped?.memberCard ?? "default"}`}>
              <span className="vip-label">{memberCardOptions[profile.cosmetics?.equipped?.memberCard ?? "default"]} · Profil public</span>
              <strong><DisplayName user={profile} /></strong>
              <FriendCode code={profile.friendCode} />
              <div className="vip-stats">{(profile.profileStats?.publicStats ?? []).map((stat, index) => <div className="vip-ratio" key={`${stat.key}-${index}`}><BadgeCheck size={16} /><span title={stat.label}>{shortStatLabel(stat.label)}</span><strong title={String(stat.value)}>{stat.value}</strong></div>)}</div>
            </div>
            {publicStats.length > 0 && <div className="public-profile-grid">{publicStats.map(([key, label, value]) => <div key={key}><span>{label}</span><strong>{value}</strong></div>)}</div>}
            <div className="profile-cosmetics-preview" aria-label="Dés et cartes équipés">
              <div><span>Dés</span><Die value={5} kept={false} skin={profile.cosmetics?.equipped?.diceSkin} /></div>
              <div><span>Cartes</span><div className="skin-preview-row"><PlayingCard card={{ rank: "A", suit: "S" }} skin={profile.cosmetics?.equipped?.cardSkin} /><PlayingCard hidden skin={profile.cosmetics?.equipped?.cardSkin} /></div></div>
            </div>
          </aside>
          {hasDetails && <section className="public-profile-side">
            {hasBio && <div className="settings-card">
              <div className="panel-heading"><span>Bio</span><small>Présentation publique</small></div>
              <p>{profile.profile.bio}</p>
            </div>}
            {favoriteGames.length > 0 && <div className="settings-card">
              <div className="panel-heading"><span>Jeux favoris</span><small>{favoriteGames.length} / 5</small></div>
              <div className="favorite-game-grid">{favoriteGames.map((id) => <span className="favorite-game active" key={id}>{gameTitle(id)}</span>)}</div>
            </div>}
          </section>}
        </div>
        <DailyActivityChart activity={profile.activity ?? []} /></div>
      </div>
    </div>
  );
}
