import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Coins, Copy, Gamepad2, HeartPulse, LayoutDashboard, Lock, Plus, RefreshCw, Save, Search, Settings, Shield, ShoppingBag, Spade, Sparkles, Trophy, Users, X } from "lucide-react";
import { api } from "../api.js";
import { ConfirmActionButton, ConfirmDialog } from "../components/common/ConfirmAction.jsx";
import { CosmeticPreview, LucideIconPicker, MotionDesigner, VisualDesigner, cosmeticMotionCssRules, currentCosmeticCss, defaultIconKey, defaultVisualDesign, visualDesignCssRules } from "../components/cosmetics/Cosmetics.jsx";
import { defaultPublicSettings } from "../config/site.js";
import { gameTitle } from "../features/games/config.js";
import { CompactNumber, gameAudienceLabel, gameCategoryLabel, gameComplexityLabel, shopCategoryLabel } from "../utils/presentation.jsx";
import { shopTypeLabel } from "../components/cosmetics/Cosmetics.jsx";
import { UserEditor } from "../components/admin/UserEditor.jsx";
import { ServerHealth } from "../components/admin/ServerHealth.jsx";
import { CommunityEventsAdmin } from "../components/admin/CommunityEventsAdmin.jsx";
import { CasinoSettings } from "../components/admin/CasinoSettings.jsx";
import { AchievementsAdmin } from "../components/admin/AchievementsAdmin.jsx";
import { ParentalApprovals } from "../components/admin/ParentalApprovals.jsx";
import { Pagination } from "../components/feedback/Feedback.jsx";
import { usePagination } from "../components/common/usePagination.js";

