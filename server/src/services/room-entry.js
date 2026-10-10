export function registerRoomEntry({ app, limiter, readDb, displayNameFor }) {
  app.get("/api/table-entry/:code", limiter, (req, res) => {
    res.set("Cache-Control", "no-store");
    const code = String(req.params.code).toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(code)) return res.status(404).json({ error: "Table indisponible." });
    const db = readDb();
    const room = db.rooms.find((entry) => entry.code === code && !entry.finished);
    if (!room) return res.status(404).json({ error: "Cette partie est terminée ou la table n’existe plus." });
    const owner = db.users.find((user) => user.id === room.ownerId);
    res.json({ code: room.code, hostName: owner ? displayNameFor(owner) : "", requiresPassword: Boolean(room.passwordHash), ranked: Boolean(room.ranked) });
  });
}
