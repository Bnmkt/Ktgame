import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bug } from "lucide-react";
import { appPath } from "../../navigation/routes.js";
import { bugDiagnostics } from "./diagnostics.js";
import "./bugs.css";

const Form = lazy(() => import("./BugReportForm.jsx").then((module) => ({ default: module.BugReportForm })));
const Context = createContext(null);
const emptyContext = { page: "", zone: "", game: "", match: "", room: "", event: "", other: "" };
const volatileReceipts = new Map();
export function BugReportProvider({ children }) {
  const [open, setOpen] = useState(false), [location, setLocation] = useState({ route: { view: "lobby" }, user: null });
  const [portal, setPortal] = useState(() => document.fullscreenElement ?? document.body);
  const [details, setDetails] = useState({});
  useEffect(() => {
    const sync = () => setPortal(document.fullscreenElement ?? document.body);
    document.addEventListener("fullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); bugDiagnostics.stop(); };
  }, []);
  const previousUser = useRef(null);
  useEffect(() => {
    bugDiagnostics.stop();
    if (previousUser.current && previousUser.current !== location.user?.id) {
      volatileReceipts.clear();
      try { sessionStorage.removeItem("ktga-issue-receipts"); } catch { /* Storage may be disabled. */ }
    }
    previousUser.current = location.user?.id ?? null;
  }, [location.user?.id]);
  const context = useMemo(() => ({ ...emptyContext, page: appPath(location.route.view, location.route.id), zone: location.route.view, room: ["room", "spectator"].includes(location.route.view) ? location.route.id ?? "" : "", event: location.route.view === "event" ? location.route.id ?? "" : "", ...(details.route === `${location.route.view}:${location.route.id}` ? details.values : {}) }), [location.route.view, location.route.id, details]);
  const value = useMemo(() => ({ setLocation, setDetails, routeView: location.route.view, routeId: location.route.id, open: () => setOpen(true) }), [location.route.view, location.route.id]);
  const follow = (event, id) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState({}, "", appPath("bugs", id));
    window.dispatchEvent(new PopStateEvent("popstate"));
    setOpen(false);
  };
  return <Context.Provider value={value}>{children}{createPortal(<button type="button" className="secondary issue-launcher" style={{ zIndex: open ? 1 : 1005 }} title="Signaler un bug" aria-label="Signaler un bug" aria-expanded={open} onClick={() => setOpen(true)}><Bug size={22} /></button>, portal)}<Suspense fallback={null}><Form open={open} onClose={() => setOpen(false)} onFollow={follow} detectedContext={context} user={location.user} /></Suspense></Context.Provider>;
}
export function useBugReportLocation(route, user) {
  const context = useContext(Context);
  useEffect(() => { context.setLocation({ route, user }); }, [context, route.view, route.id, user]);
}
export function useBugGameContext(view, id, game, match) {
  const context = useContext(Context);
  useEffect(() => {
    if (context?.routeView === view && context.routeId === id) context.setDetails({ route: `${view}:${id}`, values: { game: game ?? "", match: match ? String(match) : "" } });
  }, [context, view, id, game, match]);
}
export function saveBugReceipt(id, receipt) {
  volatileReceipts.set(String(id), receipt);
  if (volatileReceipts.size > 20) volatileReceipts.delete(volatileReceipts.keys().next().value);
  try {
    const receipts = JSON.parse(sessionStorage.getItem("ktga-issue-receipts") ?? "{}");
    receipts[id] = receipt;
    sessionStorage.setItem("ktga-issue-receipts", JSON.stringify(Object.fromEntries(Object.entries(receipts).slice(-20))));
  } catch { /* The receipt remains available until this tab reloads. */ }
}
export function bugReceipt(id) { try { return JSON.parse(sessionStorage.getItem("ktga-issue-receipts") ?? "{}")[id] ?? volatileReceipts.get(String(id)) ?? ""; } catch { return volatileReceipts.get(String(id)) ?? ""; } }
