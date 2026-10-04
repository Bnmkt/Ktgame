import { ModalBackdrop } from "../components/common/ModalBackdrop.jsx";
import { BugReportsAdmin } from "../features/bugs/BugReportsAdmin.jsx";
import { Bug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, Copy, Gamepad2, HeartPulse, LayoutDashboard, Lock, Newspaper, Plus, RefreshCw, Save, Scale, Search, Settings, Shield, ShieldCheck, ShoppingBag, Spade, Sparkles, Trophy, Users, X } from "lucide-react";
import { api } from "../api.js";
import { ConfirmActionButton, ConfirmDialog } from "../components/common/ConfirmAction.jsx";
import { currentCosmeticCss, defaultIconKey, defaultVisualDesign, shopTypeLabel } from "../components/cosmetics/Cosmetics.jsx";
import { defaultPublicSettings } from "../config/site.js";
import { CompactNumber, gameAudienceLabel, gameCategoryLabel, gameComplexityLabel, shopCategoryLabel } from "../utils/presentation.jsx";
import { UserEditor } from "../components/admin/UserEditor.jsx";
import { ServerHealth } from "../components/admin/ServerHealth.jsx";
import { CommunityEventsAdmin } from "../components/admin/CommunityEventsAdmin.jsx";
import { CasinoSettings } from "../components/admin/CasinoSettings.jsx";
import { AchievementsAdmin } from "../components/admin/AchievementsAdmin.jsx";
import { ParentalApprovals } from "../components/admin/ParentalApprovals.jsx";
import { Pagination } from "../components/feedback/Feedback.jsx";
import { usePagination } from "../components/common/usePagination.js";
import { GameDefaults } from "../components/admin/GameDefaults.jsx";
import { ShopStudio } from "../components/admin/ShopStudio.jsx";
import { PatchnotesAdmin } from "../components/admin/PatchnotesAdmin.jsx";
import { AdminOverview } from "../components/admin/AdminOverview.jsx";
import { TribunalAdmin } from "../components/admin/TribunalAdmin.jsx";
import { shopPackName } from "../utils/shop-packs.js";
import { HelpAdmin } from "../components/admin/HelpAdmin.jsx";

