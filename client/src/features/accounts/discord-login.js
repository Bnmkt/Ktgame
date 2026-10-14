import { api } from "../../api.js";

const pendingReturn = typeof window !== "undefined" && new URL(window.location.href).searchParams.get("discord") === "complete";
let completion;

export function completeDiscordReturn() {
  if (!pendingReturn) return null;
  if (!completion) {
    const url = new URL(window.location.href);
    url.searchParams.delete("discord");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    completion = api("/api/auth/discord/complete", { method: "POST", body: "{}" });
  }
  return completion;
}

export async function startDiscordLogin(roomCode = "") {
  const result = await api("/api/auth/discord/start", { method: "POST", body: JSON.stringify({ roomCode }) });
  const url = new URL(result.url);
  if (url.origin !== "https://discord.com" || url.pathname !== "/oauth2/authorize") throw new Error("Adresse de connexion Discord invalide.");
  window.location.assign(url.href);
}
