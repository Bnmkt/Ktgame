import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Coins, Shield, ShieldAlert, Users, X } from "lucide-react";
import { api, installButtonActionFeedback, setToken } from "./api.js";
import { defaultPublicSettings } from "./config/site.js";
import { softBanLimited } from "./features/accounts/softban.js";
import { completeDiscordReturn } from "./features/accounts/discord-login.js";
import { isDiscordActivityLocation } from "./features/discord/context.js";
import { useInterfaceSounds } from "./components/feedback/InterfaceSounds.jsx";
import { DisplayName, cosmeticCssRules, setCosmeticCatalogItems } from "./components/cosmetics/Cosmetics.jsx";
import { CasinoHeader } from "./components/navigation/CasinoHeader.jsx";
import { DailyBonusButton } from "./components/navigation/DailyBonusButton.jsx";
import { Dialog } from "./components/common/Dialog.jsx";
import { RoomClosedNotice } from "./components/game/RoomClosedNotice.jsx";
import { JoinTable } from "./components/navigation/JoinTable.jsx";
import { useCasinoRoute } from "./navigation/useCasinoRoute.js";
import { RankedCoordinator } from "./features/games/RankedPlay.jsx";
import { appPath } from "./navigation/routes.js";
import { CompactNumber } from "./utils/presentation.jsx";
import { AchievementToasts, NotificationCenter } from "./components/feedback/Feedback.jsx";
import { Auth } from "./pages/AuthPage.jsx";
import { PublicGamesOverview, PublicGamesPage } from "./pages/PublicGamesPage.jsx";
import { applyPageMetadata, pageMetadata, readPublicPageData } from "./seo/metadata.js";
import { PublicCasinoInfo } from "./components/navigation/PublicCasinoInfo.jsx";
import { Lobby } from "./pages/LobbyPage.jsx";
import { PublicProfileModal } from "./components/profile/PublicProfileModal.jsx";
import { ReportPlayerDialog } from "./components/profile/ReportPlayerDialog.jsx";
import { PrivacyProvider, legalLinks, useSiteActivity, useAudienceMeasurement } from "./privacy/Privacy.jsx";
import { BugReportProvider, useBugReportLocation } from "./features/bugs/BugReportProvider.jsx";
import "./styles.css";
import "./navigation/casino.css";
import "./components/social/social.css";
import { InstallNotice } from "./pwa/InstallNotice.jsx";
import { ResourcePreparation, useResourcePreparation } from "./pwa/ResourcePreparation.jsx";
import { LanguagePicker, LocaleProvider, useLocale } from "./locales/LocaleProvider.jsx";
import "./navigation/mobile-casino.css";
import { siteMarkSource } from "./features/site-branding.js";
import { useSiteTheme } from "./features/theme/useSiteTheme.js";
import "./features/theme/theme.css";
import "./features/theme/readability.css";

const Admin = lazy(() => import("./pages/AdminPage.jsx").then((module) => ({ default: module.Admin })));
const LegalPage = lazy(() => import("./privacy/LegalPage.jsx").then((module) => ({ default: module.LegalPage })));
const CommunityEventPage = lazy(() => import("./pages/CommunityEventPage.jsx").then((module) => ({ default: module.CommunityEventPage })));
const Room = lazy(() => import("./pages/RoomPage.jsx").then((module) => ({ default: module.Room })));
const SpectatorPage = lazy(() => import("./pages/SpectatorPage.jsx").then((module) => ({ default: module.SpectatorPage })));
const Profile = lazy(() => import("./pages/ProfilePage.jsx").then((module) => ({ default: module.Profile })));
const FriendsModal = lazy(() => import("./components/profile/FriendsModal.jsx").then((module) => ({ default: module.FriendsModal })));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage.jsx").then((module) => ({ default: module.LeaderboardPage })));
const StatusPage = lazy(() => import("./pages/StatusPage.jsx").then((module) => ({ default: module.StatusPage })));
const PatchnotesPage = lazy(() => import("./pages/PatchnotesPage.jsx").then((module) => ({ default: module.PatchnotesPage })));
const BugReportsPage = lazy(() => import("./features/bugs/BugReportsPage.jsx").then((module) => ({ default: module.BugReportsPage })));
const ParentalPortalPage = lazy(() => import("./privacy/ParentalPortalPage.jsx").then((module) => ({ default: module.ParentalPortalPage })));
const TribunalPage = lazy(() => import("./pages/TribunalPage.jsx").then((module) => ({ default: module.TribunalPage })));
const SocialPanel = lazy(() => import("./components/social/SocialPanel.jsx").then((module) => ({ default: module.SocialPanel })));
const HelpPage = lazy(() => import("./components/help/HelpContent.jsx").then((module) => ({ default: module.HelpPage })));
const CustomPage = lazy(() => import("./pages/CustomPage.jsx").then(module => ({ default: module.CustomPage })));
const HelpOnboarding = lazy(() => import("./components/help/HelpOnboarding.jsx").then((module) => ({ default: module.HelpOnboarding })));
const MascotGift = lazy(() => import("./components/cosmetics/MascotGift.jsx").then((module) => ({ default: module.MascotGift })));
const publicPageData = readPublicPageData();

