import { createHash, randomBytes } from "node:crypto";
import { exactAge } from "./parental-controls.js";

const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const lifetime = 10 * 60 * 1000;

export function discordAgeAllowed(user) {
  const age = exactAge(user?.profile?.birthDate);
  return age !== null && age >= 13;
}

export function discordConfiguration(env = process.env) {
  const clientId = String(env.DISCORD_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.DISCORD_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(env.DISCORD_REDIRECT_URI ?? "").trim();
  let validRedirect = false;
  try {
    const url = new URL(redirectUri);
    validRedirect = !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" || (env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch {}
  return { clientId, clientSecret, redirectUri, available: /^\d{16,22}$/.test(clientId) && Boolean(clientSecret) && validRedirect };
}

// Only transient authorization data lives here. Discord access tokens are never persisted.
export async function exchangeDiscordCode(code, { configuration = discordConfiguration, fetcher = fetch, embedded = false } = {}) {
  if (typeof code !== "string" || !code || code.length > 2048) throw new Error("DISCORD_INVALID_CODE");
  const config = configuration();
  if (!config.available) throw new Error("DISCORD_UNAVAILABLE");
  const response = await fetcher("https://discord.com/api/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", code, ...(!embedded ? { redirect_uri: config.redirectUri } : {}) }),
    signal: AbortSignal.timeout(10000), redirect: "error"
  });
  if (!response.ok) throw new Error("DISCORD_EXCHANGE_FAILED");
  const token = await response.json();
  if (typeof token.access_token !== "string" || !token.access_token || token.token_type?.toLowerCase() !== "bearer") throw new Error("DISCORD_EXCHANGE_FAILED");
  const profileResponse = await fetcher("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000), redirect: "error"
  });
  if (!profileResponse.ok) throw new Error("DISCORD_PROFILE_FAILED");
  const profile = await profileResponse.json();
  if (!/^\d{16,22}$/.test(profile.id) || profile.bot) throw new Error("DISCORD_PROFILE_FAILED");
  return { id: profile.id, username: String(profile.username ?? "").slice(0, 80) };
}

export function createDiscordOAuth({ configuration = () => discordConfiguration(), fetcher = fetch, now = Date.now, limit = 1000 } = {}) {
  const flows = new Map();
  function prune() {
    for (const [key, flow] of flows) if (flow.expiresAt <= now()) flows.delete(key);
  }
  function start(binding = {}) {
    const config = configuration();
    if (!config.available) throw new Error("DISCORD_UNAVAILABLE");
    prune();
    if (flows.size >= limit) throw new Error("DISCORD_BUSY");
    const state = randomBytes(32).toString("base64url");
    flows.set(digest(state), { ...binding, expiresAt: now() + lifetime, stage: "started" });
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "identify", state }).toString();
    return { state, url: url.href };
  }
  async function callback(state, cookie, code, denied = false) {
    prune();
    if (!state || state !== cookie) throw new Error("DISCORD_INVALID_STATE");
    const flow = flows.get(digest(cookie));
    if (!flow || flow.stage !== "started") throw new Error("DISCORD_INVALID_STATE");
    flow.stage = "exchanging";
    try {
      if (denied) throw new Error("DISCORD_CANCELLED");
      flow.profile = await exchangeDiscordCode(code, { configuration, fetcher });
    } catch (error) {
      flow.error = ["DISCORD_CANCELLED", "DISCORD_UNAVAILABLE"].includes(error.message) ? error.message : "DISCORD_EXCHANGE_FAILED";
    }
    flow.stage = "complete";
    return { intent: flow.intent, roomCode: flow.roomCode ?? "" };
  }
  function consume(cookie) {
    prune();
    const key = digest(cookie);
    const flow = flows.get(key);
    if (!cookie || !flow || flow.stage !== "complete") return null;
    flows.delete(key);
    return flow;
  }
  return { start, callback, consume };
}
