import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Cookie } from "lucide-react";
import { api } from "../api.js";
import { appPath } from "../navigation/routes.js";
import { Dialog } from "../components/common/Dialog.jsx";
import { CONSENT_DURATION, CONSENT_KEY, PRIVACY_VERSION, extractMarkers, readConsent } from "./consent.js";
import { AUDIENCE_VERSION, audienceAllowed, createAudienceClient } from "./audience.js";
import "./privacy.css";

const PrivacyContext = createContext(null);
export function usePrivacyChoice() { return useContext(PrivacyContext)?.choice; }
export const legalLinks = { terms: "Conditions d'utilisation", legal: "Mentions légales", privacy: "Confidentialité", cookies: "Cookies", parents: "Parents" };

export function PrivacyProvider({ children }) {
  const [choice, setChoice] = useState(() => { try { return readConsent(window.localStorage); } catch { return null; } });
  const [open, setOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(choice?.ageConfirmed === true);
  const [navigationEnabled, setNavigationEnabled] = useState(choice?.enabled === true);
  const [audienceEnabled, setAudienceEnabled] = useState(audienceAllowed(choice));
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => { try { const next = readConsent(window.localStorage); setChoice((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next); } catch { setChoice(null); } };
    window.addEventListener("storage", sync);
    const timer = setInterval(sync, 60000);
    return () => { clearInterval(timer); window.removeEventListener("storage", sync); };
  }, []);
  function choose(enabled, audience = false) {
    const next = { version: PRIVACY_VERSION, chosenAt: Date.now(), enabled, audience, audienceVersion: AUDIENCE_VERSION, ageConfirmed: (enabled || audience) && ageConfirmed };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(next)); } catch { /* A blocked storage keeps the choice for this visit only. */ }
    setChoice(next); setOpen(false); setError("");
    setNavigationEnabled(enabled); setAudienceEnabled(audience);
  }
  function openPreferences() { setAgeConfirmed(choice?.ageConfirmed === true); setNavigationEnabled(choice?.enabled === true); setAudienceEnabled(audienceAllowed(choice)); setOpen(true); }
  const content = <>
    <p>Les données nécessaires font fonctionner la connexion, les parties et vos préférences. Elles ne servent pas à la publicité.</p>
    <label className="privacy-purpose privacy-purpose-choice"><input type="checkbox" checked={navigationEnabled} onChange={(event) => setNavigationEnabled(event.target.checked)} /><div><strong>Succès de navigation · facultatif</strong><p>Autoriser la famille du navigateur, les types de pages visitées, certains indices secrets dans les liens et le temps actif. Pas d'historique détaillé ni d'URL complète enregistrée. Aucun effet sur les parties ou les jetons.</p></div></label>
    <label className="privacy-purpose privacy-purpose-choice"><input type="checkbox" checked={audienceEnabled} onChange={(event) => setAudienceEnabled(event.target.checked)} /><div><strong>Mesure d’audience Google Analytics · facultatif</strong><p>Permettre à Google de mesurer les visites avec des cookies et des informations générales sur le navigateur et l’appareil. Sans pseudo, email, identifiant de compte ni paramètres des liens. Analytics ne démarre pas avant votre accord. Le gestionnaire Google Tag Manager est toutefois chargé à l’ouverture du site, même sans cet accord. Aucun ciblage publicitaire dans notre intégration Analytics.</p></div></label>
    <label className="privacy-age"><input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />J'ai au moins 13 ans et peux consentir à ce suivi facultatif.</label>
    <p className="privacy-caption">Avant 13 ans, choisissez sans suivi. Votre choix est conservé 180 jours et peut être modifié à tout moment.</p>
    <div className="privacy-actions"><button type="button" className="secondary" onClick={() => choose(false)}>Tout refuser</button><button type="button" className="secondary" disabled={(navigationEnabled || audienceEnabled) && !ageConfirmed} onClick={() => choose(navigationEnabled, audienceEnabled)}>Enregistrer mes choix</button><button type="button" className="secondary" disabled={!ageConfirmed} onClick={() => choose(true, true)}>Tout accepter</button></div>
    <a href={appPath("cookies")}>Détails des cookies et stockages</a>
  </>;
  return <PrivacyContext.Provider value={{ choice, setError, open: openPreferences }}>
    {!choice && <section className="privacy-choice-panel" aria-label="Choix de confidentialité"><div className="privacy-choice-inner"><h2><Cookie size={23} />Votre confidentialité</h2>{content}</div></section>}
    {error && <div className="privacy-sync-error" role="alert">{error}<button type="button" className="secondary" onClick={openPreferences}>Revoir mon choix</button></div>}
    {children}
    <footer className="legal-footer"><nav aria-label="Informations legales"><a href={appPath("games")}>Jeux et règles</a><a href={appPath("faq")}>FAQ</a><a href={appPath("guide")}>Guide du joueur</a><a href={appPath("bugs")}>Suivi des bugs</a><a href={appPath("patchnotes")}>Patchnotes</a><a href={appPath("status")}>État des services</a>{Object.entries(legalLinks).map(([view, label]) => <a key={view} href={appPath(view)}>{label}</a>)}<button type="button" className="secondary" onClick={openPreferences}><Cookie size={15} />Mes préférences</button></nav><small>Jeux gratuits · Jetons virtuels sans valeur monétaire</small></footer>
    {open && <Dialog title="Mes préférences de confidentialité" className="privacy-dialog" onClose={() => setOpen(false)}>{content}</Dialog>}
  </PrivacyContext.Provider>;
}

