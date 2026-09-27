import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Coins, X } from "lucide-react";
import { api, installButtonActionFeedback, setToken } from "./api.js";
import { defaultPublicSettings } from "./config/site.js";
import { DisplayName, cosmeticCssRules, setCosmeticCatalogItems } from "./components/cosmetics/Cosmetics.jsx";
import { CasinoHeader } from "./components/navigation/CasinoHeader.jsx";
import { DailyBonusButton } from "./components/navigation/DailyBonusButton.jsx";
import { Dialog } from "./components/common/Dialog.jsx";
import { JoinTable } from "./components/navigation/JoinTable.jsx";
import { useCasinoRoute } from "./navigation/useCasinoRoute.js";
import { CompactNumber } from "./utils/presentation.jsx";
import { AchievementToasts, NotificationCenter } from "./components/feedback/Feedback.jsx";
import { Auth } from "./pages/AuthPage.jsx";
import { Lobby } from "./pages/LobbyPage.jsx";
import { PublicProfileModal } from "./components/profile/PublicProfileModal.jsx";
import { PrivacyProvider, legalLinks, useSiteActivity } from "./privacy/Privacy.jsx";
import "./styles.css";
import "./navigation/casino.css";

const Admin = lazy(() => import("./pages/AdminPage.jsx").then((module) => ({ default: module.Admin })));
const LegalPage = lazy(() => import("./privacy/LegalPage.jsx").then((module) => ({ default: module.LegalPage })));
const CommunityEventPage = lazy(() => import("./pages/CommunityEventPage.jsx").then((module) => ({ default: module.CommunityEventPage })));
const Room = lazy(() => import("./pages/RoomPage.jsx").then((module) => ({ default: module.Room })));
const SpectatorPage = lazy(() => import("./pages/SpectatorPage.jsx").then((module) => ({ default: module.SpectatorPage })));
const Profile = lazy(() => import("./pages/ProfilePage.jsx").then((module) => ({ default: module.Profile })));
const FriendsModal = lazy(() => import("./components/profile/FriendsModal.jsx").then((module) => ({ default: module.FriendsModal })));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage.jsx").then((module) => ({ default: module.LeaderboardPage })));

