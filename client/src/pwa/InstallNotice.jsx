import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Dialog } from "../components/common/Dialog.jsx";
import { usePrivacyChoice } from "../privacy/Privacy.jsx";
import { createInstallController, registerOfflineWorker } from "./install.js";
import "./install.css";

export function InstallNotice() {
  const [controller] = useState(() => createInstallController(window));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [details, setDetails] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const choice = usePrivacyChoice();
  useEffect(() => {
    controller.start();
    if (import.meta.env.PROD) registerOfflineWorker(window, import.meta.env.BASE_URL);
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => { controller.stop(); document.removeEventListener("fullscreenchange", sync); };
  }, [controller]);
  useEffect(() => { if (!state.visible) setDetails(false); }, [state.visible]);
  if (!state.visible || !choice || fullscreen) return null;
  async function install() {
    if (await controller.install() === "manual") setDetails(true);
  }
  return <>
    <section className="install-notice" role="status" aria-label="Installation de KTGA.ME">
      <div className="install-notice-inner"><Smartphone size={24} aria-hidden="true" /><div><strong>KTGA.ME, à portée de main</strong><p>Ajoutez le casino à votre écran d’accueil ou à votre ordinateur.</p></div><div className="install-notice-actions"><button type="button" disabled={state.busy} onClick={install}><Download size={17} />{state.busy ? "Installation…" : "Installer"}</button><button type="button" className="secondary" onClick={controller.ignore}>Ignorer</button></div></div>
    </section>
    {details && <Dialog title="Installer KTGA.ME" className="install-help" onClose={() => setDetails(false)}>
      {state.help === "ios" ? <ol><li>Ouvrez KTGA.ME dans votre navigateur.</li><li>Touchez <strong>Partager</strong> <Share size={17} aria-hidden="true" />, puis <strong>Sur l’écran d’accueil</strong>.</li><li>Si l’option est proposée, activez <strong>Ouvrir comme app web</strong>, puis touchez <strong>Ajouter</strong>.</li></ol> : state.help === "mac" ? <p>Dans Safari, ouvrez le menu <strong>Fichier</strong> puis <strong>Ajouter au Dock</strong>.</p> : <p>Ouvrez le menu de votre navigateur et choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>, si cette option est proposée.</p>}
      <p>Une connexion reste nécessaire pour jouer. Aucun accès aux notifications de votre appareil n’est demandé.</p>
      <div className="actions"><button type="button" onClick={controller.confirmInstalled}>C’est installé</button><button type="button" className="secondary" onClick={controller.ignore}>Ignorer cette proposition</button></div>
    </Dialog>}
  </>;
}
