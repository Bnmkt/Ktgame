import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe2, GripHorizontal, MessageCircle, MessagesSquare, PanelRight, PictureInPicture2, Plus, ReceiptText, Send, Table2, X } from "lucide-react";
import { io } from "socket.io-client";
import { api, getToken, SOCKET_PATH, SOCKET_URL } from "../../api.js";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";

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

export function SocialPanel({ user, roomCode, open, onClose, onFriends, requestedFriendId = "", requestedFriendRevision = 0 }) {
  const [mode, setMode] = useState(() => localStorage.getItem("ktga-social-mode") === "floating" ? "floating" : "docked");
  const [activeTab, setActiveTab] = useState(roomCode ? "journal" : "global");
  const [friends, setFriends] = useState([]);
  const [friendId, setFriendId] = useState("");
  const [messages, setMessages] = useState([]);
  const [journal, setJournal] = useState([]);
  const [channelId, setChannelId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [windowRect, setWindowRect] = useState(savedWindow);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const socketRef = useRef(null);
  const canWrite = user.moderation?.type !== "soft" && !(user.minor?.restrictions ?? []).includes("chat");
  const activeFriend = friends.find((friend) => friend.id === friendId);

  const channelQuery = useMemo(() => {
    if (activeTab === "global") return "channelType=global";
    if (activeTab === "direct" && friendId) return `channelType=direct&friendId=${encodeURIComponent(friendId)}`;
    if (activeTab === "room" && roomCode) return `channelType=room&roomCode=${encodeURIComponent(roomCode)}`;
    return "";
  }, [activeTab, friendId, roomCode]);

  const loadFriends = useCallback(async () => {
    try {
      const payload = await api("/api/friends", { background: true });
      const rows = Array.isArray(payload.friends) ? payload.friends : [];
      setFriends(rows);
      setFriendId((current) => rows.some((friend) => friend.id === current) ? current : rows[0]?.id ?? "");
      socketRef.current?.emit("chat-subscribe", { token: getToken() });
    } catch (err) { setError(err.message); }
  }, []);

  const loadActive = useCallback(async (quiet = false) => {
    if (!open) return;
    if (activeTab === "journal") {
      if (!roomCode) return setJournal([]);
      if (!quiet) setLoading(true);
      try { const payload = await api(`/api/chat/journal?roomCode=${encodeURIComponent(roomCode)}`, { background: quiet }); setJournal(payload.logs ?? []); setError(""); }
      catch (err) { setError(err.message); }
      finally { if (!quiet) setLoading(false); }
      return;
    }
    if (!channelQuery) return setMessages([]);
    if (!quiet) setLoading(true);
    try {
      const payload = await api(`/api/chat/messages?${channelQuery}`, { background: quiet });
      setMessages(payload.messages ?? []);
      setChannelId(payload.channel?.id ?? "");
      setError("");
    } catch (err) { setError(err.message); }
    finally { if (!quiet) setLoading(false); }
  }, [activeTab, channelQuery, open, roomCode]);

  useEffect(() => {
    if (!open) return undefined;
    loadFriends();
    const friendTimer = window.setInterval(loadFriends, 10000);
    window.addEventListener("ktga-connections-updated", loadFriends);
    const socket = io(SOCKET_URL, { path: SOCKET_PATH, auth: { token: getToken() }, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.emit("chat-subscribe", { token: getToken(), roomCode });
    socket.on("chat-message", (message) => {
      if (message.channelId !== channelId) return;
      setMessages((rows) => rows.some((row) => row.id === message.id) ? rows : [...rows, message].slice(-100));
    });
    return () => { window.clearInterval(friendTimer); window.removeEventListener("ktga-connections-updated", loadFriends); socket.disconnect(); socketRef.current = null; };
  }, [open, roomCode, loadFriends, channelId]);

  useEffect(() => { loadActive(); }, [loadActive]);
  useEffect(() => {
    if (!requestedFriendId) return;
    setFriendId(requestedFriendId);
    setActiveTab("direct");
  }, [requestedFriendId, requestedFriendRevision]);
  useEffect(() => {
    if (!open) return undefined;
    const delay = activeTab === "journal" ? 2500 : 10000;
    const timer = window.setInterval(() => loadActive(true), delay);
    return () => window.clearInterval(timer);
  }, [activeTab, loadActive, open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, journal, activeTab]);
  useEffect(() => {
    document.documentElement.classList.toggle("conversation-drawer-open", open && mode === "docked");
    return () => document.documentElement.classList.remove("conversation-drawer-open");
  }, [mode, open]);
  useEffect(() => {
    if (!roomCode && ["journal", "room"].includes(activeTab)) setActiveTab("global");
    socketRef.current?.emit("chat-subscribe", { token: getToken(), roomCode });
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
      setMessages((rows) => rows.some((row) => row.id === message.id) ? rows : [...rows, message].slice(-100));
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
      <div className="conversation-window-actions"><button type="button" className="secondary icon-toggle" onClick={toggleMode} title={mode === "docked" ? "Passer en fenêtre" : "Attacher à droite"} aria-label={mode === "docked" ? "Passer en fenêtre" : "Attacher à droite"}>{mode === "docked" ? <PictureInPicture2 size={17} /> : <PanelRight size={17} />}</button><button type="button" className="secondary icon-toggle" onClick={onClose} aria-label="Fermer Social"><X size={18} /></button></div>
    </header>
    <nav className="conversation-tabs" aria-label="Canaux de conversation">{tabs.map(({ id, label, icon: Icon, needsRoom }) => <button type="button" key={id} disabled={needsRoom && !roomCode} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon size={17} /><span>{label}</span></button>)}</nav>
    {activeTab === "direct" && <div className="conversation-contact-strip" role="tablist" aria-label="Conversations avec les amis"><button type="button" className="conversation-contact-add icon-toggle" onClick={onFriends} title="Choisir un ami" aria-label="Choisir un ami"><Plus size={17} /></button>{friends.map((friend) => <button type="button" role="tab" aria-selected={friend.id === friendId} className={friend.id === friendId ? "active" : ""} key={friend.id} onClick={() => setFriendId(friend.id)}><DisplayName user={friend} /></button>)}{!friends.length && <span>Aucun ami disponible</span>}</div>}
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
