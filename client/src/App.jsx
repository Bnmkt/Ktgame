import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Coins, Shield, ShieldAlert, Users, X } from "lucide-react";
import { api, installButtonActionFeedback, setToken } from "./api.js";
import { defaultPublicSettings } from "./config/site.js";
import { DisplayName, cosmeticCssRules, setCosmeticCatalogItems } from "./components/cosmetics/Cosmetics.jsx";
import { CasinoHeader } from "./components/navigation/CasinoHeader.jsx";
import { DailyBonusButton } from "./components/navigation/DailyBonusButton.jsx";
import { Dialog } from "./components/common/Dialog.jsx";
import { JoinTable } from "./components/navigation/JoinTable.jsx";
import { useCasinoRoute } from "./navigation/useCasinoRoute.js";
import { RankedCoordinator } from "./features/games/RankedPlay.jsx";
import { appPath } from "./navigation/routes.js";
import { CompactNumber } from "./utils/presentation.jsx";
import { AchievementToasts, NotificationCenter } from "./components/feedback/Feedback.jsx";
import { Auth } from "./pages/AuthPage.jsx";
import { Lobby } from "./pages/LobbyPage.jsx";
import { PublicProfileModal } from "./components/profile/PublicProfileModal.jsx";
import { ReportPlayerDialog } from "./components/profile/ReportPlayerDialog.jsx";
import { PrivacyProvider, legalLinks, useSiteActivity } from "./privacy/Privacy.jsx";
import { BugReportProvider, useBugReportLocation } from "./features/bugs/BugReportProvider.jsx";
import "./styles.css";
import "./navigation/casino.css";
import "./components/social/social.css";

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
const HelpOnboarding = lazy(() => import("./components/help/HelpOnboarding.jsx").then((module) => ({ default: module.HelpOnboarding })));

