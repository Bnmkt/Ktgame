const launchKeys = ["frame_id", "instance_id", "platform", "custom_id", "referrer_id", "guild_id", "channel_id", "location_id", "mobile_app_version"];
export function isDiscordActivityLocation(location = globalThis.location) {
  return location?.protocol === "https:" && /^\d{16,22}\.discordsays\.com$/.test(location.hostname ?? "");
}
export function usesActivityTransport(location = globalThis.location) {
  return isDiscordActivityLocation(location) || location?.pathname === "/discord-activity" || location?.pathname?.startsWith("/discord-activity/") === true;
}
const launch = typeof window !== "undefined" && isDiscordActivityLocation() ? new URLSearchParams(window.location.search) : new URLSearchParams();
export function activityNavigationUrl(value) {
  if (!isDiscordActivityLocation()) return value;
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin) return value;
  for (const key of launchKeys) if (launch.has(key)) url.searchParams.set(key, launch.get(key));
  return url.pathname + url.search + url.hash;
}
export function activityBrowserUrl(location, websiteUrl) {
  const base = new URL(websiteUrl);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("Adresse du casino invalide.");
  const url = new URL(base.origin);
  url.pathname = location.pathname;
  // No Discord context, login tokens, private queries or fragments leave the frame.
  url.search = ""; url.hash = "";
  if (url.pathname.startsWith("/discord-activity")) url.pathname = "/";
  return url.href;
}
