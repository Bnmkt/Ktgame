import { api } from "../../api.js";
import { activityBrowserUrl, activityNavigationUrl, isDiscordActivityLocation } from "./context.js";

let connection, configuration, login;
const timeout = async (promise, milliseconds = 15000) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Discord ne répond pas. Réessaie ou ouvre le navigateur.")), milliseconds); })]); }
  finally { clearTimeout(timer); }
};
export async function getActivityConfiguration() {
  configuration ??= await api("/api/discord/activity/config", { signal: AbortSignal.timeout(10000) });
  return configuration;
}
export function connectActivity() {
  connection ??= (async () => {
    if (!isDiscordActivityLocation()) throw new Error("Cette page est prévue pour une activité Discord.");
    const config = await getActivityConfiguration();
    if (!config.available || window.location.hostname !== `${config.clientId}.discordsays.com`) throw new Error("L’activité Discord est indisponible.");
    const { DiscordSDK } = await import("@discord/embedded-app-sdk");
    const sdk = new DiscordSDK(config.clientId, { disableConsoleLogOverride: true });
    await timeout(sdk.ready());
    return sdk;
  })();
  return connection;
}
async function exchangeActivityLogin() {
  const sdk = await connectActivity();
  const { code } = await timeout(sdk.commands.authorize({ client_id: sdk.clientId, response_type: "code", state: crypto.randomUUID(), prompt: "none", scope: ["identify"] }), 120000);
  return api("/api/auth/discord/activity", { method: "POST", body: JSON.stringify({ code }) });
}
export function loginInActivity() {
  login ??= exchangeActivityLogin().finally(() => { login = null; });
  return login;
}
export async function openActivityBrowser(location = window.location) {
  const config = await getActivityConfiguration();
  const url = activityBrowserUrl(location, config.websiteUrl);
  if (!isDiscordActivityLocation()) { window.location.assign(url); return; }
  const sdk = await connectActivity();
  const response = await timeout(sdk.commands.openExternalLink({ url }));
  if (response?.opened === false) throw new Error("L’ouverture du navigateur a été annulée.");
}
export function installActivityLinks(onError) {
  const follow = async event => {
    const anchor = event.target.closest?.("a[href]");
    if (event.defaultPrevented || event.button !== 0 || !anchor) return;
    const url = new URL(anchor.href, window.location.href);
    if (!["http:", "https:"].includes(url.protocol)) return;
    event.preventDefault();
    try {
      const config = await getActivityConfiguration();
      if ([window.location.origin, new URL(config.websiteUrl).origin].includes(url.origin) && !anchor.download && !/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.startsWith("/api/")) {
        window.history.pushState({}, "", activityNavigationUrl(url.pathname + url.search + url.hash));
        window.dispatchEvent(new PopStateEvent("popstate"));
      } else {
        const sdk = await connectActivity(); await timeout(sdk.commands.openExternalLink({ url: url.href }));
      }
    } catch (error) { onError(error); }
  };
  document.addEventListener("click", follow);
  return () => document.removeEventListener("click", follow);
}