export default function App() {
  const [user, setUser] = useState(null);
  const [accountRecovery, setAccountRecovery] = useState(() => new URL(window.location.href).searchParams.has("reset-password"));
  const [publicSettings, setPublicSettings] = useState(defaultPublicSettings);
  const [roomCode, setRoomCode] = useState(null);
  const [route, goTo] = useCasinoRoute();
  const view = route.view;
  useBugReportLocation(route, user);
  useSiteActivity(user, route);
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
    api("/api/me").then(setUser).catch(() => setToken(""));
  }, [accountRecovery]);
  useEffect(() => { api("/api/config").then((settings) => setPublicSettings({ ...defaultPublicSettings, ...settings })).catch(() => {}); }, []);
  useEffect(() => { document.title = publicSettings.siteName || defaultPublicSettings.siteName; }, [publicSettings.siteName]);
  useEffect(() => {
    if (!user || user.guest || user.minor?.restricted || user.moderation?.type === "soft") return setTribunalAvailable(false);
    let cancelled = false;
    const load = () => api("/api/tribunal/availability", { background: true }).then((result) => { if (!cancelled) setTribunalAvailable(Boolean(result.available)); }).catch(() => {});
    load();
    const timer = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [user?.id, user?.guest, user?.minor?.restricted, user?.moderation?.type]);
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
  if (view === "bugs") return <Suspense fallback={<main className="app-shell" role="status">Chargement des signalements…</main>}><BugReportsPage id={route.id} user={user} onBack={() => goTo("lobby")} onNavigate={(id) => goTo("bugs", id)} /></Suspense>;
  if (["faq", "guide"].includes(view)) return <Suspense fallback={<main className="app-shell" role="status">Chargement de l’aide…</main>}><HelpPage key={view} mode={view} siteName={publicSettings.siteName} onBack={() => goTo("lobby")} /></Suspense>;
  if (parentAccess) return <Suspense fallback={<main className="legal-page" role="status">Chargement de l’espace parent…</main>}><ParentalPortalPage siteName={publicSettings.siteName} /></Suspense>;
  if (Object.hasOwn(legalLinks, view)) return <Suspense fallback={<main className="legal-page" role="status">Chargement…</main>}><LegalPage view={view} siteName={publicSettings.siteName} onBack={() => goTo("lobby")} /></Suspense>;
  if (view === "status") return <Suspense fallback={<main className="status-page" role="status">Chargement de l’état des services…</main>}><StatusPage siteName={publicSettings.siteName} onBack={() => goTo("lobby")} /></Suspense>;
  if (view === "patchnotes") return <Suspense fallback={<main className="patchnotes-page" role="status">Chargement des patchnotes…</main>}><PatchnotesPage siteName={publicSettings.siteName} user={user} onBack={() => goTo("lobby")} /></Suspense>;
  if (accountRecovery || !user || user.requiresEmailUpgrade || user.requiresEmailVerification) return <Auth
    onAuth={setUser}
    onClearSession={() => { setToken(""); setUser(null); }}
    onRecoveryComplete={() => setAccountRecovery(false)}
    currentUser={user}
    pendingRoomCode={pendingRoomCode}
    settings={publicSettings}
  />;
  const accountRestrictions = user.minor?.restrictions ?? [];
  const blockedView = view === "shop" && accountRestrictions.includes("shop") || view === "event" && (accountRestrictions.includes("community-events") || user.moderation?.type === "soft");
  return (
    <>
      {cosmeticStyles && <style>{cosmeticStyles}</style>}
      <AchievementToasts notifications={notifications} onClose={(id) => setNotifications((list) => list.filter((notification) => notification.id !== id))} />
      <CasinoHeader user={user} siteName={publicSettings.siteName} siteIcon={publicSettings.siteIcon} view={view} roomCode={roomCode} eventSlug={communityEventSlug} tribunalAvailable={tribunalAvailable} onNavigate={navigate} onLogout={logout}>
      <div className="casino-wallet"><CompactNumber value={user.tokens} label="Solde exact" /><Coins size={18} /></div><DailyBonusButton user={user} setUser={setUser} settings={publicSettings} onAchievements={notifyAchievements} onFeedback={setBonusFeedback} /><div className="identity-pill"><DisplayName user={user} />{user.guest && <small>Invité</small>}{(user.admin || user.editor) && <a href={appPath("admin")} className={`secondary icon-toggle casino-management-link ${view === "admin" ? "active" : ""}`} title={user.admin ? "Administration" : "Studio"} aria-label={user.admin ? "Administration" : "Studio"} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate("admin"); } }}><Shield size={18} /></a>}</div>{!user.guest && <button type="button" className={`secondary icon-toggle conversation-toggle ${socialOpen ? "active" : ""} ${conversationUnread ? "conversation-toggle-unread" : ""}`} title={conversationUnread ? `Social · ${conversationUnread} messages non lus` : "Social"} aria-label={conversationUnread ? `Ouvrir Social, ${conversationUnread} messages non lus` : "Ouvrir Social"} aria-expanded={socialOpen} onClick={() => { setSocialOpen((value) => !value); setNotificationsOpen(false); }}><Users size={18} />{conversationUnread > 0 && <span className="conversation-toggle-count" aria-hidden="true">{conversationUnread > 99 ? "99+" : conversationUnread}</span>}</button>}{!user.guest && <NotificationCenter items={inboxNotifications} open={notificationsOpen} onToggle={() => { setNotificationsOpen((value) => !value); setSocialOpen(false); }} onDelete={deleteInboxNotification} onClear={clearInboxNotifications} onAction={actOnInboxNotification} />}
      </CasinoHeader>
      {bonusFeedback && <div className={`casino-bonus-feedback ${bonusFeedback.error ? "error" : "daily-bonus-feedback"}`} role={bonusFeedback.error ? "alert" : "status"}><Coins size={18} /><span>{bonusFeedback.message}</span><button type="button" className="secondary icon-toggle" aria-label="Fermer le message du bonus" onClick={() => setBonusFeedback(null)}><X size={16} /></button></div>}
      {!user.guest && <RankedCoordinator key={user.id} user={user} onOpenRoom={openCasinoRoom}/>}
      <Suspense fallback={<main className="app-shell"><section className="panel route-loading" role="status">Chargement de l’interface…</section></main>}>
        {roomCode && <div hidden={view !== "room" || route.id !== roomCode}><Room key={roomCode} code={roomCode} user={user} setUser={setUser} onBack={returnToCasino} onExcluded={handleExclusion} onAchievements={notifyAchievements} /></div>}
        {view === "room" && route.id !== roomCode && <JoinTable key={route.id} code={route.id} user={user} onJoined={openCasinoRoom} onBack={() => goTo("lobby")} />}
        {view === "spectator" && <SpectatorPage key={route.id} code={route.id} user={user} onBack={() => goTo("lobby")} onJoin={() => goTo("room", route.id)} />}
        {view === "event" && !blockedView && <CommunityEventPage key={route.id} slug={route.id} user={user} setUser={setUser} onBack={() => goTo("lobby")} />}
        {view === "leaderboard" && <LeaderboardPage user={user} />}
        {view === "tribunal" && <TribunalPage />}
        {view === "admin" && (user.admin || user.editor) && <Admin user={user} onBack={() => goTo("lobby")} onSettingsChange={(settings) => setPublicSettings({ ...defaultPublicSettings, ...settings })} />}
        {blockedView && <RestrictedFeature onBack={() => goTo("lobby")} />}
        {(view === "profile" || view === "shop" && !blockedView) && <Profile key={view} mode={view} user={user} setUser={setUser} onOpenShop={() => navigate("shop")} onAchievements={notifyAchievements} />}
        {(view === "not-found" || (view === "admin" && !user.admin && !user.editor)) && <main className="app-shell"><div className="page-heading"><h1>{view === "admin" ? "Accès réservé" : "Page introuvable"}</h1></div><button onClick={() => goTo("lobby")}>Retour au casino</button></main>}
        {view === "lobby" && <Lobby user={user} setUser={setUser} onOpenRoom={openCasinoRoom} onEnterRoom={(code) => goTo("room", code)} onOpenEvent={openCommunityEvent} onAchievements={notifyAchievements} settings={publicSettings} />}
      </Suspense>
      {friendsOpen && <Suspense fallback={<div role="status" className="casino-modal-loading">Chargement des amis…</div>}><FriendsModal user={user} roomCode={roomCode} onClose={() => setFriendsOpen(false)} onOpenRoom={openCasinoRoom} onStartChat={(friendId) => { setConversationRequest((current) => ({ friendId, revision: current.revision + 1 })); setFriendsOpen(false); setNotificationsOpen(false); setSocialOpen(true); }} /></Suspense>}
      {!user.guest && <Suspense fallback={null}><SocialPanel key={user.id} user={user} roomCode={["room", "spectator"].includes(view) ? route.id : roomCode} open={socialOpen} onUnreadChange={setConversationUnread} requestedFriendId={conversationRequest.friendId} requestedFriendRevision={conversationRequest.revision} onClose={() => setSocialOpen(false)} onFriends={() => { setFriendsOpen(true); setSocialOpen(false); setNotificationsOpen(false); }} /></Suspense>}
      {exclusion && <Dialog title="Vous avez été exclu" className="action-confirm-modal" layerClassName="action-confirm-layer" onClose={() => setExclusion(null)}><p>{exclusion.message}</p><div className="actions"><button type="button" onClick={() => setExclusion(null)}>J’ai compris</button></div></Dialog>}
      {publicProfile && <PublicProfileModal profile={publicProfile} currentUser={user} onClose={() => setPublicProfile(null)} onFriendRequest={requestFriendFromPublicProfile} onReport={(profile) => setReportTarget(profile)} />}
      {reportTarget && <ReportPlayerDialog player={reportTarget} roomCode={roomCode ?? ""} onClose={() => setReportTarget(null)} />}
      <Suspense fallback={null}><HelpOnboarding key={user.id} user={user} /></Suspense>
    </>
  );
}

createRoot(document.getElementById("root")).render(<PrivacyProvider><BugReportProvider><App /></BugReportProvider></PrivacyProvider>);

function RestrictedFeature({ onBack }) {
  return <main className="app-shell"><section className="panel restricted-feature"><ShieldAlert size={34} /><span className="eyebrow">Accès adapté</span><h1>Cette fonctionnalité n’est pas disponible</h1><p>La restriction est appliquée au compte par les règles de protection ou de modération du casino.</p><button type="button" onClick={onBack}>Retour au casino</button></section></main>;
}
