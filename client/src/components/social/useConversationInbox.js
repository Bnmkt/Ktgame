import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { bugDiagnostics } from "../../features/bugs/diagnostics.js";
import { api, getToken, SOCKET_PATH, SOCKET_URL } from "../../api.js";
import { createNotificationSound } from "../../utils/notification-sound.js";

export const conversationKey = (channel) => `${channel.channelType}:${channel.channelId}`;

export function useConversationInbox({ userId, roomCode, onMessage, onUnreadChange }) {
  const [channels, setChannels] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem(`ktga-conversation-sound:${userId}`) !== "off"; }
    catch { return true; }
  });
  const socketRef = useRef(null);
  const current = useRef({ roomCode, onMessage, soundEnabled });
  current.current = { roomCode, onMessage, soundEnabled };
  const revision = useRef(0);
  const owner = useRef(userId);
  owner.current = userId;
  const refreshTimer = useRef(null);

  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current;
    const code = current.current.roomCode;
    try {
      const payload = await api(`/api/chat/unread${code ? `?roomCode=${encodeURIComponent(code)}` : ""}`, { background: true });
      if (owner.current === userId && revision.current === requestRevision) setChannels(payload.channels ?? []);
    } catch { /* Keep the last known counters during a reconnect. */ }
  }, [userId]);

  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(refresh, 200);
  }, [refresh]);

  const markRead = useCallback(async (channel, readAt) => {
    if (!readAt) return;
    try {
      await api("/api/chat/read", { method: "POST", background: true, body: JSON.stringify({ ...channel, readAt }) });
      if (owner.current !== userId) return;
      revision.current += 1;
      scheduleRefresh();
    } catch { /* Failed acknowledgements remain unread. */ }
  }, [scheduleRefresh, userId]);

  useEffect(() => {
    setChannels([]);
    try { setSoundEnabled(localStorage.getItem(`ktga-conversation-sound:${userId}`) !== "off"); } catch { setSoundEnabled(true); }
    const sound = createNotificationSound();
    const seen = new Set();
    const socket = io(SOCKET_URL, { path: SOCKET_PATH, auth: { token: getToken() }, transports: ["websocket", "polling"], withCredentials: true });
    const disposeDiagnostics = bugDiagnostics.registerSocket(socket);
    socketRef.current = socket;
    const subscribe = () => {
      socket.emit("chat-subscribe", { token: getToken(), roomCode: current.current.roomCode });
      refresh();
    };
    socket.on("connect", subscribe);
    socket.on("inbox-updated", () => {
      window.dispatchEvent(new Event("ktga-inbox-updated"));
      window.dispatchEvent(new Event("ktga-connections-updated"));
    });
    socket.on("presence-updated", () => window.dispatchEvent(new Event("ktga-presence-updated")));
    socket.on("connections-updated", () => window.dispatchEvent(new Event("ktga-connections-updated")));
    socket.on("chat-message", (message) => {
      if (seen.has(message.id)) return;
      seen.add(message.id);
      if (seen.size > 500) seen.delete(seen.values().next().value);
      const displayed = current.current.onMessage(message);
      if (!["direct", "room"].includes(message.channelType)) return;
      if (message.senderId === userId) { revision.current += 1; scheduleRefresh(); return; }
      if (current.current.soundEnabled) sound.play();
      revision.current += 1;
      setChannels((rows) => {
        const key = conversationKey(message);
        const existing = rows.find((row) => conversationKey(row) === key);
        if (existing) return rows.map((row) => row === existing ? { ...row, count: row.count + 1, lastMessageAt: message.createdAt, opened: true } : row);
        return [...rows, { channelType: message.channelType, channelId: message.channelId, friendId: message.channelType === "direct" ? message.senderId : "", roomCode: message.channelType === "room" ? current.current.roomCode : "", count: 1, lastMessageAt: message.createdAt, opened: true }];
      });
      if (displayed) markRead(message.channelType === "direct" ? { channelType: "direct", friendId: message.senderId } : { channelType: "room", roomCode: current.current.roomCode }, message.createdAt);
      else scheduleRefresh();
    });
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    const onConnections = () => subscribe();
    window.addEventListener("focus", onFocus);
    window.addEventListener("ktga-connections-updated", onConnections);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(onFocus, 60000);
    return () => {
      revision.current += 1;
      window.clearInterval(timer);
      window.clearTimeout(refreshTimer.current);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ktga-connections-updated", onConnections);
      document.removeEventListener("visibilitychange", onFocus);
      disposeDiagnostics(); socket.disconnect();
      socketRef.current = null;
      sound.close();
    };
  }, [markRead, refresh, scheduleRefresh, userId]);

  useEffect(() => {
    revision.current += 1;
    setChannels((rows) => rows.filter((row) => row.channelType !== "room"));
    socketRef.current?.emit("chat-subscribe", { token: getToken(), roomCode });
    refresh();
  }, [refresh, roomCode]);

  const total = channels.reduce((sum, row) => sum + row.count, 0);
  useEffect(() => { onUnreadChange(total); }, [onUnreadChange, total]);
  const toggleSound = () => {
    const enabled = !soundEnabled;
    setSoundEnabled(enabled);
    try { localStorage.setItem(`ktga-conversation-sound:${userId}`, enabled ? "on" : "off"); } catch { /* Preference is optional. */ }
  };
  return { channels, markRead, soundEnabled, toggleSound };
}
