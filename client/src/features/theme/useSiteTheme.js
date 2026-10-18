import { useEffect, useLayoutEffect, useState } from "react";
import { API_URL } from "../../api.js";
import { normalizeTheme, themeVariables } from "./config.js";

export function useSiteTheme(active) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const change = event => setPreview(event.detail ? normalizeTheme(event.detail) : null);
    window.addEventListener("ktga-theme-preview", change);
    return () => window.removeEventListener("ktga-theme-preview", change);
  }, []);
  useLayoutEffect(() => {
    if (!active && !preview) return;
    const theme = normalizeTheme(preview || active);
    const root = document.documentElement;
    const variables = themeVariables(theme, image => `${API_URL}${image}`);
    for (const [key, value] of Object.entries(variables)) root.style.setProperty(key, value);
    root.dataset.siteWallpaper = theme.backgroundImage ? "true" : "false";
    return () => { for (const key of Object.keys(variables)) root.style.removeProperty(key); delete root.dataset.siteWallpaper; };
  }, [active, preview]);
}
