import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe2, GripHorizontal, MessageCircle, MessagesSquare, PanelRight, PictureInPicture2, Plus, ReceiptText, Send, Table2, Volume2, VolumeX, X } from "lucide-react";
import { api } from "../../api.js";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { useConversationInbox } from "./useConversationInbox.js";
import { PresenceDot } from "../profile/FriendPresence.jsx";

const tabs = [
  { id: "journal", label: "Journal", icon: ReceiptText, needsRoom: true },
  { id: "global", label: "Global", icon: Globe2 },
  { id: "direct", label: "Amis", icon: MessagesSquare },
  { id: "room", label: "Table", icon: Table2, needsRoom: true }
];
const formatTime = (value) => new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const savedWindow = () => {
  const initial = { left: 80, top: 90, width: 440, height: Math.max(360, Math.round(window.innerHeight * .5)) };
  try { return { ...initial, ...JSON.parse(localStorage.getItem("ktga-social-window") || "{}"), height: initial.height }; }
  catch { return initial; }
};

export function SocialPanel({ user, roomCode, open, onClose, onFriends, onUnreadChange, requestedFriendId = "", requestedFriendRevision = 0 }) {
  const [mode, setMode] = useState(() => localStorage.getItem("ktga-social-mode") === "floating" ? "floating" : "docked");
  const [activeTab, setActiveTab] = useState(roomCode ? "journal" : "global");
  const [friends, setFriends] = useState([]);
  const [friendId, setFriendId] = useState("");
  const [messages, setMessages] = useState([]);
  const [journal, setJournal] = useState([]);
  const [openedFriends, setOpenedFriends] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [windowRect, setWindowRect] = useState(savedWindow);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const loadedChannel = useRef(null);
  const loadRevision = useRef(0);
  const currentView = useRef(null);
  const canWrite = user.moderation?.type !== "soft" && !(user.minor?.restrictions ?? []).includes("chat");
  const activeFriend = friends.find((friend) => friend.id === friendId);

  const channelQuery = useMemo(() => {
    if (activeTab === "global") return "channelType=global";
    if (activeTab === "direct" && friendId) return `channelType=direct&friendId=${encodeURIComponent(friendId)}`;
    if (activeTab === "room" && roomCode) return `channelType=room&roomCode=${encodeURIComponent(roomCode)}`;
    return "";
  }, [activeTab, friendId, roomCode]);

  const channelInput = useMemo(() => ({ channelType: activeTab, ...(activeTab === "direct" ? { friendId } : {}), ...(activeTab === "room" ? { roomCode } : {}) }), [activeTab, friendId, roomCode]);
  currentView.current = { open, channelQuery };
  const receiveMessage = (message) => {
    const loaded = loadedChannel.current;
    if (!open || loaded?.query !== channelQuery || loaded?.id !== message.channelId || loaded?.type !== message.channelType) return false;
    setMessages((rows) => rows.some((row) => row.id === message.id) ? rows : [...rows, message].slice(-100));
    return document.visibilityState === "visible";
  };
  const { channels, markRead, soundEnabled, toggleSound } = useConversationInbox({ userId: user.id, roomCode, onMessage: receiveMessage, onUnreadChange });
  const friendChannels = new Map(channels.filter((channel) => channel.channelType === "direct").map((channel) => [channel.friendId, channel]));
  const conversations = friends.filter((friend) => friendChannels.get(friend.id)?.opened || openedFriends.includes(friend.id)).sort((left, right) => {
    const leftAt = friendChannels.get(left.id)?.lastMessageAt || "";
    const rightAt = friendChannels.get(right.id)?.lastMessageAt || "";
    return rightAt.localeCompare(leftAt) || left.pseudo.localeCompare(right.pseudo);
  });
  const unreadDirect = channels.filter((channel) => channel.channelType === "direct").reduce((sum, channel) => sum + channel.count, 0);
  const unreadRoom = channels.filter((channel) => channel.channelType === "room").reduce((sum, channel) => sum + channel.count, 0);

  const loadFriends = useCallback(async () => {
    try {
      const payload = await api("/api/friends", { background: true });
      const rows = Array.isArray(payload.friends) ? payload.friends : [];
      setFriends(rows);
      setFriendId((current) => rows.some((friend) => friend.id === current) ? current : "");
    } catch (err) { setError(err.message); }
  }, []);

  const loadActive = useCallback(async (quiet = false) => {
    if (!open || document.visibilityState !== "visible") return;
    const revision = ++loadRevision.current;
    const stillActive = () => revision === loadRevision.current && currentView.current.open && currentView.current.channelQuery === channelQuery;
    if (activeTab === "journal") {
      if (!roomCode) return setJournal([]);
      if (!quiet) setLoading(true);
      try { const payload = await api(`/api/chat/journal?roomCode=${encodeURIComponent(roomCode)}`, { background: quiet }); if (stillActive()) { setJournal(payload.logs ?? []); setError(""); } }
      catch (err) { if (stillActive()) setError(err.message); }
      finally { if (!quiet && stillActive()) setLoading(false); }
      return;
    }
    if (!channelQuery) return setMessages([]);
    if (!quiet) setLoading(true);
    try {
      const payload = await api(`/api/chat/messages?${channelQuery}`, { background: quiet });
      if (!stillActive()) return;
      loadedChannel.current = { ...payload.channel, query: channelQuery };
      setMessages((rows) => {
        const fetched = payload.messages ?? [];
        const ids = new Set(fetched.map((row) => row.id));
        return [...fetched, ...rows.filter((row) => row.channelId === payload.channel?.id && row.channelType === payload.channel?.type && row.createdAt > payload.readAt && !ids.has(row.id))].slice(-100);
      });
      setError("");
      if (document.visibilityState === "visible") markRead(channelInput, payload.readAt);
    } catch (err) { if (stillActive()) setError(err.message); }
    finally { if (!quiet && stillActive()) setLoading(false); }
  }, [activeTab, channelInput, channelQuery, markRead, open, roomCode]);

  useEffect(() => {
    if (!open) return undefined;
    loadFriends();
    const friendTimer = window.setInterval(loadFriends, 10000);
    window.addEventListener("ktga-connections-updated", loadFriends);
    window.addEventListener("ktga-presence-updated", loadFriends);
    return () => { window.clearInterval(friendTimer); window.removeEventListener("ktga-connections-updated", loadFriends); window.removeEventListener("ktga-presence-updated", loadFriends); };
  }, [open, loadFriends]);

  useEffect(() => { loadedChannel.current = null; setMessages([]); setLoading(false); loadActive(); }, [loadActive]);
  useEffect(() => {
    if (!requestedFriendId) return;
    setOpenedFriends((rows) => rows.includes(requestedFriendId) ? rows : [...rows, requestedFriendId]);
    setFriendId(requestedFriendId);
    setActiveTab("direct");
  }, [requestedFriendId, requestedFriendRevision]);
  useEffect(() => {
    if (activeTab === "direct" && !friendId && conversations.length) setFriendId(conversations[0].id);
  }, [activeTab, friendId, conversations]);
  useEffect(() => {
    if (!open) return undefined;
    const delay = activeTab === "journal" ? 2500 : 10000;
    const timer = window.setInterval(() => loadActive(true), delay);
    const onFocus = () => { if (document.visibilityState === "visible") loadActive(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [activeTab, loadActive, open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, journal, activeTab]);
  useEffect(() => {
    document.documentElement.classList.toggle("conversation-drawer-open", open && mode === "docked");
    return () => document.documentElement.classList.remove("conversation-drawer-open");
  }, [mode, open]);
  useEffect(() => {
    if (!roomCode && ["journal", "room"].includes(activeTab)) setActiveTab("global");
  }, [roomCode, activeTab]);

  function toggleMode() {
    const next = mode === "docked" ? "floating" : "docked";
    if (next === "floating") setWindowRect((rect) => ({ ...rect, height: Math.max(360, Math.round(window.innerHeight * .5)), top: Math.min(rect.top, Math.max(8, Math.round(window.innerHeight * .5) - 8)) }));
    setMode(next);
    localStorage.setItem("ktga-social-mode", next);
  }
  function beginDrag(event) {
    if (mode !== "floating" || event.target.closest("button")) return;
    dragRef.current = { x: event.clientX, y: event.clientY, left: windowRect.left, top: windowRect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drag(event) {
    if (!dragRef.current) return;
    const left = Math.max(8, Math.min(window.innerWidth - 260, dragRef.current.left + event.clientX - dragRef.current.x));
    const top = Math.max(8, Math.min(window.innerHeight - 80, dragRef.current.top + event.clientY - dragRef.current.y));
    setWindowRect((rect) => ({ ...rect, left, top }));
  }
  function endDrag() {
    dragRef.current = null;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    setWindowRect(next);
    localStorage.setItem("ktga-social-window", JSON.stringify(next));
  }
  async function send(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !channelQuery) return;
    setSending(true); setError("");
    try {
      const body = { channelType: activeTab, content, ...(activeTab === "direct" ? { friendId } : {}), ...(activeTab === "room" ? { roomCode } : {}) };
      const message = await api("/api/chat/messages", { method: "POST", body: JSON.stringify(body) });
      if (currentView.current.open && currentView.current.channelQuery === channelQuery) setMessages((rows) => rows.some((row) => row.id === message.id) ? rows : [...rows, message].slice(-100));
      setDraft("");
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  }
  if (!open) return null;
  const style = mode === "floating" ? { left: windowRect.left, top: windowRect.top, width: windowRect.width, height: windowRect.height } : undefined;
  return <aside ref={panelRef} className={`conversation-drawer conversation-drawer-${mode}`} style={style} aria-label="Espace de conversation" onPointerUp={endDrag}>
    <header className="conversation-drawer-header" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag}>
      <div><span className="conversation-drawer-mark"><MessageCircle size={20} /></span><div><strong>Social</strong><small>{activeTab === "direct" && activeFriend ? activeFriend.pseudo : tabs.find((tab) => tab.id === activeTab)?.label}</small></div></div>
      {mode === "floating" && <GripHorizontal className="conversation-drag-handle" size={18} aria-hidden="true" />}
      <div className="conversation-window-actions"><button type="button" className="secondary icon-toggle" onClick={toggleSound} aria-pressed={soundEnabled} title={soundEnabled ? "Couper le son du chat" : "Activer le son du chat"} aria-label={soundEnabled ? "Couper le son du chat" : "Activer le son du chat"}>{soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button type="button" className="secondary icon-toggle" onClick={toggleMode} title={mode === "docked" ? "Passer en fenêtre" : "Attacher à droite"} aria-label={mode === "docked" ? "Passer en fenêtre" : "Attacher à droite"}>{mode === "docked" ? <PictureInPicture2 size={17} /> : <PanelRight size={17} />}</button><button type="button" className="secondary icon-toggle" onClick={onClose} aria-label="Fermer Social"><X size={18} /></button></div>
    </header>
    <nav className="conversation-tabs" aria-label="Canaux de conversation">{tabs.map(({ id, label, icon: Icon, needsRoom }) => { const count = id === "direct" ? unreadDirect : id === "room" ? unreadRoom : 0; return <button type="button" key={id} disabled={needsRoom && !roomCode} className={`${activeTab === id ? "active" : ""} ${count ? "conversation-channel-unread" : ""}`} onClick={() => setActiveTab(id)}><Icon size={17} /><span>{label}{count > 0 && <span className="conversation-unread-count" aria-label={`${count} messages non lus`}>{count > 99 ? "99+" : count}</span>}</span></button>; })}</nav>
    {activeTab === "direct" && <div className="conversation-contact-strip" role="tablist" aria-label="Conversations avec les amis"><button type="button" className="conversation-contact-add icon-toggle" onClick={onFriends} title="Choisir un ami" aria-label="Choisir un ami"><Plus size={17} /></button>{conversations.map((friend) => { const count = friendChannels.get(friend.id)?.count ?? 0; return <button type="button" role="tab" aria-selected={friend.id === friendId} className={`${friend.id === friendId ? "active" : ""} ${count ? "conversation-channel-unread" : ""}`} key={friend.id} onClick={() => setFriendId(friend.id)}><PresenceDot online={friend.online} /><DisplayName user={friend} interactive={false} />{count > 0 && <span className="conversation-unread-count" aria-label={`${count} messages non lus`}>{count > 99 ? "99+" : count}</span>}</button>; })}{!conversations.length && <span>Aucune conversation ouverte</span>}</div>}
    <div className="conversation-feed" ref={scrollRef} aria-live="polite">
      {loading && <p className="conversation-empty">Chargement…</p>}
      {!loading && activeTab === "journal" && journal.map((entry) => <article className="conversation-journal-entry" key={entry.id ?? `${entry.at}-${entry.text}`}><time>{formatTime(entry.at)}</time><div><strong>{entry.actor || "Table"}</strong><p>{entry.text}</p></div></article>)}
      {!loading && activeTab === "journal" && !journal.length && <p className="conversation-empty">Les actions de la table apparaîtront ici.</p>}
      {!loading && activeTab !== "journal" && messages.map((message) => <article className={`conversation-message ${message.senderId === user.id ? "own" : ""}`} key={message.id}><div className="conversation-message-meta"><DisplayName user={message.sender} /><time>{formatTime(message.createdAt)}</time></div><p>{message.content}</p></article>)}
      {!loading && activeTab !== "journal" && !messages.length && <p className="conversation-empty">Aucun message dans ce canal.</p>}
    </div>
    {error && <div className="conversation-error" role="alert">{error}</div>}
    {activeTab !== "journal" && <form className="conversation-composer" onSubmit={send}><label><span className="sr-only">Message</span><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 500))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={!canWrite || !channelQuery} placeholder={!canWrite ? "Écriture désactivée pour ce compte" : activeTab === "direct" && !friendId ? "Choisis un ami" : "Écrire un message…"} rows="2" /></label><button type="submit" className="icon-toggle" aria-label="Envoyer" disabled={!canWrite || !draft.trim() || !channelQuery || sending}><Send size={18} /></button></form>}
    {mode === "floating" && <span className="conversation-resize-hint" aria-hidden="true" />}
  </aside>;
}