export function useAudienceMeasurement(user, route, accountReady) {
  const { choice } = useContext(PrivacyContext);
  const client = useRef(null);
  useEffect(() => {
    client.current = createAudienceClient(window, document);
    return () => client.current.stop();
  }, []);
  useEffect(() => { client.current?.update({ choice, route, user, accountReady }); }, [choice, route, user?.minor?.restricted, accountReady]);
}

export function useSiteActivity(user, route) {
  const { choice, setError } = useContext(PrivacyContext);
  const current = useRef(route);
  const send = useRef(() => {});
  current.current = route;
  useEffect(() => { send.current(); const timer = setTimeout(() => send.current(), 5100); return () => clearTimeout(timer); }, [route.view, route.id]);
  useEffect(() => {
    if (!user?.id || user.guest || !choice) return;
    let stopped = false, timer, busy = false;
    let lastInteraction = Date.now();
    const interact = () => { lastInteraction = Date.now(); };
    const pause = () => { if (choice.enabled && !stopped) api("/api/me/activity", { method: "POST", background: true, body: JSON.stringify({ active: false }) }).catch(() => {}); };
    const visibility = () => { if (document.visibilityState !== "visible") pause(); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    async function start() {
      try {
        await api("/api/me/privacy", { method: "POST", background: true, body: JSON.stringify(choice) });
        if (stopped || !choice.enabled) return;
        const config = await api("/api/me/activity-config");
        if (stopped) return;
        const tick = async () => {
          const page = current.current.view;
          if (stopped || busy || Date.now() - choice.chosenAt >= CONSENT_DURATION || document.visibilityState !== "visible" || !document.hasFocus() || Date.now() - lastInteraction > 60000 || !["lobby", "profile", "shop", "leaderboard", "room", "spectator", "event", "admin"].includes(page)) return;
          busy = true;
          try { await api("/api/me/activity", { method: "POST", background: true, body: JSON.stringify({ page, ...(page === "room" ? { roomCode: current.current.id } : {}), markers: extractMarkers(location.search, config.markers ?? []) }) }); }
          catch (error) { if (!stopped) setError(`Le suivi facultatif est interrompu : ${error.message}`); stopped = true; }
          finally { busy = false; }
        };
        events.forEach((event) => window.addEventListener(event, interact, { passive: true }));
        window.addEventListener("blur", pause);
        document.addEventListener("visibilitychange", visibility);
        send.current = tick;
        tick(); timer = setInterval(tick, 30000);
      } catch (error) { if (!stopped) setError(`Le choix n'a pas pu être synchronisé avec le compte. Aucun suivi n'est lancé dans cet onglet. ${error.message}`); }
    }
    start();
    return () => { stopped = true; send.current = () => {}; clearInterval(timer); events.forEach((event) => window.removeEventListener(event, interact)); window.removeEventListener("blur", pause); document.removeEventListener("visibilitychange", visibility); };
  }, [user?.id, user?.guest, choice, setError]);
}