export function Admin({ user, onBack, onSettingsChange }) {
  const isAdministrator = Boolean(user.admin);
  const [data, setData] = useState({ users: [], games: [], shop: [], achievements: [], achievementRuleSchemas: null, pricing: {}, permissions: {}, settings: defaultPublicSettings, overview: {} });
  const [settingsDraft, setSettingsDraft] = useState(defaultPublicSettings);
  const [tab, setTab] = useState(isAdministrator ? "overview" : "shop");
  const [editing, setEditing] = useState(null);
  const [shopEditorSection, setShopEditorSection] = useState("details");
  const [filters, setFilters] = useState({ userSearch: "", userStatus: "all", userRole: "all", userEmail: "all", userSort: "recent", gameSearch: "", gameType: "all", gameStatus: "all", shopSearch: "", shopType: "all", shopCategory: "all", shopOrigin: "all" });
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
    const item = { ...row, icon: row.type === "icons" ? row.icon ?? defaultIconKey(row.value) : row.icon, css: kind.includes("shop") ? (row.design ? row.css ?? "" : currentCosmeticCss(row)) : row.css ?? "", ...(kind.includes("shop") ? { packName: row.packs?.[0] ? shopPackName(row.packs[0], row) : "" } : {}) };
    if (kind === "new-shop") item.price = data.pricing?.[`${item.type}:${item.category}`]?.recommended ?? item.price ?? 1000;
    if (kind.includes("shop")) setShopEditorSection("details");
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
      if (editing.kind.includes("shop")) setShopEditorSection("details");
      setError("Le nom ne peut pas être vide.");
      return;
    }
    if (editing.kind.includes("shop") && !String(editing.item.description ?? "").trim()) {
      setShopEditorSection("details");
      setError("La description ne peut pas être vide.");
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
      const { siteName, siteIcon, siteSubtitle, registrationsEnabled, guestAccessEnabled, emailVerificationRequired, signupTokens, dailyTokens, dailyBonusDefaultMultiplier, dailyBonusMaxMultiplier, dailyBonusRules, minRoomStake, botThinkingSeconds, turnEndDelaySeconds, roundResultsSeconds } = settingsDraft;
      const settings = await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ siteName, siteIcon, siteSubtitle, registrationsEnabled, guestAccessEnabled, emailVerificationRequired, signupTokens, dailyTokens, dailyBonusDefaultMultiplier, dailyBonusMaxMultiplier, dailyBonusRules, minRoomStake, botThinkingSeconds, turnEndDelaySeconds, roundResultsSeconds }) });
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
    setConfirmAction({ title, message, label, danger: true, run: async () => {
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
    .filter((entry) => filters.userRole === "all" || (filters.userRole === "admin" ? entry.admin : filters.userRole === "editor" ? entry.editor && !entry.admin : !entry.admin && !entry.editor))
    .filter((entry) => filters.userEmail === "all" || (filters.userEmail === "legacy" ? entry.legacyLogin : filters.userEmail === "verified" ? entry.emailVerified : !entry.legacyLogin && !entry.emailVerified))
    .sort((left, right) => filters.userSort === "name"
      ? left.displayName.localeCompare(right.displayName, "fr")
      : filters.userSort === "activity"
        ? right.gamesPlayed - left.gamesPlayed || right.wins - left.wins
        : filters.userSort === "balance"
          ? right.tokens - left.tokens
          : new Date(right.createdAt ?? 0) - new Date(left.createdAt ?? 0));
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
  const isShopEditor = Boolean(editing?.kind?.includes("shop"));
  const adminNavigationGroups = isAdministrator ? [
    { label: "Pilotage", items: [
      { value: "overview", label: "Vue d’ensemble", icon: LayoutDashboard },
      { value: "health", label: "Supervision", icon: HeartPulse },
      { value: "bugs", label: "Signalements de bugs", icon: Bug }
    ] },
    { label: "Contenu", items: [
      { value: "events", label: "Événements", icon: Sparkles },
      { value: "games", label: "Jeux", icon: Gamepad2, count: data.games.length },
      { value: "achievements", label: "Succès", icon: Trophy, count: data.achievements?.length ?? 0 },
      { value: "shop", label: "Boutique", icon: ShoppingBag, count: data.shop.length },
      { value: "patchnotes", label: "Patchnotes", icon: Newspaper },
      { value: "help", label: "FAQ et tutos", icon: BookOpen }
    ] },
    { label: "Administration", items: [
      { value: "users", label: "Comptes joueurs", icon: Users, count: data.users.length },
      { value: "tribunal", label: "Tribunal", icon: Scale },
      { value: "parental", label: "Contrôle parental", icon: ShieldCheck },
      { value: "settings", label: "Paramètres", icon: Settings }
    ] }
  ] : [{ label: "Édition", items: [
    { value: "bugs", label: "Signalements de bugs", icon: Bug },
    { value: "shop", label: "Studio boutique", icon: ShoppingBag, count: data.shop.length },
    { value: "events", label: "Événements", icon: Sparkles },
    { value: "patchnotes", label: "Patchnotes", icon: Newspaper },
    { value: "help", label: "FAQ et tutos", icon: BookOpen }
  ] }];
  const adminNavigation = adminNavigationGroups.flatMap((group) => group.items);
  const activeNavigation = adminNavigation.find((item) => item.value === tab) ?? adminNavigation[0];
  const formatAdminDate = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Non disponible";

  return (
    <main className="app-shell admin-shell">
      <header className="page-heading admin-topbar">
        <div><span className="eyebrow">{isAdministrator ? "Administration" : "Espace éditeur"}</span><h1>{data.settings?.siteName ?? "KTGA.ME"}</h1><span>{activeNavigation?.label ?? "Back-office"}</span></div>
        <div className="admin-topbar-actions"><span className="status-badge status-active">{isAdministrator ? "Administrateur" : "Éditeur"}</span><button type="button" className="secondary" onClick={() => load()} disabled={loading}><RefreshCw size={18} className={loading ? "spinning" : ""} /> Actualiser</button></div>
      </header>
      {error && <div className="error admin-feedback"><AlertTriangle size={18} /><span>{error}</span><button type="button" className="secondary icon-toggle" onClick={() => setError("")} aria-label="Fermer"><X size={16} /></button></div>}
      {success && <div className="success admin-feedback"><CheckCircle2 size={18} /><span>{success}</span></div>}
      <label className="admin-mobile-nav">Section<select value={tab} onChange={(event) => setTab(event.target.value)}>{adminNavigationGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.items.map((item) => <option key={item.value} value={item.value}>{item.label}{item.count !== undefined ? ` (${item.count})` : ""}</option>)}</optgroup>)}</select></label>
      <div className="admin-workspace">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-heading"><span>Navigation</span><strong>{isAdministrator ? "Centre de contrôle" : "Outils de contenu"}</strong></div>
          <nav aria-label="Sections d'administration">{adminNavigationGroups.map((group) => <section key={group.label}><h2>{group.label}</h2>{group.items.map((item) => { const Icon = item.icon; return <button type="button" key={item.value} className={tab === item.value ? "active" : ""} onClick={() => setTab(item.value)}><Icon size={18} /><span>{item.label}</span>{item.count !== undefined && <b>{item.count}</b>}</button>; })}</section>)}</nav>
          <button type="button" className="admin-sidebar-back" onClick={onBack}><ArrowLeft size={17} /> Retour au casino</button>
        </aside>

        <section className="admin-content">
      {loading ? <section className="card admin-loading"><RefreshCw className="spinning" /><strong>Chargement du back-office…</strong></section> : <>
        {isAdministrator && tab === "overview" && <AdminOverview overview={overview} settings={data.settings ?? {}} onNavigate={setTab} formatDate={formatAdminDate} />}


        {isAdministrator && tab === "health" && <ServerHealth reportError={setError} />}
        {tab === "bugs" && <BugReportsAdmin />}

        {data.permissions?.manageCommunityEvents && tab === "events" && <CommunityEventsAdmin shop={data.shop} canOperate={Boolean(data.permissions?.operateCommunityEvents)} reportError={setError} />}

        {data.permissions?.manageAchievements && tab === "achievements" && <AchievementsAdmin achievements={data.achievements} schemas={data.achievementRuleSchemas} games={data.games} shop={data.shop} reload={load} reportError={setError} notifySuccess={notifySuccess} />}

        {tab === "patchnotes" && <PatchnotesAdmin reportError={setError} notifySuccess={notifySuccess} />}
        {tab === "help" && <HelpAdmin reportError={setError} notifySuccess={notifySuccess} />}

        {(tab === "shop" || (isAdministrator && ["users", "games"].includes(tab))) && <section className="card admin-list" ref={pages.anchor}>
          <div className="admin-section-heading">
            <div><span className="eyebrow">Catalogue</span><h2>{tab === "users" ? "Comptes joueurs" : tab === "games" ? "Jeux disponibles" : "Objets de la boutique"}</h2><small>{rows.length} résultat{rows.length > 1 ? "s" : ""} sur {tab === "users" ? data.users.length : tab === "games" ? data.games.length : data.shop.length}</small></div>
            {tab === "shop" && <button type="button" onClick={() => openEditor("new-shop", { name: "", description: "", price: 0, type: "icons", category: "classic", icon: "chip", css: "", packName: "" })}><Plus size={17} /> Créer un objet</button>}
          </div>
          {tab === "shop" && !isAdministrator && <div className="editor-scope-notice"><Shield size={20} /><div><strong>Espace éditeur</strong><span>Tu peux créer, dupliquer, modifier et supprimer les objets personnalisés. Les objets intégrés servent de références et restent protégés.</span></div></div>}
          {tab === "users" && <><div className="admin-user-list-summary"><article><Users /><span>Comptes</span><strong>{data.users.length}</strong></article><article><CheckCircle2 /><span>Emails validés</span><strong>{data.users.filter((entry) => entry.emailVerified).length}</strong></article><article><AlertTriangle /><span>À valider</span><strong>{data.users.filter((entry) => !entry.legacyLogin && !entry.emailVerified).length}</strong></article><article><Lock /><span>Anciens identifiants</span><strong>{data.users.filter((entry) => entry.legacyLogin).length}</strong></article></div><div className="admin-filters admin-user-filters"><label className="admin-search-field">Rechercher<span><Search size={17} /><input value={filters.userSearch} onChange={(event) => updateFilter("userSearch", event.target.value)} placeholder="Pseudo, email, bio ou identifiant" /></span></label><label>État<select value={filters.userStatus} onChange={(event) => updateFilter("userStatus", event.target.value)}><option value="all">Tous les états</option><option value="active">Actifs</option><option value="inactive">Désactivés</option></select></label><label>Rôle<select value={filters.userRole} onChange={(event) => updateFilter("userRole", event.target.value)}><option value="all">Tous les rôles</option><option value="admin">Administrateurs</option><option value="editor">Éditeurs</option><option value="player">Joueurs</option></select></label><label>Email<select value={filters.userEmail} onChange={(event) => updateFilter("userEmail", event.target.value)}><option value="all">Tous</option><option value="verified">Validés</option><option value="pending">À valider</option><option value="legacy">Anciens identifiants</option></select></label><label>Trier<select value={filters.userSort} onChange={(event) => updateFilter("userSort", event.target.value)}><option value="recent">Inscription récente</option><option value="name">Pseudo</option><option value="activity">Activité</option><option value="balance">Solde</option></select></label></div></>}
          {tab === "games" && <div className="admin-filters"><label className="admin-search-field">Rechercher<span><Search size={17} /><input value={filters.gameSearch} onChange={(event) => updateFilter("gameSearch", event.target.value)} placeholder="Nom, catégorie ou identifiant" /></span></label><label>Type<select value={filters.gameType} onChange={(event) => updateFilter("gameType", event.target.value)}><option value="all">Tous les types</option><option value="dice">Jeux de dés</option><option value="cards">Jeux de cartes</option></select></label><label>Publication<select value={filters.gameStatus} onChange={(event) => updateFilter("gameStatus", event.target.value)}><option value="all">Tous</option><option value="enabled">Publiés</option><option value="disabled">Masqués</option></select></label></div>}
          {tab === "shop" && <div className="admin-filters"><label className="admin-search-field">Rechercher<span><Search size={17} /><input value={filters.shopSearch} onChange={(event) => updateFilter("shopSearch", event.target.value)} placeholder="Nom, description ou identifiant" /></span></label><label>Type<select value={filters.shopType} onChange={(event) => updateFilter("shopType", event.target.value)}><option value="all">Tous les types</option>{["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"].map((type) => <option key={type} value={type}>{shopTypeLabel(type)}</option>)}</select></label><label>Collection<select value={filters.shopCategory} onChange={(event) => updateFilter("shopCategory", event.target.value)}><option value="all">Toutes les collections</option>{shopCategories.map((category) => <option key={category} value={category}>{shopCategoryLabel(category)}</option>)}</select></label><label>Origine<select value={filters.shopOrigin} onChange={(event) => updateFilter("shopOrigin", event.target.value)}><option value="all">Toutes</option><option value="custom">Personnalisés</option><option value="built-in">Intégrés</option></select></label></div>}
          <div className="ledger admin-ledger">
            <table className="score-table admin-table">
              <thead><tr>{tab === "users" ? <><th>Joueur</th><th>Activité</th><th>Solde</th><th>État</th></> : tab === "games" ? <><th>Jeu</th><th>Classification</th><th>Entrée</th><th>Publication</th></> : <><th>Objet</th><th>Type</th><th>Prix</th><th>Origine</th></>}<th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{pages.rows.map((row) => <tr key={row.id}>
                {tab === "users" && <><td><strong>{row.displayName}</strong><small>{row.login}</small>{row.dataRequestPending > 0 && <span className="status-badge status-waiting">Demande de données à traiter</span>}<div className="admin-account-badges"><span className={`status-badge ${row.legacyLogin ? "status-inactive" : row.emailVerified ? "status-active" : "status-waiting"}`}>{row.legacyLogin ? "Ancien identifiant" : row.emailVerified ? "Email validé" : "À valider"}</span>{row.admin ? <span className="status-badge status-custom">Admin</span> : row.editor ? <span className="status-badge status-custom">Éditeur</span> : null}</div></td><td><strong><CompactNumber value={row.gamesPlayed} suffix=" partie(s)" /></strong><small><CompactNumber value={row.wins} suffix=" victoire(s)" /> · inscrit {formatAdminDate(row.createdAt)}</small><small>Connexion : {formatAdminDate(row.lastLoginAt)}</small></td><td><strong><CompactNumber value={row.tokens} label="Solde exact" /></strong><small>Dernier bonus : {row.lastDailyClaim ?? "jamais"}</small></td><td><span className={`status-badge ${row.active ? "status-active" : "status-inactive"}`}>{row.active ? "Actif" : "Désactivé"}</span></td></>}
                {tab === "games" && <><td><strong>{row.name}</strong><small>{row.id} · position {row.position}</small></td><td><strong>{gameCategoryLabel(row.category)}</strong><small>{gameAudienceLabel(row.audience)} · {gameComplexityLabel(row.complexity)}</small></td><td><strong><CompactNumber value={row.entryPot ?? 0} label="Pot d’entrée exact" /></strong><small>{row.minPlayers}-{row.maxPlayers} joueur(s)</small></td><td><span className={`status-badge ${row.enabled !== false ? "status-active" : "status-inactive"}`}>{row.enabled !== false ? "Publié" : "Masqué"}</span></td></>}
                {tab === "shop" && <><td><strong>{row.name}</strong><small>{row.id}</small></td><td><strong>{shopTypeLabel(row.type)}</strong><small>{shopCategoryLabel(row.category)}</small></td><td><strong><CompactNumber value={row.price} label="Prix exact" /></strong><small>{row.design ? "Créé avec le studio" : "CSS avancé"}</small></td><td><span className={`status-badge ${row.id.startsWith("custom-") ? "status-custom" : "status-built-in"}`}>{row.id.startsWith("custom-") ? "Personnalisé" : "Intégré"}</span></td></>}
                <td><div className="admin-row-actions">{tab === "shop" && <ConfirmActionButton className="secondary icon-toggle" disabled={Boolean(saving)} title="Dupliquer en objet personnalisé" dialogTitle="Dupliquer cet objet ?" message={`Une copie de « ${row.name} » sera ajoutée à la boutique comme objet personnalisé.`} confirmLabel="Dupliquer l’objet" onConfirm={() => duplicateShopItem(row)}><Copy size={16} /></ConfirmActionButton>}{tab === "shop" && !data.permissions?.editBuiltInShopItems && !row.id.startsWith("custom-") ? <span className="admin-locked-action" title="Objet intégré protégé"><Lock size={15} /> Protégé</span> : <button type="button" className="secondary" onClick={() => openEditor(tab === "users" ? "user" : tab === "games" ? "game" : "shop", row)}>Modifier</button>}</div></td>
              </tr>)}</tbody>
            </table>
            {!rows.length && <div className="empty-state"><Search size={24} /><strong>Aucun résultat</strong><span>Modifie les filtres ou la recherche pour afficher d’autres éléments.</span></div>}
          </div>
          <Pagination {...pages} label={`Pages ${tab === "users" ? "des joueurs" : tab === "games" ? "des jeux" : "de la boutique admin"}`} />
        </section>}

        {isAdministrator && tab === "parental" && <ParentalApprovals onSettingsChange={(settings) => { setSettingsDraft(settings); setData((current) => ({ ...current, settings })); onSettingsChange?.(settings); }} />}
        {isAdministrator && tab === "tribunal" && <TribunalAdmin reportError={setError} notifySuccess={notifySuccess} />}
        {isAdministrator && tab === "settings" && <CasinoSettings draft={settingsDraft} setDraft={setSettingsDraft} onSubmit={saveSettings} saving={saving === "settings"} />}
      </>}
        </section>
      </div>

      {editing?.kind === "user" && <UserEditor row={editing.item} currentUser={user} games={data.games} settings={settingsDraft} onClose={() => setEditing(null)} onSaved={() => load(false)} notifySuccess={notifySuccess} reportError={setError} />}
      {editing && editing.kind !== "user" && <ModalBackdrop className="modal-backdrop" onClick={() => setEditing(null)}>
        <form className={`modal admin-editor ${editing.kind.includes("shop") ? "shop-admin-editor" : ""}`} onSubmit={(event) => { event.preventDefault(); save(); }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-title-row"><div><span className="eyebrow">Édition</span><h2>{editorTitle}</h2><small>{editing.item.id}</small></div><button type="button" className="secondary icon-toggle" onClick={() => setEditing(null)} aria-label="Fermer"><X size={18} /></button></div>
          {isShopEditor ? <ShopStudio
            item={editing.item}
            kind={editing.kind}
            user={user}
            shop={data.shop}
            pricingGuide={pricingGuide}
            isAdministrator={isAdministrator}
            section={shopEditorSection}
            onSectionChange={setShopEditorSection}
            onUpdate={updateItem}
            onActivateVisualDesigner={activateVisualDesigner}
            onDisableVisualDesigner={disableVisualDesigner}
            saving={saving === "editor"}
            onDuplicate={() => setConfirmAction({ title: "Dupliquer cet objet ?", message: `Une copie de « ${editing.item.name} » sera ajoutée à la boutique avec les réglages actuellement affichés.`, label: "Dupliquer l’objet", danger: false, run: () => duplicateShopItem(editing.item) })}
            onDelete={() => requestAdminAction({ title: "Supprimer cet objet ?", message: `${editing.item.name} sera retiré de la boutique.`, label: "Supprimer l’objet", path: `/api/admin/shop/${editing.item.id}`, method: "DELETE" })}
            onCancel={() => setEditing(null)}
          /> : <div className="admin-editor-fields">
              {editing.kind === "game" && <>
                <GameDefaults game={editing.item} onChange={(value) => updateItem("defaultModifiers", value)} />
                <section className="admin-form-section"><div className="admin-form-section-title"><Gamepad2 /><div><h3>Présentation</h3><p>Ces informations sont visibles sur la page d’accueil.</p></div></div><label>Nom du jeu<input required value={editing.item.name} onChange={(e) => updateItem("name", e.target.value)} /></label><label>Description publique<textarea required value={editing.item.description ?? ""} onChange={(e) => updateItem("description", e.target.value)} maxLength={240} /><small>{editing.item.description?.length ?? 0}/240 caractères</small></label></section>
                <section className="admin-form-section"><div className="admin-form-section-title"><Settings /><div><h3>Classement et disponibilité</h3><p>Le type technique et le nombre de joueurs sont définis par le moteur du jeu.</p></div></div><div className="admin-field-grid"><label>Catégorie<select value={editing.item.category ?? "score"} onChange={(e) => updateItem("category", e.target.value)}>{[...new Set(data.games.map((game) => game.category))].map((value) => <option key={value} value={value}>{gameCategoryLabel(value)}</option>)}</select></label><label>Public<select value={editing.item.audience ?? "multi"} onChange={(e) => updateItem("audience", e.target.value)}><option value="solo">Solo</option><option value="multi">Multijoueur</option><option value="solo-multi">Solo et multijoueur</option></select></label><label>Complexité<select value={editing.item.complexity ?? "intermediate"} onChange={(e) => updateItem("complexity", e.target.value)}><option value="easy">Accessible</option><option value="intermediate">Intermédiaire</option><option value="advanced">Avancé</option></select></label></div><div className="admin-field-grid"><label>Pot d’entrée<input type="number" min="0" value={editing.item.entryPot ?? 0} onChange={(e) => updateItem("entryPot", Number(e.target.value))} /></label><label>Position sur l’accueil<input type="number" min="1" max={data.games.length} value={editing.item.position ?? 1} onChange={(e) => updateItem("position", Number(e.target.value))} /></label></div><div className="admin-toggle-row"><label><input type="checkbox" checked={editing.item.enabled !== false} onChange={(e) => updateItem("enabled", e.target.checked)} /> Jeu publié sur l’accueil</label></div><div className="admin-tag-preview"><span>{gameCategoryLabel(editing.item.category)}</span><span>{gameAudienceLabel(editing.item.audience)}</span><span>{gameComplexityLabel(editing.item.complexity)}</span><span>{editing.item.minPlayers}-{editing.item.maxPlayers} joueurs</span></div></section>
                {editing.item.id === "texas-holdem" && <section className="admin-form-section poker-game-settings"><div className="admin-form-section-title"><Spade /><div><h3>Paramètres des tables</h3><p>Valeurs proposées lors de la création d’une table de Texas Hold’em.</p></div></div><div className="admin-field-grid"><label>Cave minimale<input type="number" min="1000" max="10000000" value={editing.item.minPokerBuyIn} onChange={(event) => updateItem("minPokerBuyIn", Number(event.target.value))} /></label><label>Grosse blinde par défaut<input type="number" min="2" max={editing.item.minPokerBuyIn} step="2" value={editing.item.pokerDefaultBigBlind} onChange={(event) => updateItem("pokerDefaultBigBlind", Number(event.target.value))} /></label><label>Temps par tour (secondes)<input type="number" min="30" max="600" value={editing.item.pokerTurnSeconds} onChange={(event) => updateItem("pokerTurnSeconds", Number(event.target.value))} /></label></div><div className="blind-ratio settings-blind-preview"><span>Petite blinde<strong>{Math.floor((Number(editing.item.pokerDefaultBigBlind) || 2) / 2)}</strong></span><b>½</b><span>Grosse blinde<strong>{editing.item.pokerDefaultBigBlind}</strong></span></div><small className="field-help">La petite blinde vaut toujours la moitié de la grosse blinde. Ces valeurs concernent les prochaines tables.</small></section>}
              </>}
          </div>}
          {!isShopEditor && <div className="actions admin-editor-actions"><button type="submit" disabled={saving === "editor"}><Save size={18} /> {saving === "editor" ? "Enregistrement…" : "Enregistrer"}</button><button type="button" className="secondary" onClick={() => setEditing(null)}>Annuler</button></div>}
        </form>
      </ModalBackdrop>}
      {confirmAction && <ConfirmDialog title={confirmAction.title} message={confirmAction.message} confirmLabel={confirmAction.label} danger={confirmAction.danger} onConfirm={confirmAction.run} onClose={() => setConfirmAction(null)} />}
    </main>
  );
}
