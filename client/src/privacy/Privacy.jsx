import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Cookie, ShieldCheck } from "lucide-react";
import { api } from "../api.js";
import { appPath } from "../navigation/routes.js";
import { Dialog } from "../components/common/Dialog.jsx";
import { CONSENT_DURATION, CONSENT_KEY, PRIVACY_VERSION, extractMarkers, readConsent } from "./consent.js";
import "./privacy.css";

const PrivacyContext = createContext(null);
export const legalLinks = { terms: "Conditions d'utilisation", legal: "Mentions légales", privacy: "Confidentialité", cookies: "Cookies", parents: "Parents" };

export function PrivacyProvider({ children }) {
  const [choice, setChoice] = useState(() => { try { return readConsent(window.localStorage); } catch { return null; } });
  const [open, setOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => { try { const next = readConsent(window.localStorage); setChoice((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next); } catch { setChoice(null); } };
    window.addEventListener("storage", sync);
    const timer = setInterval(sync, 60000);
    return () => { clearInterval(timer); window.removeEventListener("storage", sync); };
  }, []);
  function choose(enabled) {
    const next = { version: PRIVACY_VERSION, chosenAt: Date.now(), enabled, ageConfirmed: enabled && ageConfirmed };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(next)); } catch { /* A blocked storage keeps the choice for this visit only. */ }
    setChoice(next); setOpen(false); setError("");
  }
  const content = <>
    <p>Les données nécessaires font fonctionner la connexion, les parties et vos préférences. Elles ne servent pas à la publicité.</p>
    <div className="privacy-purpose"><ShieldCheck size={22} /><div><strong>Succès de navigation · facultatif</strong><p>Autoriser la famille du navigateur, les types de pages visitées, certains indices secrets dans les liens et le temps actif. Pas d'historique détaillé ni d'URL complète enregistrée. Aucun effet sur les parties ou les jetons.</p></div></div>
    <label className="privacy-age"><input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />J'ai au moins 13 ans et peux consentir à ce suivi facultatif.</label>
    <p className="privacy-caption">Avant 13 ans, choisissez sans suivi. Votre choix est conservé 180 jours et peut être modifié à tout moment.</p>
    <div className="privacy-actions"><button type="button" className="secondary" onClick={() => choose(false)}>Refuser le suivi facultatif</button><button type="button" className="secondary" disabled={!ageConfirmed} onClick={() => choose(true)}>Accepter le suivi facultatif</button></div>
    <a href={appPath("cookies")}>Détails des cookies et stockages</a>
  </>;
  return <PrivacyContext.Provider value={{ choice, setError, open: () => setOpen(true) }}>
    {!choice && <section className="privacy-banner" aria-label="Choix de confidentialité"><div className="privacy-banner-inner"><h2><Cookie size={23} />Votre confidentialité</h2>{content}</div></section>}
    {error && <div className="privacy-sync-error" role="alert">{error}<button type="button" className="secondary" onClick={() => setOpen(true)}>Revoir mon choix</button></div>}
    {children}
    <footer className="legal-footer"><nav aria-label="Informations legales"><a href={appPath("patchnotes")}>Patchnotes</a><a href={appPath("status")}>État des services</a>{Object.entries(legalLinks).map(([view, label]) => <a key={view} href={appPath(view)}>{label}</a>)}<button type="button" className="secondary" onClick={() => setOpen(true)}><Cookie size={15} />Mes préférences</button></nav><small>Jeux gratuits · Jetons virtuels sans valeur monétaire</small></footer>
    {open && <Dialog title="Mes préférences de confidentialité" className="privacy-dialog" onClose={() => setOpen(false)}>{choice && <p>Suivi facultatif : <strong>{choice.enabled ? "autorisé" : "refusé"}</strong></p>}{content}</Dialog>}
  </PrivacyContext.Provider>;
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
