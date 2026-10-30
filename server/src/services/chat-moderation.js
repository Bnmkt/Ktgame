export function registerChatModerationRoutes({ app, auth, requireAdmin, store, publish, audit = () => {} }) {
  app.delete("/api/admin/chat/global", auth, requireAdmin, (req, res) => {
    if (req.body?.confirm !== true) return res.status(400).json({ error: "Confirme la suppression du chat global." });
    const result = store.purgeGlobal(req.auth.id);
    publish(result);
    audit({ category: "moderation", method: "DELETE", route: "/api/admin/chat/global", status: 200, userId: req.auth.id, message: `Chat global purgé : ${result.removed} message(s), révision ${result.revision}.` });
    res.json(result);
  });
}