export default function App() {
  const [user, setUser] = useState(null);
  const [publicSettings, setPublicSettings] = useState(defaultPublicSettings);
  const [roomCode, setRoomCode] = useState(null);
  const [route, goTo] = useCasinoRoute();
  const view = route.view;
  useSiteActivity(user, route);
  const [communityEventSlug, setCommunityEventSlug] = useState(() => route.view === "event" ? route.id : "");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [bonusFeedback, setBonusFeedback] = useState(null);
  const [exclusion, setExclusion] = useState(null);
  const activeUserId = useRef(null);
  activeUserId.current = user?.id;
  const [notifications, setNotifications] = useState([]);
  const [inboxNotifications, setInboxNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [publicProfile, setPublicProfile] = useState(null);
  const [cosmeticStyles, setCosmeticStyles] = useState("");
  const [, setCosmeticCatalogRevision] = useState(0);
  const pendingRoomCode = view === "room" ? route.id : "";
  const knownNotificationIds = useRef(new Set());
  useEffect(() => installButtonActionFeedback(), []);
  useEffect(() => { api("/api/me").then(setUser).catch(() => {}); }, []);
  useEffect(() => { api("/api/config").then((settings) => setPublicSettings({ ...defaultPublicSettings, ...settings })).catch(() => {}); }, []);
  useEffect(() => { document.title = publicSettings.siteName || defaultPublicSettings.siteName; }, [publicSettings.siteName]);
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
    const rows = await api("/api/notifications").catch(() => []);
    if (ownerId !== activeUserId.current) return;
    const lastExclusion = rows.find((row) => row.type === "room-exclusion");
    if (lastExclusion) showExclusion(lastExclusion);
    const nextIds = new Set(rows.map((row) => row.id));
    if (toastNew) {
      const newRows = rows.filter((row) => !knownNotificationIds.current.has(row.id));
      if (newRows.length) {
        const toastItems = newRows.map((row) => ({ ...row, id: `notice-${row.id}`, toastLabel: "Notification" }));
        setNotifications((list) => [...toastItems, ...list].slice(0, 5));
        setTimeout(() => {
          setNotifications((list) => list.filter((notification) => !toastItems.some((item) => item.id === notification.id)));
        }, 6500);
      }
    }
    knownNotificationIds.current = nextIds;
    setInboxNotifications((current) => JSON.stringify(current) === JSON.stringify(rows) ? current : rows);
  }

  useEffect(() => {
    loadInboxNotifications();
    if (!user || user.guest) return undefined;
    const refresh = () => {
      if (document.visibilityState === "visible") loadInboxNotifications({ toastNew: true });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = setInterval(refresh, 60000);
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
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) return;
    const all = await api("/api/achievements").catch(() => []);
    const unlocked = uniqueIds.map((id) => all.find((achievement) => achievement.id === id)).filter(Boolean);
    if (!unlocked.length) return;
    const items = unlocked.map((achievement) => ({ ...achievement, id: `${achievement.id}-${Date.now()}-${Math.random().toString(16).slice(2)}` }));
    setNotifications((list) => [...items, ...list].slice(0, 5));
    setTimeout(() => {
      setNotifications((list) => list.filter((notification) => !items.some((item) => item.id === notification.id)));
    }, 6500);
    await loadInboxNotifications();
  }

  async function logout() {
    if (roomCode) await api(`/api/rooms/${roomCode}/leave`, { method: "POST" }).catch(() => {});
    setBonusFeedback(null);
    setExclusion(null);
    setToken("");
    setUser(null);
    setRoomCode(null);
    setCommunityEventSlug("");
    goTo("lobby", "", { replace: true });
    setFriendsOpen(false);
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

  if (Object.hasOwn(legalLinks, view)) return <Suspense fallback={<main className="legal-page" role="status">Chargement…</main>}><LegalPage view={view} siteName={publicSettings.siteName} onBack={() => goTo("lobby")} /></Suspense>;
  if (!user) return <Auth onAuth={setUser} pendingRoomCode={pendingRoomCode} settings={publicSettings} />;
  return (
    <>
      {cosmeticStyles && <style>{cosmeticStyles}</style>}
      <AchievementToasts notifications={notifications} onClose={(id) => setNotifications((list) => list.filter((notification) => notification.id !== id))} />
      <CasinoHeader user={user} siteName={publicSettings.siteName} siteIcon={publicSettings.siteIcon} view={view} roomCode={roomCode} eventSlug={communityEventSlug} onNavigate={navigate} onFriends={() => { setFriendsOpen(true); setNotificationsOpen(false); }} onLogout={logout}>
      <div className="casino-wallet"><CompactNumber value={user.tokens} label="Solde exact" /><Coins size={18} /></div><DailyBonusButton user={user} setUser={setUser} settings={publicSettings} onAchievements={notifyAchievements} onFeedback={setBonusFeedback} /><div className="identity-pill"><DisplayName user={user} />{user.guest && <small>Invité</small>}</div>{!user.guest && <NotificationCenter items={inboxNotifications} open={notificationsOpen} onToggle={() => setNotificationsOpen((value) => !value)} onDelete={deleteInboxNotification} onClear={clearInboxNotifications} onAction={actOnInboxNotification} />}
      </CasinoHeader>
      {bonusFeedback && <div className={`casino-bonus-feedback ${bonusFeedback.error ? "error" : "daily-bonus-feedback"}`} role={bonusFeedback.error ? "alert" : "status"}><Coins size={18} /><span>{bonusFeedback.message}</span><button type="button" className="secondary icon-toggle" aria-label="Fermer le message du bonus" onClick={() => setBonusFeedback(null)}><X size={16} /></button></div>}
      <Suspense fallback={<main className="app-shell"><section className="panel route-loading" role="status">Chargement de l’interface…</section></main>}>
        {roomCode && <div hidden={view !== "room" || route.id !== roomCode}><Room key={roomCode} code={roomCode} user={user} setUser={setUser} onBack={returnToCasino} onExcluded={handleExclusion} onAchievements={notifyAchievements} /></div>}
        {view === "room" && route.id !== roomCode && <JoinTable key={route.id} code={route.id} user={user} onJoined={openCasinoRoom} onBack={() => goTo("lobby")} />}
        {view === "spectator" && <SpectatorPage key={route.id} code={route.id} user={user} onBack={() => goTo("lobby")} onJoin={() => goTo("room", route.id)} />}
        {view === "event" && <CommunityEventPage key={route.id} slug={route.id} user={user} setUser={setUser} onBack={() => goTo("lobby")} />}
        {view === "leaderboard" && <LeaderboardPage user={user} />}
        {view === "admin" && (user.admin || user.editor) && <Admin user={user} onBack={() => goTo("lobby")} onSettingsChange={(settings) => setPublicSettings({ ...defaultPublicSettings, ...settings })} />}
        {(view === "profile" || view === "shop") && <Profile key={view} mode={view} user={user} setUser={setUser} onOpenShop={() => navigate("shop")} onAchievements={notifyAchievements} />}
        {(view === "not-found" || (view === "admin" && !user.admin && !user.editor)) && <main className="app-shell"><div className="page-heading"><h1>{view === "admin" ? "Accès réservé" : "Page introuvable"}</h1></div><button onClick={() => goTo("lobby")}>Retour au casino</button></main>}
        {view === "lobby" && <Lobby user={user} setUser={setUser} onOpenRoom={openCasinoRoom} onEnterRoom={(code) => goTo("room", code)} onOpenEvent={openCommunityEvent} onAchievements={notifyAchievements} settings={publicSettings} />}
      </Suspense>
      {friendsOpen && <Suspense fallback={<div role="status" className="casino-modal-loading">Chargement des amis…</div>}><FriendsModal user={user} roomCode={roomCode} onClose={() => setFriendsOpen(false)} onOpenRoom={openCasinoRoom} /></Suspense>}
      {exclusion && <Dialog title="Vous avez été exclu" className="action-confirm-modal" layerClassName="action-confirm-layer" onClose={() => setExclusion(null)}><p>{exclusion.message}</p><div className="actions"><button type="button" onClick={() => setExclusion(null)}>J’ai compris</button></div></Dialog>}
      {publicProfile && <PublicProfileModal profile={publicProfile} currentUser={user} onClose={() => setPublicProfile(null)} onFriendRequest={requestFriendFromPublicProfile} />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<PrivacyProvider><App /></PrivacyProvider>);
