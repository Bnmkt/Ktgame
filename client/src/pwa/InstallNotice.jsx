import { useLocale } from "../locales/LocaleProvider.jsx";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Dialog } from "../components/common/Dialog.jsx";
import { usePrivacyChoice } from "../privacy/Privacy.jsx";
import { createInstallController } from "./install.js";
import "./install.css";

export function InstallNotice() {
  const { t: localeText } = useLocale();
  const [controller] = useState(() => createInstallController(window));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [details, setDetails] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const choice = usePrivacyChoice();
  useEffect(() => {
    controller.start();
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
    <section className="install-notice" role="status" aria-label={localeText("Installation de KTGA.ME")}>
      <div className="install-notice-inner"><Smartphone size={24} aria-hidden="true" /><div><strong>{localeText("KTGA.ME, à portée de main")}</strong><p>{localeText("Ajoutez le casino à votre écran d’accueil ou à votre ordinateur.")}</p></div><div className="install-notice-actions"><button type="button" disabled={state.busy} onClick={install}><Download size={17} />{state.busy ? localeText("Installation…") : localeText("Installer")}</button><button type="button" className="secondary" onClick={controller.ignore}>{localeText("Ignorer")}</button></div></div>
    </section>
    {details && <Dialog title={localeText("Installer KTGA.ME")} className="install-help" onClose={() => setDetails(false)}>
      {state.help === "ios" ? <ol><li>{localeText("Ouvrez KTGA.ME dans votre navigateur.")}</li><li>{localeText("Touchez") + " "}<strong>{localeText("Partager")}</strong> <Share size={17} aria-hidden="true" />{localeText(", puis") + " "}<strong>{localeText("Sur l’écran d’accueil")}</strong>.</li><li>{localeText("Si l’option est proposée, activez") + " "}<strong>{localeText("Ouvrir comme app web")}</strong>{localeText(", puis touchez") + " "}<strong>{localeText("Ajouter")}</strong>.</li></ol> : state.help === "mac" ? <p>{localeText("Dans Safari, ouvrez le menu") + " "}<strong>{localeText("Fichier")}</strong>{" " + localeText("puis") + " "}<strong>{localeText("Ajouter au Dock")}</strong>.</p> : <p>{localeText("Ouvrez le menu de votre navigateur et choisissez") + " "}<strong>{localeText("Installer l’application")}</strong>{" " + localeText("ou") + " "}<strong>{localeText("Ajouter à l’écran d’accueil")}</strong>{localeText(", si cette option est proposée.")}</p>}
      <p>{localeText("Une connexion reste nécessaire pour jouer. Aucun accès aux notifications de votre appareil n’est demandé.")}</p>
      <div className="actions"><button type="button" onClick={controller.confirmInstalled}>{localeText("C’est installé")}</button><button type="button" className="secondary" onClick={controller.ignore}>{localeText("Ignorer cette proposition")}</button></div>
    </Dialog>}
  </>;
}
