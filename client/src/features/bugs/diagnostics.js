const routeWords = new Set("api admin bugs images groups metadata publication comments resolution relations batch me rooms actions chat friends shop games community-events config auth login register status patchnotes notifications".split(" "));
export function diagnosticRoute(value) {
  try {
    const parts = new URL(value, "https://local.invalid").pathname.split("/").filter(Boolean);
    const start = parts.indexOf("api");
    return start < 0 ? "/:page" : `/${parts.slice(start, start + 8).map((part) => routeWords.has(part) ? part : ":id").join("/")}`;
  } catch { return "/:page"; }
}
export function createDiagnosticCollector(environment = () => window) {
  let enabled = false, startedAt = "", win = null, javascript = [], apiErrors = [], websocket = [];
  const sockets = new Map();
  const at = () => new Date().toISOString();
  const push = (list, row) => { list.push(row); if (list.length > 10) list.shift(); };
  const js = (event) => {
    if (!enabled) return;
    const name = event.error?.name ?? event.reason?.name;
    const file = String(event.filename ?? "").split(/[/?#]/).findLast((part) => /^[A-Za-z0-9_.-]+\.(?:js|jsx|mjs)$/.test(part)) ?? "";
    push(javascript, { at: at(), kind: event.type === "unhandledrejection" ? "UnhandledRejection" : ["TypeError", "ReferenceError", "SyntaxError", "RangeError"].includes(name) ? name : "Error", code: { TypeError: "missing_value", ReferenceError: "undefined_name", SyntaxError: "syntax", RangeError: "range" }[name] ?? (event.type === "unhandledrejection" ? "unhandled" : "unknown"), file, line: Math.min(1000000, Math.max(0, Number(event.lineno) || 0)), column: Math.min(1000000, Math.max(0, Number(event.colno) || 0)) });
  };
  const attach = (socket, entry) => {
    entry.error = (error) => { if (enabled) push(websocket, { at: at(), code: error?.message === "timeout" ? "timeout" : "transport_error" }); };
    entry.disconnect = (reason) => { if (enabled && ["transport close", "transport error", "ping timeout"].includes(reason)) push(websocket, { at: at(), code: reason === "ping timeout" ? "timeout" : "transport_close" }); };
    socket.on("connect_error", entry.error); socket.on("disconnect", entry.disconnect);
  };
  const detach = (socket, entry) => { if (entry.error) socket.off("connect_error", entry.error); if (entry.disconnect) socket.off("disconnect", entry.disconnect); entry.error = null; entry.disconnect = null; };
  return {
    start() {
      if (enabled) return;
      win = environment(); enabled = true; startedAt = at();
      win.addEventListener("error", js); win.addEventListener("unhandledrejection", js);
      for (const [socket, entry] of sockets) attach(socket, entry);
    },
    stop() {
      enabled = false;
      win?.removeEventListener("error", js); win?.removeEventListener("unhandledrejection", js);
      for (const [socket, entry] of sockets) detach(socket, entry);
      win = null; startedAt = ""; javascript = []; apiErrors = []; websocket = [];
    },
    recordApiFailure(route, method, status) {
      if (!enabled) return;
      push(apiErrors, { at: at(), route: diagnosticRoute(route), method: ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD"].includes(method) ? method : "GET", status: Math.max(0, Math.min(599, Number(status) || 0)) });
    },
    registerSocket(socket) {
      const entry = {}; sockets.set(socket, entry); if (enabled) attach(socket, entry);
      return () => { detach(socket, entry); sockets.delete(socket); };
    },
    snapshot(version = "") {
      if (!enabled) return null;
      const ua = win.navigator.userAgent;
      const match = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/);
      const browser = { Edg: "Edge", OPR: "Opera", Firefox: "Firefox", Chrome: "Chrome", Version: "Safari" }[match?.[1]] ?? "Other";
      const system = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
      return { version, startedAt, capturedAt: at(), browser, browserMajor: Number(match?.[2]) || 0, system, resolution: { width: win.screen.width, height: win.screen.height }, viewport: { width: win.innerWidth, height: win.innerHeight }, javascript: [...javascript], api: [...apiErrors], websocket: [...websocket] };
    }
  };
}
export const bugDiagnostics = createDiagnosticCollector();
