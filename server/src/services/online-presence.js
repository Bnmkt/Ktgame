export function createOnlinePresence({ onChange, delayMs = 5000, schedule = setTimeout, cancel = clearTimeout }) {
  const users = new Map();
  return {
    has: (userId) => users.has(userId),
    connect(userId, socketId) {
      let entry = users.get(userId);
      const wasOnline = Boolean(entry);
      if (!entry) { entry = { sockets: new Set(), timer: null }; users.set(userId, entry); }
      if (entry.timer !== null) cancel(entry.timer);
      entry.timer = null;
      entry.sockets.add(socketId);
      if (!wasOnline) onChange(userId);
    },
    disconnect(userId, socketId) {
      const entry = users.get(userId);
      if (!entry || !entry.sockets.delete(socketId) || entry.sockets.size) return;
      entry.timer = schedule(() => {
        if (users.get(userId) !== entry || entry.sockets.size) return;
        users.delete(userId);
        onChange(userId);
      }, delayMs);
      entry.timer?.unref?.();
    },
    close() {
      for (const entry of users.values()) if (entry.timer !== null) cancel(entry.timer);
      users.clear();
    }
  };
}
