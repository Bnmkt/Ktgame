import { gameImageUrl } from "./games/presentation.js";

export function siteMarkSource(settings = {}) {
  return settings.siteIconMode === "icon" ? settings.siteIcon || "landmark" : gameImageUrl(settings.siteIconImage) || "/api/branding/site";
}
