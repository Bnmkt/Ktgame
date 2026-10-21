import { api } from "../../api.js";
import { isDiscordActivityLocation } from "../discord/context.js";

export function supportsPasskeys() {
  return typeof window !== "undefined" && window.isSecureContext && window.top === window.self && !isDiscordActivityLocation() && typeof window.PublicKeyCredential === "function" && Boolean(navigator.credentials);
}

export function passkeyError(error) {
  const name = error?.cause?.name || error?.name;
  if (["NotAllowedError", "AbortError"].includes(name)) return "La validation a été annulée ou a expiré. Tu peux réessayer.";
  if (name === "InvalidStateError") return "Cette passkey est déjà enregistrée sur cet appareil.";
  if (["NotSupportedError", "SecurityError"].includes(name)) return "Ouvre KTGA dans un navigateur compatible pour utiliser une passkey.";
  return error?.message || "La vérification de la passkey a échoué.";
}

export function preferredMfaMethod(methods) {
  if (methods.includes("passkey") && supportsPasskeys()) return "passkey";
  return methods.includes("totp") ? "totp" : methods.find(method => method !== "passkey") || methods[0];
}

export async function loginWithPasskey(mfaChallengeId = "") {
  if (!supportsPasskeys()) throw new Error("Ouvre KTGA dans un navigateur compatible pour utiliser une passkey.");
  const { startAuthentication } = await import("@simplewebauthn/browser");
  const ceremony = await api("/api/auth/passkeys/options", { method: "POST", body: JSON.stringify({ mfaChallengeId }) });
  const response = await startAuthentication({ optionsJSON: ceremony.options });
  return api("/api/auth/passkeys/verify", { method: "POST", body: JSON.stringify({ challengeId: ceremony.challengeId, response }) });
}

export async function registerPasskey(proof) {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const ceremony = await api("/api/me/passkeys/register/options", { method: "POST", body: JSON.stringify(proof) });
  const response = await startRegistration({ optionsJSON: ceremony.options });
  return api("/api/me/passkeys/register/verify", { method: "POST", body: JSON.stringify({ challengeId: ceremony.challengeId, response }) });
}
