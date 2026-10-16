import { Component, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, Gamepad2, RefreshCw } from "lucide-react";
import { CasinoApplication } from "./App.jsx";
import { LocaleProvider, useLocale } from "./locales/LocaleProvider.jsx";
import { isDiscordActivityLocation } from "./features/discord/context.js";
import { connectActivity, getActivityConfiguration, installActivityLinks, openActivityBrowser } from "./features/discord/runtime.js";
import "./features/discord/activity.css";

function BrowserButton({ onError, ...props }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  return <button type="button" {...props} disabled={busy} onClick={async () => { setBusy(true); try { await openActivityBrowser(); } catch (error) { onError(error.message); } finally { setBusy(false); } }}><ExternalLink size={18}/>{t("Ouvrir dans le navigateur")}</button>;
}
function ActivityRecovery() {
  const { t } = useLocale();
  const [error, setError] = useState("");
  return <main className="activity-recovery"><img src="/pwa/icon-180.png" alt="" width="64" height="64"/><h1>KTGA.ME</h1><p role="alert">{t("Le casino n’a pas pu s’afficher dans Discord.")}</p><div className="actions"><button type="button" className="secondary" onClick={() => window.location.reload()}><RefreshCw size={18}/>{t("Réessayer")}</button><BrowserButton onError={setError}/></div>{error && <p role="alert">{t(error)}</p>}<a href="https://www.ktga.me/" target="_blank" rel="noopener noreferrer">www.ktga.me</a></main>;
}
class ActivityBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ActivityRecovery/> : this.props.children; }
}
function ActivityRoot() {
  const { t } = useLocale();
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [error, setError] = useState("");
  const toolbar = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const connect = isDiscordActivityLocation() ? connectActivity() : getActivityConfiguration();
    connect.then(() => { if (!cancelled) setReady(isDiscordActivityLocation()); }).catch(failure => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!playing) return;
    document.body.classList.add("activity-session");
    const resize = () => document.body.style.setProperty("--activity-toolbar-height", `${toolbar.current.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(resize); observer.observe(toolbar.current); resize();
    const removeLinks = installActivityLinks(failure => setError(failure.message));
    return () => { document.body.classList.remove("activity-session"); document.body.style.removeProperty("--activity-toolbar-height"); observer.disconnect(); removeLinks(); };
  }, [playing]);
  if (playing) return <CasinoApplication embedded><div ref={toolbar} className="activity-toolbar"><span><Gamepad2 size={18}/>Discord</span><BrowserButton className="secondary" onError={setError}/>{error && <p role="alert">{t(error)}</p>}</div></CasinoApplication>;
  return <main className="activity-entry"><header><img src="/pwa/icon-180.png" alt="" width="48" height="48"/><span>KTGA.ME</span><small>Discord</small></header><div className="activity-entry-content"><img className="activity-entry-image" src="/ktga-preview.png" alt="KTGA.ME" width="1200" height="630"/><h1>KTGA.ME</h1><p>{t("Où souhaites-tu jouer ?")}</p><div className="activity-entry-actions"><button type="button" disabled={!ready} onClick={() => { setError(""); setPlaying(true); }}><Gamepad2 size={21}/>{t("Jouer dans Discord")}</button><BrowserButton className="secondary" onError={setError}/></div>{!ready && isDiscordActivityLocation() && !error && <p role="status">{t("Connexion à Discord…")}</p>}{!isDiscordActivityLocation() && <p>{t("Lance l’activité depuis Discord pour jouer ici.")}</p>}{error && <p role="alert">{t(error)}</p>}</div><footer>{t("Jeux gratuits · Jetons virtuels sans valeur monétaire")}</footer></main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><ActivityBoundary><ActivityRoot/></ActivityBoundary></LocaleProvider>);
