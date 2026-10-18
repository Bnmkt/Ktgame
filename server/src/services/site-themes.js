import { createHash } from "node:crypto";
import { DEFAULT_THEME, normalizeTheme, validateTheme, themeVariables, THEME_VERSION } from "../../../client/src/features/theme/config.js";

export function validateThemeLibrary(value, mediaLibrary) {
  if (!value || value.version !== THEME_VERSION || !Array.isArray(value.themes) || value.themes.length > 20 || typeof value.activeId !== "string") throw new Error("Bibliotheque de themes invalide (20 themes maximum).");
  const themes = value.themes.map(row => validateTheme(row));
  if (new Set(themes.map(row => row.id)).size !== themes.length || themes.some(row => row.id === DEFAULT_THEME.id)) throw new Error("Identifiant de theme reserve ou en double.");
  for (const theme of themes) {
    if (theme.backgroundImage && mediaLibrary && !mediaLibrary.get(theme.backgroundImage.split("/").at(-1))?.image) throw new Error("Image de fond introuvable dans la mediatheque.");
  }
  if (value.activeId !== DEFAULT_THEME.id && !themes.some(theme => theme.id === value.activeId)) throw new Error("Theme actif introuvable.");
  return { version: THEME_VERSION, activeId: value.activeId, themes };
}

export function registerThemeRoutes({ app, auth, requireAdmin, readDb, updateDb, settings, mediaLibrary }) {
  const library = () => {
    const stored = readDb().settings?.siteThemes;
    try { return validateThemeLibrary(stored); } catch { return { version: THEME_VERSION, activeId: DEFAULT_THEME.id, themes: [] }; }
  };
  app.get("/api/admin/themes", auth, requireAdmin, (_req, res) => {
    const value = library();
    res.set("Cache-Control", "no-store").json({ ...value, revision: createHash("sha256").update(JSON.stringify(value)).digest("hex"), appearance: settings().appearance });
  });
  app.put("/api/admin/themes", auth, requireAdmin, (req, res) => {
    try {
      const current = library();
      const revision = createHash("sha256").update(JSON.stringify(current)).digest("hex");
      if (req.body.revision !== revision) return res.status(409).json({ error: "Les themes ont change. Recharge la bibliotheque avant d'enregistrer." });
      const next = validateThemeLibrary(req.body, mediaLibrary);
      if (req.body.apply !== true && next.activeId !== current.activeId) throw new Error("Applique un theme avant de changer le theme actif.");
      const active = next.activeId === DEFAULT_THEME.id ? DEFAULT_THEME : next.themes.find(theme => theme.id === next.activeId);
      updateDb(db => {
        db.settings ??= {};
        db.settings.siteThemes = next;
        if (req.body.apply === true) db.settings.platform = { ...(db.settings.platform ?? {}), appearance: active };
      });
      res.set("Cache-Control", "no-store").json({ ...next, revision: createHash("sha256").update(JSON.stringify(next)).digest("hex"), appearance: settings().appearance });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.get("/api/site-theme.css", (_req, res) => {
    const theme = normalizeTheme(settings().appearance);
    const variables = themeVariables(theme);
    res.set("Cache-Control", "public, max-age=0, must-revalidate").type("text/css").send(`:root{${Object.entries(variables).map(([key, value]) => `${key}:${value}`).join(";")}}`);
  });
}
