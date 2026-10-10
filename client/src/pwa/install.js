export const INSTALL_CHOICE_KEY = "ktga-install-choice";

export function installationHelp(navigator) {
  const agent = navigator.userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(agent) && /Firefox/.test(agent)) return "android";
  if (/Macintosh/.test(agent) && /Safari/.test(agent) && !/Chrome|Chromium|Edg/.test(agent)) return "mac";
  return null;
}

export function createInstallController(window) {
  let deferred = null, busy = false, started = false, choice = "";
  const listeners = new Set();
  const display = window.matchMedia("(display-mode: standalone)");
  const fullscreen = window.matchMedia("(display-mode: fullscreen)");
  const minimal = window.matchMedia("(display-mode: minimal-ui)");
  let help = installationHelp(window.navigator);
  const read = () => { try { return window.localStorage.getItem(INSTALL_CHOICE_KEY) ?? ""; } catch { return choice; } };
  choice = read();
  let state;
  const update = () => {
    const installed = display.matches || fullscreen.matches || minimal.matches || window.navigator.standalone === true || choice === "installed";
    state = { visible: window.isSecureContext && !installed && choice !== "ignored" && Boolean(deferred || help), native: Boolean(deferred), help, busy };
    listeners.forEach((listener) => listener());
  };
  const save = (value) => { choice = value; try { window.localStorage.setItem(INSTALL_CHOICE_KEY, value); } catch { /* Keep the choice for this visit if storage is blocked. */ } update(); };
  const beforeInstall = (event) => { event.preventDefault(); deferred = event; help ||= "browser"; update(); };
  const installed = () => { deferred = null; save("installed"); };
  const storage = (event) => { if (event.key === INSTALL_CHOICE_KEY || event.key === null) { choice = read(); update(); } };
  update();
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() {
      if (started) return;
      started = true;
      window.addEventListener("beforeinstallprompt", beforeInstall);
      window.addEventListener("appinstalled", installed);
      window.addEventListener("storage", storage);
      for (const mode of [display, fullscreen, minimal]) mode.addEventListener("change", update);
    },
    stop() {
      started = false;
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("storage", storage);
      for (const mode of [display, fullscreen, minimal]) mode.removeEventListener("change", update);
    },
    ignore: () => { deferred = null; save("ignored"); },
    confirmInstalled: installed,
    async install() {
      if (busy) return "busy";
      if (!deferred) return "manual";
      const prompt = deferred; deferred = null; busy = true; update();
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") save("installed");
        return outcome;
      } catch { return "manual"; }
      finally { busy = false; update(); }
    }
  };
}

export async function registerOfflineWorker(window, base = "/") {
  if (!window.isSecureContext || !window.navigator.serviceWorker || window.top !== window.self) return false;
  try {
    const scope = new URL(base, window.location.origin);
    await window.navigator.serviceWorker.register(new URL("sw.js", scope).href, { scope: scope.pathname, updateViaCache: "none" });
    return true;
  } catch { return false; }
}
