import { useCallback, useEffect, useState } from "react";
import { appPath, readRoute } from "./routes.js";

export function useCasinoRoute() {
  const [route, setRoute] = useState(() => readRoute(window.location));
  useEffect(() => {
    const onPopState = () => { setRoute(readRoute(window.location)); window.scrollTo({ top: 0, behavior: "auto" }); };
    window.addEventListener("popstate", onPopState);
    const query = new URLSearchParams(window.location.search);
    if (query.has("room") || query.has("event")) {
      const initial = readRoute(window.location);
      window.history.replaceState({}, "", appPath(initial.view, initial.id));
    }
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const navigate = useCallback((view, id = "", { replace = false, search = "", hash = "" } = {}) => {
    const target = new URL(appPath(view, id), window.location.origin);
    target.search = search;
    target.hash = hash;
    const path = target.pathname + target.search + target.hash;
    if (window.location.pathname + window.location.search + window.location.hash !== path) window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    setRoute(readRoute(window.location));
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  return [route, navigate];
}
