import { bugDiagnostics } from "./features/bugs/diagnostics.js";

function normalizeBasePath(path) {
  const normalized = `/${String(path || "").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
}

const BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL);
const configuredApiUrl = String(import.meta.env.VITE_API_URL ?? "").trim();
const API_URL = configuredApiUrl || (import.meta.env.DEV ? "http://localhost:4000" : BASE_PATH);

function splitOriginAndPath(url) {
  if (!/^https?:\/\//i.test(url)) return { origin: undefined, basePath: normalizeBasePath(url || BASE_PATH) };
  const parsed = new URL(url);
  return { origin: parsed.origin, basePath: normalizeBasePath(parsed.pathname) };
}

const socketBase = splitOriginAndPath(API_URL);
const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL ?? "").trim() || socketBase.origin;
const SOCKET_PATH = String(import.meta.env.VITE_SOCKET_PATH ?? "").trim() || `${socketBase.basePath}/socket.io`;
const pendingRequests = new Map();
const responseCache = new Map();
const cacheableGetPattern = /^\/api\/(config|games|shop)$/;
const sensitiveActionPattern = /acheter|enregistrer|créer|modifier|dupliquer|lancer|démarrer|appliquer|valider|supprimer|réinitialiser|charger|équiper|inviter|accepter|refuser|clôturer|planifier|rejouer|confirmer|piocher|rester|coucher/i;
let lastActionButton = null;
let lastActionButtonAt = 0;
let sessionToken = (() => {
  try {
    const legacy = localStorage.getItem("ktgame-token") ?? "";
    localStorage.removeItem("ktgame-token");
    return legacy;
  } catch { return ""; }
})();

function activeActionButton() {
  if (typeof document === "undefined") return null;
  if (performance.now() - lastActionButtonAt < 1000 && lastActionButton?.isConnected) return lastActionButton;
  const active = document.activeElement;
  const focusedButton = active instanceof HTMLElement ? active.closest("button") : null;
  return focusedButton;
}

function startButtonFeedback(button) {
  if (!button || button.dataset.requestFeedback === "state") return () => {};
  const startedAt = performance.now();
  const wasInert = Boolean(button.inert);
  button.inert = true;
  button.setAttribute("aria-busy", "true");
  button.classList.remove("action-feedback-ack", "action-feedback-success", "action-feedback-error");
  button.classList.add("action-feedback-pending");
  return (succeeded) => {
    const finish = () => {
      if (!button.isConnected) return;
      button.classList.remove("action-feedback-pending");
      button.classList.add(succeeded ? "action-feedback-success" : "action-feedback-error");
      button.removeAttribute("aria-busy");
      button.inert = wasInert;
      window.setTimeout(() => button.classList.remove("action-feedback-success", "action-feedback-error"), succeeded ? 900 : 1400);
    };
    window.setTimeout(finish, Math.max(0, 280 - (performance.now() - startedAt)));
  };
}

export function installButtonActionFeedback() {
  if (typeof document === "undefined") return () => {};
  const timers = new WeakMap();
  const handleClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button || button.disabled) return;
    if (button.dataset.requestFeedback === "state") return;
    lastActionButton = button;
    lastActionButtonAt = performance.now();
    const label = `${button.textContent ?? ""} ${button.getAttribute("title") ?? ""} ${button.getAttribute("aria-label") ?? ""}`;
    if (!button.matches('[type="submit"], [data-sensitive-action]') && !sensitiveActionPattern.test(label)) return;
    if (button.dataset.actionClickLocked === "true") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    button.dataset.actionClickLocked = "true";
    button.classList.add("action-feedback-ack");
    const timer = window.setTimeout(() => {
      delete button.dataset.actionClickLocked;
      button.classList.remove("action-feedback-ack");
      timers.delete(button);
    }, 520);
    timers.set(button, timer);
  };
  const handleSubmit = (event) => {
    const button = event.submitter instanceof HTMLButtonElement
      ? event.submitter
      : event.target instanceof HTMLFormElement
        ? event.target.querySelector('button[type="submit"], input[type="submit"]')
        : null;
    if (button instanceof HTMLButtonElement) {
      lastActionButton = button;
      lastActionButtonAt = performance.now();
    }
  };
  document.addEventListener("click", handleClick, true);
  document.addEventListener("submit", handleSubmit, true);
  return () => {
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("submit", handleSubmit, true);
  };
}

export function getToken() {
  return sessionToken;
}

export function setToken(token) {
  sessionToken = String(token ?? "");
  try { localStorage.removeItem("ktgame-token"); } catch { /* Le cookie HttpOnly reste la source de session. */ }
}

export function api(path, options = {}) {
  const { background = false, deduplicate = true, ...fetchOptions } = options;
  const method = String(options.method ?? "GET").toUpperCase();
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const requestKey = deduplicate ? `${method}:${path}:${String(options.body ?? "")}` : Symbol("request");
  const cacheable = method === "GET" && cacheableGetPattern.test(path);
  const cached = cacheable ? responseCache.get(path) : null;
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  if (pendingRequests.has(requestKey)) return pendingRequests.get(requestKey);
  if (mutation && !background) responseCache.clear();

  const finishButtonFeedback = mutation && !background ? startButtonFeedback(activeActionButton()) : () => {};
  const request = (async () => {
    let status = 0;
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          ...options.headers
        }
      });
      status = res.status;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const error = new Error(data?.error ?? "Erreur serveur");
        error.status = res.status;
        error.code = data?.code ?? "";
        error.data = data;
        throw error;
      }
      if (cacheable) responseCache.set(path, { data, expiresAt: Date.now() + 30000 });
      finishButtonFeedback(true);
      return data;
    } catch (error) {
      bugDiagnostics.recordApiFailure(path, method, status);
      finishButtonFeedback(false);
      throw error;
    } finally {
      pendingRequests.delete(requestKey);
    }
  })();
  pendingRequests.set(requestKey, request);
  return request;
}

export { API_URL, BASE_PATH, SOCKET_PATH, SOCKET_URL };
