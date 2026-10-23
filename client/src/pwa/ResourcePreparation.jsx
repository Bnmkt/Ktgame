import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, RotateCcw } from "lucide-react";
import { API_URL } from "../api.js";
import { useLocale } from "../locales/LocaleProvider.jsx";
import { Dialog } from "../components/common/Dialog.jsx";
import { Mascot } from "../components/mascots/Mascot.jsx";
import { registerOfflineWorker } from "./install.js";
import { normalizeResources, prepareResources, RESOURCE_CACHE } from "./resources.js";
import "./resource-preparation.css";

const PreparationContext = createContext(false);
export const useResourcePreparation = () => useContext(PreparationContext);

export function ResourcePreparation({ children, enabled = import.meta.env.PROD }) {
  const { t } = useLocale();
  const [state, setState] = useState(null), [foreground, setForeground] = useState(true), [attempt, setAttempt] = useState(0);
  const [show, setShow] = useState(false), [finished, setFinished] = useState(!enabled);
  const background = useRef(false);
  function enter() { background.current = true; setForeground(false); }
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let stopped = false, reveal, registrationTimeout;
    setFinished(false);
    async function run() {
      try {
        if (!window.caches || !await Promise.race([registerOfflineWorker(window, import.meta.env.BASE_URL), new Promise(resolve => { registrationTimeout = setTimeout(() => resolve(false), 8000); })])) return;
        clearTimeout(registrationTimeout);
        const read = async url => {
          const response = await fetch(url, { credentials:"omit", cache:"no-cache", signal:controller.signal });
          if (!response.ok) throw Error("Manifest unavailable");
          return response.json();
        };
        const timeout = setTimeout(() => controller.abort(), 15000);
        let manifests;
        try { manifests = await Promise.all([read(`${import.meta.env.BASE_URL}resource-manifest.json`), read(`${API_URL}/api/resources`).catch(() => null)]); }
        finally { clearTimeout(timeout); }
        const assets = normalizeResources(manifests, window.location.origin, new URL(API_URL || "/", window.location.origin).href);
        if (!assets.length || stopped) return;
        const cache = await caches.open(RESOURCE_CACHE);
        reveal = setTimeout(() => { if (!stopped) setShow(true); }, 650);
        await prepareResources({ assets, cache, signal:controller.signal, background:() => background.current, onProgress:next => { if (!stopped) setState(next); } });
      } catch { /* A missing manifest or blocked cache must never prevent entering the casino. */ }
      finally { clearTimeout(reveal); clearTimeout(registrationTimeout); if (!stopped) setFinished(true); }
    }
    run();
    return () => { stopped = true; controller.abort(); clearTimeout(reveal); clearTimeout(registrationTimeout); };
  }, [enabled, attempt]);
  const preparing = enabled && foreground && !finished;
  const visible = preparing && show && state && state.completed < state.total;
  const progress = state?.total ? Math.round(state.completed / state.total * 100) : 0;
  const failed = finished && state && (state.failed || state.storageFull);
  return <PreparationContext.Provider value={preparing}>
    {children}
    {visible && <Dialog title={t("Préparation du casino")} className="resource-preparation-dialog" onClose={enter}>
      <div className="resource-preparation-scene"><Mascot cycle="preparation" cycleInterval={3500} priority/><div><span className="eyebrow">KTGA.ME</span><h2>{t("La prochaine partie n’attend que toi.")}</h2><p>{t("Images, sons et jeux se préparent sur cet appareil.")}</p></div></div>
      <div className="resource-preparation-progress"><Download size={18}/><strong>{progress}%</strong><span>{state.completed} / {state.total}</span></div>
      <progress max={state.total} value={state.completed} aria-label={t("Ressources prêtes")}/>
      <p className="resource-preparation-detail" role="status">{t("{value0} ressources déjà en cache", { value0:state.cached })} · {(state.bytes / 1048576).toFixed(1)} {t("Mo téléchargés")}</p>
      <footer><button type="button" onClick={enter}>{t("Entrer dans le casino")}<ArrowRight size={18}/></button></footer>
    </Dialog>}
    {failed && foreground && <div className="resource-preparation-retry" role="status"><span>{t("Certaines ressources seront chargées à leur ouverture.")}</span><button type="button" className="secondary" onClick={() => { setState(null); setShow(false); setAttempt(value => value + 1); }}><RotateCcw size={16}/>{t("Réessayer")}</button><button type="button" className="secondary" onClick={enter}>{t("Fermer")}</button></div>}
  </PreparationContext.Provider>;
}