export function Admin({ user, onBack, onLogout, onSettingsChange }) {
  const isAdministrator = Boolean(user.admin);
  const [data, setData] = useState({ users: [], games: [], shop: [], achievements: [], achievementRuleSchemas: null, pricing: {}, permissions: {}, settings: defaultPublicSettings, overview: {} });
  const [settingsDraft, setSettingsDraft] = useState(defaultPublicSettings);
  const [tab, setTab] = useState(isAdministrator ? "overview" : "shop");
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ userSearch: "", userStatus: "all", userRole: "all", gameSearch: "", gameType: "all", gameStatus: "all", shopSearch: "", shopType: "all", shopCategory: "all", shopOrigin: "all" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);

  const load = useCallback(async (withSpinner = true) => {
    if (withSpinner) setLoading(true);
    setError("");
    try {
      const next = await api("/api/admin");
      setData(next);
      setSettingsDraft(next.settings ?? defaultPublicSettings);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function notifySuccess(message) {
    setSuccess(message);
    window.setTimeout(() => setSuccess((current) => current === message ? "" : current), 2600);
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function updateItem(field, value) {
    setEditing((current) => {
      const item = { ...current.item, [field]: value };
      if (field === "type" && item.design?.type !== value) item.design = null;
      if (current.kind === "new-shop" && (field === "type" || field === "category")) {
        item.price = data.pricing?.[`${item.type}:${item.category}`]?.recommended ?? item.price;
      }
      return { ...current, item };
    });
  }

  function openEditor(kind, row) {
    setError("");
    if (kind === "shop" && !data.permissions?.editBuiltInShopItems && !row.id?.startsWith("custom-")) {
      setError("Les objets intégrés sont protégés. Duplique cet objet pour créer une version personnalisée.");
      return;
    }
    const item = { ...row, icon: row.type === "icons" ? row.icon ?? defaultIconKey(row.value) : row.icon, css: kind.includes("shop") ? (row.design ? row.css ?? "" : currentCosmeticCss(row)) : row.css ?? "" };
    if (kind === "new-shop") item.price = data.pricing?.[`${item.type}:${item.category}`]?.recommended ?? item.price ?? 1000;
    setEditing({ kind, item });
  }

  function activateVisualDesigner() {
    setEditing((current) => ({ ...current, item: { ...current.item, design: defaultVisualDesign(current.item.type), css: "" } }));
  }

  function disableVisualDesigner() {
    setEditing((current) => ({ ...current, item: { ...current.item, design: null } }));
  }

  async function save() {
    if (!editing) return;
    if (![editing.item.name, editing.item.displayName].some((value) => String(value ?? "").trim())) {
      setError("Le nom ne peut pas être vide.");
      return;
    }
    if (editing.kind === "game" && editing.item.id === "texas-holdem" && Number(editing.item.pokerDefaultBigBlind) % 2) {
      setError("La grosse blinde par défaut doit être paire.");
      return;
    }
    setSaving("editor");
    setError("");
    try {
      if (editing.kind === "game") await api(`/api/admin/games/${editing.item.id}`, { method: "PATCH", body: JSON.stringify(editing.item) });
      if (editing.kind === "shop") await api(`/api/admin/shop/${editing.item.id}`, { method: "PATCH", body: JSON.stringify(editing.item) });
      if (editing.kind === "new-shop") await api("/api/admin/shop", { method: "POST", body: JSON.stringify(editing.item) });
      if (editing.kind.includes("shop")) window.dispatchEvent(new Event("ktga-shop-updated"));
      setEditing(null);
      await load(false);
      notifySuccess("Modifications enregistrées.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving("");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving("settings");
    setError("");
    try {
      const { siteName, siteIcon, siteSubtitle, registrationsEnabled, guestAccessEnabled, signupTokens, dailyTokens, dailyBonusDefaultMultiplier, dailyBonusMaxMultiplier, dailyBonusRules, minRoomStake } = settingsDraft;
      const settings = await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ siteName, siteIcon, siteSubtitle, registrationsEnabled, guestAccessEnabled, signupTokens, dailyTokens, dailyBonusDefaultMultiplier, dailyBonusMaxMultiplier, dailyBonusRules, minRoomStake }) });
      setSettingsDraft(settings);
      setData((current) => ({ ...current, settings }));
      onSettingsChange?.(settings);
      notifySuccess("Paramètres du casino enregistrés.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving("");
    }
  }

  function requestAdminAction({ title, message, label, path, method = "POST" }) {
    setConfirmAction({ title, message, label, run: async () => {
      setSaving("action");
      setError("");
      try {
        await api(path, { method });
        if (path.includes("/shop/")) window.dispatchEvent(new Event("ktga-shop-updated"));
        setEditing(null);
        await load(false);
        notifySuccess("Opération terminée.");
      } finally {
        setSaving("");
      }
    } });
  }

  async function duplicateShopItem(row) {
    setSaving(`duplicate-${row.id}`);
    setError("");
    try {
      await api("/api/admin/shop", { method: "POST", body: JSON.stringify({ ...row, name: `${row.name} · copie` }) });
      window.dispatchEvent(new Event("ktga-shop-updated"));
      await load(false);
      notifySuccess("Copie créée dans la boutique.");
    } finally {
      setSaving("");
    }
  }

  const includesSearch = (values, search) => !search.trim() || values.some((value) => String(value ?? "").toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
  const filteredUsers = data.users.filter((entry) => includesSearch([entry.login, entry.displayName, entry.bio, entry.id], filters.userSearch))
    .filter((entry) => filters.userStatus === "all" || (filters.userStatus === "active" ? entry.active : !entry.active))
    .filter((entry) => filters.userRole === "all" || (filters.userRole === "admin" ? entry.admin : filters.userRole === "editor" ? entry.editor && !entry.admin : !entry.admin && !entry.editor));
  const filteredGames = data.games.filter((entry) => includesSearch([entry.name, entry.description, entry.id, entry.category], filters.gameSearch))
    .filter((entry) => filters.gameType === "all" || entry.type === filters.gameType)
    .filter((entry) => filters.gameStatus === "all" || (filters.gameStatus === "enabled" ? entry.enabled !== false : entry.enabled === false));
  const filteredShop = data.shop.filter((entry) => includesSearch([entry.name, entry.description, entry.id], filters.shopSearch))
    .filter((entry) => filters.shopType === "all" || entry.type === filters.shopType)
    .filter((entry) => filters.shopCategory === "all" || entry.category === filters.shopCategory)
    .filter((entry) => filters.shopOrigin === "all" || (filters.shopOrigin === "custom" ? entry.id.startsWith("custom-") : !entry.id.startsWith("custom-")));
  const shopCategories = [...new Set(data.shop.map((item) => item.category))];
  const rows = tab === "users" ? filteredUsers : tab === "games" ? filteredGames : filteredShop;
  const pages = usePagination(rows, JSON.stringify([tab, filters]));
  const editorTitle = editing?.kind === "new-shop" ? "Créer un objet" : editing?.kind === "user" ? `Joueur · ${editing.item.displayName}` : editing?.kind === "game" ? `Jeu · ${editing.item.name}` : `Objet · ${editing?.item.name}`;
  const overview = data.overview ?? {};
  const pricingGuide = (() => {
    if (!editing?.kind?.includes("shop")) return null;
    const prices = data.shop
      .filter((item) => item.id !== (editing.kind === "shop" ? editing.item.id : "") && item.type === editing.item.type && item.category === editing.item.category)
      .map((item) => Math.max(0, Math.floor(Number(item.price) || 0)))
      .sort((a, b) => a - b);
    if (!prices.length) return data.pricing?.[`${editing.item.type}:${editing.item.category}`] ?? { count: 0, min: 0, max: 0, recommended: 1000, allowedMin: 0, allowedMax: 1000000 };
    const middle = Math.floor(prices.length / 2);
    const recommended = prices.length % 2 ? prices[middle] : Math.round((prices[middle - 1] + prices[middle]) / 2);
    return { count: prices.length, min: prices[0], max: prices.at(-1), recommended, allowedMin: Math.max(0, Math.floor(prices[0] * 0.75)), allowedMax: Math.max(1, Math.ceil(prices.at(-1) * 1.25)) };
  })();
  const adminNavigation = isAdministrator ? [
    ["overview", "Vue d’ensemble", LayoutDashboard, ""],
    ["health", "Santé serveur", HeartPulse, ""],
    ["events", "Événements", Sparkles, ""],
    ["users", "Joueurs", Users, data.users.length],
    ["games", "Jeux", Gamepad2, data.games.length],
    ["achievements", "Succès", Trophy, data.achievements?.length ?? 0],
    ["shop", "Boutique", ShoppingBag, data.shop.length],
    ["settings", "Paramètres", Settings, ""]
  ] : [["shop", "Studio boutique", ShoppingBag, data.shop.length], ["events", "Événements", Sparkles, ""]];
  const formatAdminDate = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Non disponible";

  return (
    <main className="app-shell admin-shell">
      <header className="page-heading admin-topbar">
        <div><span className="eyebrow">Back-office · {isAdministrator ? "Administrateur" : "Éditeur"}</span><h1>{isAdministrator ? "Centre d’administration" : "Espace éditeur"}</h1><span>{isAdministrator ? `Supervision et configuration de ${data.settings?.siteName ?? "KTGA.ME"}` : "Crée les objets personnalisés et prépare les événements communautaires."}</span></div>
        <button type="button" className="secondary" onClick={() => load()} disabled={loading}><RefreshCw size={18} className={loading ? "spinning" : ""} /> Actualiser</button>
      </header>
      {error && <div className="error admin-feedback"><AlertTriangle size={18} /><span>{error}</span><button type="button" className="secondary icon-toggle" onClick={() => setError("")} aria-label="Fermer"><X size={16} /></button></div>}
      {success && <div className="success admin-feedback"><CheckCircle2 size={18} /><span>{success}</span></div>}
      <nav className="admin-nav" aria-label="Sections d'administration">
        {adminNavigation.map(([value, label, Icon, count]) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon size={18} /><span>{label}</span>{count !== "" && <b>{count}</b>}</button>)}
      </nav>

      {loading ? <section className="card admin-loading"><RefreshCw className="spinning" /><strong>Chargement du back-office…</strong></section> : <>
        {isAdministrator && tab === "overview" && <div className="admin-overview">
          <section className="admin-metric-grid" aria-label="Indicateurs du casino">
            <article className="admin-metric"><Users /><span>Comptes actifs</span><strong>{overview.users?.active ?? 0}</strong><small>{overview.users?.inactive ?? 0} désactivé(s) · {overview.users?.admins ?? 0} admin(s)</small></article>
            <article className="admin-metric"><Activity /><span>Tables ouvertes</span><strong>{overview.rooms?.active ?? 0}</strong><small>{overview.rooms?.playing ?? 0} en jeu · {overview.rooms?.waiting ?? 0} en attente</small></article>
            <article className="admin-metric"><Trophy /><span>Parties aujourd’hui</span><strong>{overview.activity?.gamesToday ?? 0}</strong><small>{overview.activity?.gamesTotal ?? 0} partie(s) archivées</small></article>
            <article className="admin-metric"><Coins /><span>Jetons en circulation</span><strong><CompactNumber value={overview.economy?.circulatingTokens ?? 0} label="Circulation exacte" /></strong><small>Solde cumulé des comptes joueurs</small></article>
          </section>
          <div className="admin-overview-columns">
            <section className="card admin-list">
              <div className="admin-section-heading"><div><span className="eyebrow">Temps réel</span><h2>Tables actives</h2></div><button type="button" className="secondary" onClick={() => setTab("games")}>Gérer les jeux</button></div>
              <div className="admin-room-list">{(overview.activeRooms ?? []).map((room) => <article key={room.id}><div><strong>{room.name}</strong><small>{gameTitle(room.gameId)} · code {room.code}</small></div><span className={`status-badge ${room.playing ? "status-live" : "status-waiting"}`}>{room.playing ? "En cours" : "En attente"}</span><b>{room.players} joueur(s)</b></article>)}{!(overview.activeRooms ?? []).length && <div className="empty-state">Aucune table ouverte actuellement.</div>}</div>
            </section>
            <section className="card admin-quick-panel">
              <span className="eyebrow">Accès rapide</span><h2>Configurer</h2><p>Les changements sont appliqués immédiatement aux nouvelles opérations.</p>
              <button type="button" onClick={() => setTab("settings")}><Settings size={18} /><span><strong>Paramètres du casino</strong><small>Identité, accès et économie</small></span></button>
              <button type="button" className="secondary" onClick={() => setTab("shop")}><ShoppingBag size={18} /><span><strong>Studio boutique</strong><small>Objets et apparences</small></span></button>
              <div className="admin-catalog-summary"><span><b>{overview.catalog?.enabledGames ?? 0}</b>/{overview.catalog?.games ?? 0} jeux actifs</span><span><b>{overview.catalog?.customShopItems ?? 0}</b> objets personnalisés</span></div>
            </section>
          </div>
        </div>}


        {isAdministrator && tab === "health" && <ServerHealth reportError={setError} />}

        {data.permissions?.manageCommunityEvents && tab === "events" && <CommunityEventsAdmin shop={data.shop} canOperate={Boolean(data.permissions?.operateCommunityEvents)} reportError={setError} />}

        {data.permissions?.manageAchievements && tab === "achievements" && <AchievementsAdmin achievements={data.achievements} schemas={data.achievementRuleSchemas} games={data.games} shop={data.shop} reload={load} reportError={setError} notifySuccess={notifySuccess} />}

        {(tab === "shop" || (isAdministrator && ["users", "games"].includes(tab))) && <section className="card admin-list" ref={pages.anchor}>
          <div className="admin-section-heading">
            <div><span className="eyebrow">Catalogue</span><h2>{tab === "users" ? "Comptes joueurs" : tab === "games" ? "Jeux disponibles" : "Objets de la boutique"}</h2><small>{rows.length} résultat{rows.length > 1 ? "s" : ""} sur {tab === "users" ? data.users.length : tab === "games" ? data.games.length : data.shop.length}</small></div>
            {tab === "shop" && <button type="button" onClick={() => openEditor("new-shop", { name: "", description: "", price: 0, type: "icons", category: "classic", icon: "chip", css: "" })}><Plus size={17} /> Créer un objet</button>}
          </div>
          {tab === "shop" && !isAdministrator && <div className="editor-scope-notice"><Shield size={20} /><div><strong>Espace éditeur</strong><span>Tu peux créer, dupliquer, modifier et supprimer les objets personnalisés. Les objets intégrés servent de références et restent protégés.</span></div></div>}
          {tab === "users" && <div className="admin-filters"><label className="admin-search-field">Rechercher<span><Search size={17} /><input value={filters.userSearch} onChange={(event) => updateFilter("userSearch", event.target.value)} placeholder="Pseudo, bio ou identifiant" /></span></label><label>État<select value={filters.userStatus} onChange={(event) => updateFilter("userStatus", event.target.value)}><option value="all">Tous les états</option><option value="active">Actifs</option><option value="inactive">Désactivés</option></select></label><label>Rôle<select value={filters.userRole} onChange={(event) => updateFilter("userRole", event.target.value)}><option value="all">Tous les rôles</option><option value="admin">Administrateurs</option><option value="editor">Éditeurs</option><option value="player">Joueurs</option></select></label></div>}
          {tab === "games" && <div className="admin-filters"><label className="admin-search-field">Rechercher<span><Search size={17} /><input value={filters.gameSearch} onChange={(event) => updateFilter("gameSearch", event.target.value)} placeholder="Nom, catégorie ou identifiant" /></span></label><label>Type<select value={filters.gameType} onChange={(event) => updateFilter("gameType", event.target.value)}><option value="all">Tous les types</option><option value="dice">Jeux de dés</option><option value="cards">Jeux de cartes</option></select></label><label>Publication<select value={filters.gameStatus} onChange={(event) => updateFilter("gameStatus", event.target.value)}><option value="all">Tous</option><option value="enabled">Publiés</option><option value="disabled">Masqués</option></select></label></div>}
          {tab === "shop" && <div className="admin-filters"><label className="admin-search-field">Rechercher<span><Search size={17} /><input value={filters.shopSearch} onChange={(event) => updateFilter("shopSearch", event.target.value)} placeholder="Nom, description ou identifiant" /></span></label><label>Type<select value={filters.shopType} onChange={(event) => updateFilter("shopType", event.target.value)}><option value="all">Tous les types</option>{["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"].map((type) => <option key={type} value={type}>{shopTypeLabel(type)}</option>)}</select></label><label>Collection<select value={filters.shopCategory} onChange={(event) => updateFilter("shopCategory", event.target.value)}><option value="all">Toutes les collections</option>{shopCategories.map((category) => <option key={category} value={category}>{shopCategoryLabel(category)}</option>)}</select></label><label>Origine<select value={filters.shopOrigin} onChange={(event) => updateFilter("shopOrigin", event.target.value)}><option value="all">Toutes</option><option value="custom">Personnalisés</option><option value="built-in">Intégrés</option></select></label></div>}
          <div className="ledger admin-ledger">
            <table className="score-table admin-table">
              <thead><tr>{tab === "users" ? <><th>Joueur</th><th>Activité</th><th>Solde</th><th>État</th></> : tab === "games" ? <><th>Jeu</th><th>Classification</th><th>Entrée</th><th>Publication</th></> : <><th>Objet</th><th>Type</th><th>Prix</th><th>Origine</th></>}<th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{pages.rows.map((row) => <tr key={row.id}>
                {tab === "users" && <><td><strong>{row.displayName}</strong><small>@{row.login}{row.admin ? " · Administrateur" : row.editor ? " · Éditeur" : ""}</small></td><td><strong><CompactNumber value={row.gamesPlayed} suffix=" partie(s)" /></strong><small><CompactNumber value={row.wins} suffix=" victoire(s)" /> · inscrit {formatAdminDate(row.createdAt)}</small></td><td><strong><CompactNumber value={row.tokens} label="Solde exact" /></strong><small>Dernier bonus : {row.lastDailyClaim ?? "jamais"}</small></td><td><span className={`status-badge ${row.active ? "status-active" : "status-inactive"}`}>{row.active ? "Actif" : "Désactivé"}</span></td></>}
                {tab === "games" && <><td><strong>{row.name}</strong><small>{row.id} · position {row.position}</small></td><td><strong>{gameCategoryLabel(row.category)}</strong><small>{gameAudienceLabel(row.audience)} · {gameComplexityLabel(row.complexity)}</small></td><td><strong><CompactNumber value={row.entryPot ?? 0} label="Pot d’entrée exact" /></strong><small>{row.minPlayers}-{row.maxPlayers} joueur(s)</small></td><td><span className={`status-badge ${row.enabled !== false ? "status-active" : "status-inactive"}`}>{row.enabled !== false ? "Publié" : "Masqué"}</span></td></>}
                {tab === "shop" && <><td><strong>{row.name}</strong><small>{row.id}</small></td><td><strong>{shopTypeLabel(row.type)}</strong><small>{shopCategoryLabel(row.category)}</small></td><td><strong><CompactNumber value={row.price} label="Prix exact" /></strong><small>{row.design ? "Créé avec le studio" : "CSS avancé"}</small></td><td><span className={`status-badge ${row.id.startsWith("custom-") ? "status-custom" : "status-built-in"}`}>{row.id.startsWith("custom-") ? "Personnalisé" : "Intégré"}</span></td></>}
                <td><div className="admin-row-actions">{tab === "shop" && <ConfirmActionButton className="secondary icon-toggle" disabled={Boolean(saving)} title="Dupliquer en objet personnalisé" dialogTitle="Dupliquer cet objet ?" message={`Une copie de « ${row.name} » sera ajoutée à la boutique comme objet personnalisé.`} confirmLabel="Dupliquer l’objet" onConfirm={() => duplicateShopItem(row)}><Copy size={16} /></ConfirmActionButton>}{tab === "shop" && !data.permissions?.editBuiltInShopItems && !row.id.startsWith("custom-") ? <span className="admin-locked-action" title="Objet intégré protégé"><Lock size={15} /> Protégé</span> : <button type="button" className="secondary" onClick={() => openEditor(tab === "users" ? "user" : tab === "games" ? "game" : "shop", row)}>Modifier</button>}</div></td>
              </tr>)}</tbody>
            </table>
            {!rows.length && <div className="empty-state"><Search size={24} /><strong>Aucun résultat</strong><span>Modifie les filtres ou la recherche pour afficher d’autres éléments.</span></div>}
          </div>
          <Pagination {...pages} label={`Pages ${tab === "users" ? "des joueurs" : tab === "games" ? "des jeux" : "de la boutique admin"}`} />
        </section>}

        {isAdministrator && tab === "settings" && <><CasinoSettings draft={settingsDraft} setDraft={setSettingsDraft} onSubmit={saveSettings} saving={saving === "settings"} /><ParentalApprovals /></>}
      </>}

      {editing?.kind === "user" && <UserEditor row={editing.item} currentUser={user} games={data.games} settings={settingsDraft} onClose={() => setEditing(null)} onSaved={() => load(false)} onRequestAction={requestAdminAction} notifySuccess={notifySuccess} reportError={setError} />}
      {editing && editing.kind !== "user" && <div className="modal-backdrop" onClick={() => setEditing(null)}>
        <form className={`modal admin-editor ${editing.kind.includes("shop") ? "shop-admin-editor" : ""}`} onSubmit={(event) => { event.preventDefault(); save(); }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-title-row"><div><span className="eyebrow">Édition</span><h2>{editorTitle}</h2><small>{editing.item.id}</small></div><button type="button" className="secondary icon-toggle" onClick={() => setEditing(null)} aria-label="Fermer"><X size={18} /></button></div>
          <div className={editing.kind.includes("shop") ? "admin-editor-layout" : "admin-editor-fields"}>
            <div className="admin-editor-fields">
              {editing.kind === "game" && <>
                <section className="admin-form-section"><div className="admin-form-section-title"><Gamepad2 /><div><h3>Présentation</h3><p>Ces informations sont visibles sur la page d’accueil.</p></div></div><label>Nom du jeu<input required value={editing.item.name} onChange={(e) => updateItem("name", e.target.value)} /></label><label>Description publique<textarea required value={editing.item.description ?? ""} onChange={(e) => updateItem("description", e.target.value)} maxLength={240} /><small>{editing.item.description?.length ?? 0}/240 caractères</small></label></section>
                <section className="admin-form-section"><div className="admin-form-section-title"><Settings /><div><h3>Classement et disponibilité</h3><p>Le type technique et le nombre de joueurs sont définis par le moteur du jeu.</p></div></div><div className="admin-field-grid"><label>Catégorie<select value={editing.item.category ?? "score"} onChange={(e) => updateItem("category", e.target.value)}>{[...new Set(data.games.map((game) => game.category))].map((value) => <option key={value} value={value}>{gameCategoryLabel(value)}</option>)}</select></label><label>Public<select value={editing.item.audience ?? "multi"} onChange={(e) => updateItem("audience", e.target.value)}><option value="solo">Solo</option><option value="multi">Multijoueur</option><option value="solo-multi">Solo et multijoueur</option></select></label><label>Complexité<select value={editing.item.complexity ?? "intermediate"} onChange={(e) => updateItem("complexity", e.target.value)}><option value="easy">Accessible</option><option value="intermediate">Intermédiaire</option><option value="advanced">Avancé</option></select></label></div><div className="admin-field-grid"><label>Pot d’entrée<input type="number" min="0" value={editing.item.entryPot ?? 0} onChange={(e) => updateItem("entryPot", Number(e.target.value))} /></label><label>Position sur l’accueil<input type="number" min="1" max={data.games.length} value={editing.item.position ?? 1} onChange={(e) => updateItem("position", Number(e.target.value))} /></label></div><div className="admin-toggle-row"><label><input type="checkbox" checked={editing.item.enabled !== false} onChange={(e) => updateItem("enabled", e.target.checked)} /> Jeu publié sur l’accueil</label></div><div className="admin-tag-preview"><span>{gameCategoryLabel(editing.item.category)}</span><span>{gameAudienceLabel(editing.item.audience)}</span><span>{gameComplexityLabel(editing.item.complexity)}</span><span>{editing.item.minPlayers}-{editing.item.maxPlayers} joueurs</span></div></section>
                {editing.item.id === "texas-holdem" && <section className="admin-form-section poker-game-settings"><div className="admin-form-section-title"><Spade /><div><h3>Paramètres des tables</h3><p>Valeurs proposées lors de la création d’une table de Texas Hold’em.</p></div></div><div className="admin-field-grid"><label>Cave minimale<input type="number" min="1000" max="10000000" value={editing.item.minPokerBuyIn} onChange={(event) => updateItem("minPokerBuyIn", Number(event.target.value))} /></label><label>Grosse blinde par défaut<input type="number" min="2" max={editing.item.minPokerBuyIn} step="2" value={editing.item.pokerDefaultBigBlind} onChange={(event) => updateItem("pokerDefaultBigBlind", Number(event.target.value))} /></label><label>Temps par tour (secondes)<input type="number" min="30" max="600" value={editing.item.pokerTurnSeconds} onChange={(event) => updateItem("pokerTurnSeconds", Number(event.target.value))} /></label></div><div className="blind-ratio settings-blind-preview"><span>Petite blinde<strong>{Math.floor((Number(editing.item.pokerDefaultBigBlind) || 2) / 2)}</strong></span><b>½</b><span>Grosse blinde<strong>{editing.item.pokerDefaultBigBlind}</strong></span></div><small className="field-help">La petite blinde vaut toujours la moitié de la grosse blinde. Ces valeurs concernent les prochaines tables.</small></section>}
              </>}
              {(editing.kind === "shop" || editing.kind === "new-shop") && <>
                <section className="admin-form-section"><div className="admin-form-section-title"><ShoppingBag /><div><h3>Fiche boutique</h3><p>Nom, classement et tarif visibles avant l’achat.</p></div></div><label>Nom de l’élément<input required value={editing.item.name} onChange={(e) => updateItem("name", e.target.value)} /></label><label>Description<textarea required value={editing.item.description ?? ""} onChange={(e) => updateItem("description", e.target.value)} maxLength={240} /></label><div className="admin-field-grid"><label>Type<select value={editing.item.type} onChange={(e) => updateItem("type", e.target.value)}>{["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"].map((type) => <option key={type} value={type}>{shopTypeLabel(type)}</option>)}</select></label><label>Collection<select value={editing.item.category} onChange={(e) => updateItem("category", e.target.value)}>{["classic", "premium", "premiumShape", "premiumAnimated"].map((category) => <option key={category} value={category}>{shopCategoryLabel(category)}</option>)}</select></label><label>Coût<input type="number" min={isAdministrator ? 0 : pricingGuide?.allowedMin ?? 0} max={isAdministrator ? undefined : pricingGuide?.allowedMax} value={editing.item.price ?? 0} onChange={(e) => updateItem("price", Number(e.target.value))} /></label></div>{pricingGuide && <div className="shop-pricing-guide"><div><Coins size={19} /><span><strong>Référence tarifaire</strong><small><CompactNumber value={pricingGuide.count} suffix={` objet${pricingGuide.count > 1 ? "s" : ""}`} /> comparable{pricingGuide.count > 1 ? "s" : ""} · de <CompactNumber value={pricingGuide.min} label="Prix minimum exact" /> à <CompactNumber value={pricingGuide.max} label="Prix maximum exact" /></small></span></div><div className="shop-pricing-recommendation"><span>Prix conseillé<strong><CompactNumber value={pricingGuide.recommended} label="Prix conseillé exact" /></strong></span><button type="button" className="secondary" onClick={() => updateItem("price", pricingGuide.recommended)}>Appliquer</button></div>{!isAdministrator && <small className="shop-pricing-limit">Plage éditeur autorisée : <CompactNumber value={pricingGuide.allowedMin} /> à <CompactNumber value={pricingGuide.allowedMax} suffix=" jetons" />.</small>}</div>}</section>
                {editing.item.type === "icons" && <section className="admin-form-section admin-icon-editor"><div className="admin-form-section-title"><Sparkles /><div><h3>Icône</h3><p>Sélectionne toute icône Lucide ou colle un SVG personnalisé.</p></div></div><label>Nom Lucide ou code SVG<textarea className="icon-source-editor" value={editing.item.icon ?? ""} onChange={(e) => updateItem("icon", e.target.value)} spellCheck="false" placeholder={'Exemple : crown ou <svg viewBox="0 0 24 24">…</svg>'} /></label><LucideIconPicker value={editing.item.icon} onChange={(name) => updateItem("icon", name)} /></section>}
                <VisualDesigner type={editing.item.type} design={editing.item.design} onChange={(design) => updateItem("design", design)} onActivate={activateVisualDesigner} onDisable={disableVisualDesigner} />
                <MotionDesigner motion={editing.item.motion} onChange={(motion) => updateItem("motion", motion)} />
                <section className="admin-form-section"><div className="admin-form-section-title"><Settings /><div><h3>CSS avancé</h3><p>Déclarations supplémentaires limitées à cet objet.</p></div></div>{(editing.item.design || editing.item.motion) && <details className="generated-css-panel"><summary>Voir le CSS généré par les studios</summary><textarea className="css-editor" readOnly value={[visualDesignCssRules(editing.item.value ? editing.item : { ...editing.item, value: "admin-preview" }), cosmeticMotionCssRules(editing.item.value ? editing.item : { ...editing.item, value: "admin-preview" })].filter(Boolean).join("\n")} /></details>}<label>{editing.item.design ? "Surcharges CSS" : "CSS de l’élément"}<textarea className="css-editor" value={editing.item.css ?? ""} onChange={(e) => updateItem("css", e.target.value)} spellCheck="false" placeholder={"color: #ffe28a;\nbackground: linear-gradient(...);\nborder-color: #d6ad45;"} /></label></section>
                {editing.kind === "shop" && <div className="admin-danger-zone"><strong><AlertTriangle size={16} /> Zone sensible</strong><p>La suppression retire cet objet du catalogue.</p><button type="button" className="danger-button" onClick={() => requestAdminAction({ title: "Supprimer cet objet ?", message: `${editing.item.name} sera retiré de la boutique.`, label: "Supprimer l’objet", path: `/api/admin/shop/${editing.item.id}`, method: "DELETE" })}>Supprimer l’élément</button></div>}
              </>}
            </div>
            {(editing.kind === "shop" || editing.kind === "new-shop") && <CosmeticPreview user={user} item={editing.item} />}
          </div>
          <div className="actions admin-editor-actions"><button type="submit" disabled={saving === "editor"}><Save size={18} /> {saving === "editor" ? "Enregistrement…" : "Enregistrer"}</button><button type="button" className="secondary" onClick={() => setEditing(null)}>Annuler</button></div>
        </form>
      </div>}
      {confirmAction && <ConfirmDialog title={confirmAction.title} message={confirmAction.message} confirmLabel={confirmAction.label} danger onConfirm={confirmAction.run} onClose={() => setConfirmAction(null)} />}
    </main>
  );
}