export default function App() {
  useInterfaceSounds();
  const preparingResources = useResourcePreparation();
  const { t: localeText } = useLocale();
  const [user, setUser] = useState(null);
  const [mascotGiftPending, setMascotGiftPending] = useState(true);
  useEffect(() => { setMascotGiftPending(true); }, [user?.id]);
  const { bindAccount } = useLocale();
  useEffect(() => { bindAccount(user, setUser); }, [user?.id, bindAccount]);
  const [accountReady, setAccountReady] = useState(false);
  const [discordResult, setDiscordResult] = useState(null);
  const [accountRecovery, setAccountRecovery] = useState(() => new URL(window.location.href).searchParams.has("reset-password"));
  const [publicSettings, setPublicSettings] = useState({ ...defaultPublicSettings, ...publicPageData?.settings });
  useSiteTheme(publicSettings.appearance);
  const [publicGames, setPublicGames] = useState(publicPageData?.games ?? []);
  useEffect(() => {
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) { icon.href = publicSettings.faviconImage || "/api/branding/favicon"; if (publicSettings.faviconImage) icon.type = "image/png"; else icon.removeAttribute("type"); }
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (apple) apple.href = publicSettings.pwaIcons?.["180"] || "/api/branding/pwa/180";
  }, [publicSettings.faviconImage, publicSettings.pwaIcons?.["180"]]);
  const [roomCode, setRoomCode] = useState(null);
  const [route, goTo] = useCasinoRoute();
  const view = route.view;
  useBugReportLocation(route, user);
  useSiteActivity(user, route, accountReady);
  useAudienceMeasurement(user, route, (accountReady || Boolean(user)) && !accountRecovery);
  useEffect(() => {
    if (!user?.minor?.restricted) return undefined;
    const send = () => api("/api/me/guardian-activity", { method: "POST", background: true, body: JSON.stringify({ page: route.view }) }).catch(() => {});
    send();
    const timer = setInterval(send, 30000);
    return () => clearInterval(timer);
  }, [user?.id, user?.minor?.restricted, route.view]);
  const [communityEventSlug, setCommunityEventSlug] = useState(() => route.view === "event" ? route.id : "");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [conversationUnread, setConversationUnread] = useState(0);
  const [conversationRequest, setConversationRequest] = useState({ friendId: "", revision: 0 });
  useEffect(() => { setConversationUnread(0); setConversationRequest({ friendId: "", revision: 0 }); setSocialOpen(false); }, [user?.id]);
  const [tribunalAvailable, setTribunalAvailable] = useState(false);
  const [bonusFeedback, setBonusFeedback] = useState(null);
  const [exclusion, setExclusion] = useState(null);
  const [roomClosure, setRoomClosure] = useState(null);
  const activeUserId = useRef(null);
  activeUserId.current = user?.id;
  const [notifications, setNotifications] = useState([]);
  const [inboxNotifications, setInboxNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [publicProfile, setPublicProfile] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [cosmeticStyles, setCosmeticStyles] = useState("");
  const [, setCosmeticCatalogRevision] = useState(0);
  const pendingRoomCode = view === "room" ? route.id : "";
  const knownNotificationIds = useRef(new Set());
  const inboxRevision = useRef(0);
  const inboxInitialized = useRef(false);
  useEffect(() => installButtonActionFeedback(), []);
  useEffect(() => {
    if (accountRecovery) {
      setToken("");
      setUser(null);
      return;
    }
    let cancelled = false;
    setAccountReady(false);
    const discordCompletion = completeDiscordReturn();
    if (discordCompletion) {
      discordCompletion.then((result) => {
        if (cancelled) return;
        if (result.token) setToken(result.token);
        if (result.user) setUser(result.user);
        setDiscordResult(result); setAccountReady(true);
      }).catch(async (error) => {
        const account = await api("/api/me").catch(() => null);
        if (cancelled) return;
        setUser(account); setDiscordResult({ error }); setAccountReady(true);
      });
    } else if (isDiscordActivityLocation()) {
      import("./features/discord/runtime.js").then(module => module.loginInActivity()).then(result => {
        if (cancelled) return;
        if (result.token) setToken(result.token);
        if (result.user) setUser(result.user);
        if (result.mfaRequired) setDiscordResult(result);
        setAccountReady(true);
      }).catch(error => { if (!cancelled) { setToken(""); setDiscordResult({ error }); setAccountReady(true); } });
    } else api("/api/me").then((account) => { if (!cancelled) { setUser(account); setAccountReady(true); } }).catch((error) => { if (!cancelled) { setToken(""); setAccountReady(error.status === 401); } });
    return () => { cancelled = true; };
  }, [accountRecovery]);
  useEffect(() => { api("/api/config").then((settings) => setPublicSettings({ ...defaultPublicSettings, ...settings })).catch(() => {}); }, []);
  useEffect(() => { api("/api/games").then(setPublicGames).catch(() => {}); }, []);
  useEffect(() => {
    if (["patchnotes", "page"].includes(view)) return;
    applyPageMetadata(pageMetadata({ pathname: window.location.pathname, search: window.location.search, basePath: (import.meta.env.BASE_URL || "/").replace(/\/$/, ""), siteName: publicSettings.siteName, games: publicGames }));
  }, [route, publicSettings.siteName, publicGames]);
  useEffect(() => {
    if (!user || user.guest || user.minor?.restricted || softBanLimited(user, "tribunal:vote")) return setTribunalAvailable(false);
    let cancelled = false;
    const load = () => api("/api/tribunal/availability", { background: true }).then((result) => { if (!cancelled) setTribunalAvailable(Boolean(result.available)); }).catch(() => {});
    load();
    const timer = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [user?.id, user?.guest, user?.minor?.restricted, user?.moderation?.type, user?.moderation?.restrictions?.join(",")]);
  useEffect(() => {
    document.documentElement.classList.toggle("room-route-active", view === "room");
    return () => document.documentElement.classList.remove("room-route-active");
  }, [view]);
  useEffect(() => {
    const loadCosmeticStyles = () => api("/api/shop").then((items) => {
      setCosmeticCatalogItems(items);
      setCosmeticStyles(cosmeticCssRules(items));
      setCosmeticCatalogRevision((revision) => revision + 1);
    }).catch(() => {});
    loadCosmeticStyles();
    window.addEventListener("ktga-shop-updated", loadCosmeticStyles);
    return () => window.removeEventListener("ktga-shop-updated", loadCosmeticStyles);
  }, []);
  useEffect(() => {
    const openProfile = async (event) => {
      if (!event.detail) return;
      const profile = await api(`/api/users/${event.detail}/public`).catch(() => null);
      if (profile) { setFriendsOpen(false); setPublicProfile(profile); }
    };
    window.addEventListener("ktga-public-profile", openProfile);
    return () => window.removeEventListener("ktga-public-profile", openProfile);
  }, []);

  async function requestFriendFromPublicProfile(userId) {
    await api("/api/friends/request", { method: "POST", body: JSON.stringify({ userId }) });
    const profile = await api(`/api/users/${userId}/public`);
    setPublicProfile(profile);
  }

  const showExclusion = useCallback((notification) => {
    const key = `ktga-exclusion:${activeUserId.current}:${notification.id}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "shown");
    setExclusion(notification);
  }, []);

  const showRoomClosure = useCallback((payload) => {
    const code = payload.roomCode ?? payload.code;
    const key = `ktga-room-inactivity:${activeUserId.current}:${code}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "shown");
    } catch { /* The notice remains usable when local storage is unavailable. */ }
    setRoomClosure({ code });
  }, []);

  const handleExclusion = useCallback((payload) => {
    if (payload.playerId !== activeUserId.current) return;
    const notification = payload.notification ?? { id: `exclusion-${Date.now()}`, type: "room-exclusion", title: "Vous avez été exclu", message: payload.reason === "timeout" ? "Votre place a été libérée après une période d’inactivité." : "Vous avez été exclu de cette table." };
    showExclusion(notification);
    knownNotificationIds.current.add(notification.id);
    setNotifications((rows) => [{ ...notification, id: `notice-${notification.id}` }, ...rows].slice(0, 5));
    setTimeout(() => setNotifications((rows) => rows.filter((row) => row.id !== `notice-${notification.id}`)), 6500);
    setInboxNotifications((rows) => [notification, ...rows.filter((row) => row.id !== notification.id)]);
    setRoomCode(null);
    setFriendsOpen(false);
    setSocialOpen(false);
    setPublicProfile(null);
    setNotificationsOpen(false);
    goTo("lobby");
  }, [goTo, showExclusion]);

  async function loadInboxNotifications({ toastNew = false } = {}) {
    if (!user || user.guest) {
      setInboxNotifications([]);
      knownNotificationIds.current = new Set();
      return;
    }
    const ownerId = user.id;
    const revision = ++inboxRevision.current;
    const rows = await api("/api/notifications", { background: true }).catch(() => null);
    if (!rows || ownerId !== activeUserId.current || revision !== inboxRevision.current) return;
    const lastExclusion = rows.find((row) => row.type === "room-exclusion");
    if (lastExclusion) showExclusion(lastExclusion);
    const inactiveTable = rows.find((row) => row.type === "room-inactivity");
    if (inactiveTable) showRoomClosure(inactiveTable);
    const nextIds = new Set(rows.map((row) => row.id));
    if (toastNew && inboxInitialized.current) {
      const newRows = rows.filter((row) => !knownNotificationIds.current.has(row.id));
      if (newRows.length) {
        const toastItems = newRows.map((row) => ({ ...row, id: `notice-${row.id}`, toastLabel: row.type === "achievement" ? "Succès débloqué" : "Notification" }));
        setNotifications((list) => [...toastItems, ...list].slice(0, 5));
        setTimeout(() => {
          setNotifications((list) => list.filter((notification) => !toastItems.some((item) => item.id === notification.id)));
        }, 6500);
      }
    }
    knownNotificationIds.current = nextIds;
    inboxInitialized.current = true;
    setInboxNotifications((current) => JSON.stringify(current) === JSON.stringify(rows) ? current : rows);
  }

  useEffect(() => {
    inboxRevision.current += 1;
    knownNotificationIds.current = new Set();
    inboxInitialized.current = false;
    setInboxNotifications([]);
    loadInboxNotifications();
    if (!user || user.guest) return undefined;
    const refresh = () => {
      if (document.visibilityState === "visible") loadInboxNotifications({ toastNew: true });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    window.addEventListener("ktga-inbox-updated", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("ktga-inbox-updated", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, user?.guest]);

  async function deleteInboxNotification(id) {
    await api(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => {});
    await loadInboxNotifications();
  }

  async function clearInboxNotifications() {
    await api("/api/notifications/all", { method: "DELETE" }).catch(() => {});
    await loadInboxNotifications();
  }

  async function actOnInboxNotification(item, action) {
    if (item.type === "friend-request") {
      if (action === "accept") await api(`/api/friends/${item.actorId}/accept`, { method: "POST" });
      if (action === "decline") await api(`/api/friends/${item.actorId}/decline`, { method: "POST" });
      await deleteInboxNotification(item.id);
      window.dispatchEvent(new Event("ktga-connections-updated"));
      return;
    }
    if (item.type === "room-invite" && item.inviteId) {
      if (action === "accept") {
        const room = await api(`/api/room-invites/${item.inviteId}/accept`, { method: "POST" });
        await deleteInboxNotification(item.id);
        openCasinoRoom(room.code, room.spectator);
      } else {
        await api(`/api/room-invites/${item.inviteId}`, { method: "DELETE" });
        await deleteInboxNotification(item.id);
      }
    }
  }

  async function notifyAchievements(ids = []) {
    if (ids.some(Boolean)) {
      await loadInboxNotifications({ toastNew: true });
      api("/api/me", { background: true }).then((updated) => setUser((current) => current?.id === updated.id ? updated : current)).catch(() => {});
    }
  }

  async function logout() {
    if (roomCode) await api(`/api/rooms/${roomCode}/leave`, { method: "POST" }).catch(() => {});
    await api("/api/auth/logout", { method: "POST", background: true }).catch(() => {});
    setBonusFeedback(null);
    setExclusion(null);
    setRoomClosure(null);
    setToken("");
    setUser(null);
    setRoomCode(null);
    setCommunityEventSlug("");
    goTo("lobby", "", { replace: true });
    setFriendsOpen(false);
    setSocialOpen(false);
    setPublicProfile(null);
    setNotifications([]);
    setInboxNotifications([]);
    setNotificationsOpen(false);
    knownNotificationIds.current = new Set();
  }

  const returnToCasino = useCallback(() => {
    setRoomCode(null);
    setPublicProfile(null);
    setNotificationsOpen(false);
    goTo("lobby");
  }, [goTo]);

  const handleRoomClosed = useCallback((payload) => {
    if (payload?.reason === "inactivity" && payload.unfinished) showRoomClosure(payload);
    setRoomCode((current) => current === payload?.code ? null : current);
    if (["room", "spectator"].includes(route.view) && route.id === payload?.code) returnToCasino();
  }, [returnToCasino, showRoomClosure, route.view, route.id]);

  const openCasinoRoom = useCallback((code, spectator = false) => {
    setPublicProfile(null);
    setNotificationsOpen(false);
    setFriendsOpen(false);
    if (!spectator) setRoomCode(code);
    goTo(spectator ? "spectator" : "room", code);
  }, [goTo]);

  const openCommunityEvent = useCallback((slug) => {
    setPublicProfile(null);
    setNotificationsOpen(false);
    setCommunityEventSlug(slug);
    setFriendsOpen(false);
    goTo("event", slug);
  }, [goTo]);

  useEffect(() => {
    const openRoom = (event) => goTo("room", event.detail);
    const watchRoom = (event) => { if (event.detail) goTo("spectator", event.detail); };
    window.addEventListener("ktga-open-room", openRoom);
    window.addEventListener("ktga-watch-room", watchRoom);
    return () => { window.removeEventListener("ktga-open-room", openRoom); window.removeEventListener("ktga-watch-room", watchRoom); };
  }, [openCasinoRoom, goTo]);

  useEffect(() => {
    setPublicProfile(null);
    setNotificationsOpen(false);
    setFriendsOpen(false);
    if (route.view === "event") setCommunityEventSlug(route.id);
  }, [route]);

  function navigate(destination) {
    goTo(destination, destination === "room" ? roomCode : destination === "event" ? communityEventSlug : "");
  }

  const parentAccess = view === "parents" && (new URL(window.location.href).searchParams.has("parental-verify") || new URL(window.location.href).searchParams.has("parental-access"));
  if (publicPageData?.meta.status === 404 && view === "patchnotes" && !user?.admin && !user?.editor && (route.id || new URLSearchParams(window.location.search).get("version")) === publicPageData.meta.id) return <main className="app-shell"><section className="panel"><h1>{localeText("Version introuvable")}</h1><p>{localeText("Cette version n’est pas disponible publiquement.")}</p><a href={appPath("patchnotes")}>{localeText("Patchnotes publiées")}</a></section></main>;
  if (view === "games") return <Suspense fallback={<main className="app-shell" role="status">{localeText("Chargement…")}</main>}><CustomPage key={`game-${route.id || "list"}`} systemRoute={`/jeux${route.id ? `/${route.id}` : ""}`} games={publicGames} user={user} accountReady={accountReady} siteName={publicSettings.siteName} initialPage={publicPageData?.page} fallback={<PublicGamesPage games={publicGames} id={route.id} siteName={publicSettings.siteName} onBack={() => goTo("lobby")}/>}/></Suspense>;
  if (view === "page") return <Suspense fallback={<main className="app-shell" role="status">{localeText("Chargement…")}</main>}><CustomPage key={route.id} slug={route.id} user={user} accountReady={accountReady} siteName={publicSettings.siteName} initialPage={publicPageData?.page}/></Suspense>;
  if (view === "not-found") return <main className="app-shell"><section className="panel"><h1>{localeText("Page introuvable")}</h1><p>{localeText("Cette page n’existe pas ou n’est pas disponible publiquement.")}</p><a href={appPath("lobby")}>{localeText("Retour au casino")}</a></section></main>;
  if (view === "bugs") return <Suspense fallback={<main className="app-shell" role="status">{localeText("Chargement des signalements…")}</main>}><BugReportsPage id={route.id} user={user} onBack={() => goTo("lobby")} onNavigate={(id) => goTo("bugs", id)} /></Suspense>;
  if (["faq", "guide"].includes(view)) return <Suspense fallback={<main className="app-shell" role="status">{localeText("Chargement de l’aide…")}</main>}><HelpPage key={view} mode={view} siteName={publicSettings.siteName} onBack={() => goTo("lobby")} initialDocument={publicPageData?.help} /></Suspense>;
  if (parentAccess) return <Suspense fallback={<main className="legal-page" role="status">{localeText("Chargement de l’espace parent…")}</main>}><ParentalPortalPage siteName={publicSettings.siteName} /></Suspense>;
  if (Object.hasOwn(legalLinks, view)) return <Suspense fallback={<main className="legal-page" role="status">{localeText("Chargement…")}</main>}><CustomPage key={view} systemRoute={appPath(view).slice(appPath("lobby").length - 1)} user={user} accountReady={accountReady} siteName={publicSettings.siteName} initialPage={publicPageData?.page} fallback={<LegalPage view={view} siteName={publicSettings.siteName} supportEmail={publicSettings.supportEmail} onBack={() => goTo("lobby")}/>}/></Suspense>;
  if (view === "status") return <Suspense fallback={<main className="status-page" role="status">{localeText("Chargement de l’état des services…")}</main>}><StatusPage siteName={publicSettings.siteName} onBack={() => goTo("lobby")} /></Suspense>;
  if (view === "patchnotes") return <Suspense fallback={<main className="patchnotes-page" role="status">{localeText("Chargement des patchnotes…")}</main>}><PatchnotesPage siteName={publicSettings.siteName} user={user} onBack={() => goTo("lobby")} initialCatalog={publicPageData?.catalog} initialNote={publicPageData?.note} initialVersion={route.id || ""} /></Suspense>;
  if (isDiscordActivityLocation() && !accountReady && !accountRecovery) return <main className="activity-connecting" role="status"><img src="/pwa/icon-180.png" width="64" height="64" alt=""/><h1>KTGA.ME</h1><p>{localeText("Connexion à Discord…")}</p></main>;
  if (accountRecovery || !user || user.requiresEmailUpgrade || user.requiresEmailVerification) return <><Auth
    onAuth={(account) => { setUser(account); setDiscordResult(null); }}
    onClearSession={() => { setToken(""); setUser(null); }}
    onRecoveryComplete={() => setAccountRecovery(false)}
    currentUser={user}
    pendingRoomCode={pendingRoomCode}
    settings={publicSettings}
    discordResult={discordResult}
  />{view === "lobby" && !accountRecovery && <><PublicGamesOverview games={publicGames} siteName={publicSettings.siteName} featuredGameId={publicSettings.featuredGameId} compact /><PublicCasinoInfo games={publicGames} siteName={publicSettings.siteName}/></>}</>;
  const accountRestrictions = user.minor?.restrictions ?? [];
  const blockedView = view === "shop" && accountRestrictions.includes("shop") || view === "event" && (accountRestrictions.includes("community-events") || softBanLimited(user, "community-events"));
  return (
    <>
      {cosmeticStyles && <style>{cosmeticStyles}</style>}
      {discordResult && !discordResult.mfaRequired && <Dialog onClose={() => setDiscordResult(null)} labelledBy="account-link-result"><h2 id="account-link-result">Discord</h2><p>{discordResult.error ? localeText(discordResult.error.message) : discordResult.linked ? localeText("Compte Discord associé.") : localeText("Connexion Discord réussie.")}</p><button type="button" onClick={() => setDiscordResult(null)}>{localeText("Fermer")}</button></Dialog>}
      <AchievementToasts notifications={notifications} onClose={(id) => setNotifications((list) => list.filter((notification) => notification.id !== id))} />
      <CasinoHeader user={user} siteName={publicSettings.siteName} siteIcon={siteMarkSource(publicSettings)} siteIconFramed={publicSettings.siteIconFramed !== false} view={view} roomCode={roomCode} eventSlug={communityEventSlug} tribunalAvailable={tribunalAvailable} onNavigate={navigate} onLogout={logout}>
      <div className="casino-wallet"><CompactNumber value={user.tokens} label={localeText("Solde exact")} /><Coins size={18} /></div><DailyBonusButton user={user} setUser={setUser} settings={publicSettings} onAchievements={notifyAchievements} onFeedback={setBonusFeedback} /><div className="identity-pill"><DisplayName user={user} />{user.guest && <small>{localeText("Invité")}</small>}{(user.admin || user.editor) && <a href={appPath("admin")} className={`secondary icon-toggle casino-management-link ${view === "admin" ? "active" : ""}`} title={user.admin ? localeText("Administration") : localeText("Studio")} aria-label={user.admin ? localeText("Administration") : localeText("Studio")} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate("admin"); } }}><Shield size={18} /></a>}</div>{!user.guest && <button type="button" className={`secondary icon-toggle conversation-toggle ${socialOpen ? "active" : ""} ${conversationUnread ? "conversation-toggle-unread" : ""}`} title={conversationUnread ? localeText("Social · {value0} messages non lus", { value0: conversationUnread }) : localeText("Social")} aria-label={conversationUnread ? localeText("Ouvrir Social, {value0} messages non lus", { value0: conversationUnread }) : localeText("Ouvrir Social")} aria-expanded={socialOpen} onClick={() => { setSocialOpen((value) => !value); setNotificationsOpen(false); }}><Users size={18} />{conversationUnread > 0 && <span className="conversation-toggle-count" aria-hidden="true">{conversationUnread > 99 ? "99+" : conversationUnread}</span>}</button>}{!user.guest && <NotificationCenter items={inboxNotifications} open={notificationsOpen} onToggle={() => { setNotificationsOpen((value) => !value); setSocialOpen(false); }} onDelete={deleteInboxNotification} onClear={clearInboxNotifications} onAction={actOnInboxNotification} />}
      </CasinoHeader>
      {bonusFeedback && <div className={`casino-bonus-feedback ${bonusFeedback.error ? "error" : "daily-bonus-feedback"}`} role={bonusFeedback.error ? "alert" : "status"}><Coins size={18} /><span>{bonusFeedback.message}</span><button type="button" className="secondary icon-toggle" aria-label={localeText("Fermer le message du bonus")} onClick={() => setBonusFeedback(null)}><X size={16} /></button></div>}
      {!user.guest && <RankedCoordinator key={user.id} user={user} onOpenRoom={openCasinoRoom}/>}
      <Suspense fallback={<main className="app-shell"><section className="panel route-loading" role="status">{localeText("Chargement de l’interface…")}</section></main>}>
        {roomCode && <div hidden={view !== "room" || route.id !== roomCode}><Room key={roomCode} code={roomCode} user={user} setUser={setUser} onBack={returnToCasino} onClosed={handleRoomClosed} onExcluded={handleExclusion} onAchievements={notifyAchievements} /></div>}
        {view === "room" && route.id !== roomCode && <JoinTable key={route.id} code={route.id} user={user} onJoined={openCasinoRoom} onBack={() => goTo("lobby")} />}
        {view === "spectator" && <SpectatorPage key={route.id} code={route.id} user={user} onBack={() => goTo("lobby")} onClosed={handleRoomClosed} onJoin={openCasinoRoom} />}
        {view === "event" && !blockedView && <CommunityEventPage key={route.id} slug={route.id} user={user} setUser={setUser} onBack={() => goTo("lobby")} />}
        {view === "leaderboard" && <LeaderboardPage user={user} />}
        {view === "tribunal" && <TribunalPage />}
        {view === "admin" && (user.admin || user.editor) && <Admin user={user} onBack={() => goTo("lobby")} onSettingsChange={(settings) => setPublicSettings({ ...defaultPublicSettings, ...settings })} />}
        {blockedView && <RestrictedFeature onBack={() => goTo("lobby")} />}
        {(view === "profile" || view === "shop" && !blockedView) && <Profile key={view} mode={view} user={user} setUser={setUser} onOpenShop={() => navigate("shop")} onAchievements={notifyAchievements} />}
        {(view === "not-found" || (view === "admin" && !user.admin && !user.editor)) && <main className="app-shell"><div className="page-heading"><h1>{view === "admin" ? localeText("Accès réservé") : localeText("Page introuvable")}</h1></div><button onClick={() => goTo("lobby")}>{localeText("Retour au casino")}</button></main>}
        {view === "lobby" && <Lobby user={user} setUser={setUser} onOpenRoom={openCasinoRoom} onEnterRoom={(code) => goTo("room", code)} onOpenEvent={openCommunityEvent} onAchievements={notifyAchievements} settings={publicSettings} />}
      </Suspense>
      {friendsOpen && <Suspense fallback={<div role="status" className="casino-modal-loading">{localeText("Chargement des amis…")}</div>}><FriendsModal user={user} roomCode={roomCode} onClose={() => setFriendsOpen(false)} onOpenRoom={openCasinoRoom} onStartChat={(friendId) => { setConversationRequest((current) => ({ friendId, revision: current.revision + 1 })); setFriendsOpen(false); setNotificationsOpen(false); setSocialOpen(true); }} /></Suspense>}
      {!user.guest && <Suspense fallback={null}><SocialPanel key={user.id} user={user} siteIcon={siteMarkSource(publicSettings)} onNavigate={(destination, id, options) => goTo(destination, id, options)} roomCode={["room", "spectator"].includes(view) ? route.id : roomCode} open={socialOpen} onUnreadChange={setConversationUnread} requestedFriendId={conversationRequest.friendId} requestedFriendRevision={conversationRequest.revision} onClose={() => setSocialOpen(false)} onFriends={() => { setFriendsOpen(true); setSocialOpen(false); setNotificationsOpen(false); }} /></Suspense>}
      {exclusion && <Dialog title={localeText("Vous avez été exclu")} className="action-confirm-modal" layerClassName="action-confirm-layer" onClose={() => setExclusion(null)}><p>{exclusion.message}</p><div className="actions"><button type="button" onClick={() => setExclusion(null)}>{localeText("J’ai compris")}</button></div></Dialog>}
      {roomClosure && <RoomClosedNotice onClose={() => setRoomClosure(null)}/>}
      {publicProfile && <PublicProfileModal profile={publicProfile} currentUser={user} onClose={() => setPublicProfile(null)} onFriendRequest={requestFriendFromPublicProfile} onReport={(profile) => setReportTarget(profile)} />}
      {reportTarget && <ReportPlayerDialog player={reportTarget} roomCode={roomCode ?? ""} onClose={() => setReportTarget(null)} />}
      {!user.guest && !preparingResources && <Suspense fallback={null}><MascotGift key={user.id} user={user} lobby={view === "lobby"} onClaim={setUser} onPendingChange={setMascotGiftPending}/></Suspense>}
      <Suspense fallback={null}><HelpOnboarding key={user.id} user={user} paused={preparingResources || !user.guest && mascotGiftPending}/></Suspense>
    </>
  );
}

export function CasinoApplication({ children, embedded = false }) {
  const content = <><div className="locale-visitor"><LanguagePicker /></div><PrivacyProvider><BugReportProvider><ResourcePreparation>{!embedded && <InstallNotice />}{children}<App /></ResourcePreparation></BugReportProvider></PrivacyProvider></>;
  return embedded ? content : <LocaleProvider>{content}</LocaleProvider>;
}

function RestrictedFeature({ onBack }) {
  const { t: localeText } = useLocale();
  return <main className="app-shell"><section className="panel restricted-feature"><ShieldAlert size={34} /><span className="eyebrow">{localeText("Accès adapté")}</span><h1>{localeText("Cette fonctionnalité n’est pas disponible")}</h1><p>{localeText("La restriction est appliquée au compte par les règles de protection ou de modération du casino.")}</p><button type="button" onClick={onBack}>{localeText("Retour au casino")}</button></section></main>;
}
