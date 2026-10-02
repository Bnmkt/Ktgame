import { useEffect, useState } from "react";
import { Activity, ArrowLeft, CalendarDays, Check, Clock3, Coins, Gamepad2, MailCheck, PauseCircle, RefreshCw, ShieldCheck, Trophy } from "lucide-react";
import { api } from "../api.js";
import { appPath } from "../navigation/routes.js";
import { Dialog } from "../components/common/Dialog.jsx";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const duration = (seconds) => `${Math.floor(Number(seconds || 0) / 3600) ? `${Math.floor(seconds / 3600)} h ` : ""}${Math.floor(Number(seconds || 0) % 3600 / 60)} min`;
const transactionLabels = { "signup-bonus": "Jetons de bienvenue", "daily-claim": "Bonus quotidien", "room-entry": "Participation à une table", "room-payout": "Gain de partie", "shop-purchase": "Achat dans la boutique", "shop-pack-purchase": "Achat d’un pack", "blackjack-bet": "Mise au Blackjack", "blackjack-payout": "Gain au Blackjack", "community-event-entry": "Participation à un événement", "community-event-reward": "Récompense d’événement" };

export function ParentalPortalPage({ siteName }) {
  const parameters = new URL(window.location.href).searchParams;
  const verificationToken = parameters.get("parental-verify") ?? "";
  const portalToken = parameters.get("parental-access") ?? "";
  if (verificationToken) return <ParentalConsent token={verificationToken} siteName={siteName} />;
  return <ParentalDashboard token={portalToken} siteName={siteName} />;
}

function ParentPageHeader({ siteName, eyebrow, title, children }) {
  return <header className="parent-portal-heading"><a className="secondary" href={appPath("lobby")}><ArrowLeft size={17} />{siteName}</a><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{children}</div></header>;
}

function ParentalConsent({ token, siteName }) {
  const [request, setRequest] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/parental/request?token=${encodeURIComponent(token)}`).then(setRequest).catch((requestError) => setError(requestError.message)); }, [token]);
  async function consent() {
    setBusy(true); setError("");
    try { await api("/api/parental/consent", { method: "POST", body: JSON.stringify({ token, consent: accepted }) }); setComplete(true); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  return <main className="parent-portal-page"><div className="parent-portal-shell"><ParentPageHeader siteName={siteName} eyebrow="Autorisation parentale" title={complete ? "Votre décision est enregistrée" : "Examiner la demande"}><p>Une validation explicite est nécessaire avant la création d’un compte de moins de 13 ans.</p></ParentPageHeader>{error && <div className="error">{error}</div>}{!request && !error && <div className="parent-portal-loading"><RefreshCw className="spinning" />Chargement du dossier…</div>}{request && !complete && <div className="parent-consent-layout"><section className="parent-portal-panel parent-request-summary"><div className="parent-section-heading"><MailCheck /><div><span className="eyebrow">Dossier {request.code}</span><h2>{request.childPseudo}</h2></div></div><dl><div><dt>Date de naissance</dt><dd>{new Intl.DateTimeFormat("fr-BE", { dateStyle: "long" }).format(new Date(`${request.childBirthDate}T00:00:00`))}</dd></div><div><dt>Email du responsable</dt><dd>{request.parentEmail}</dd></div></dl></section><section className="parent-portal-panel"><div className="parent-section-heading"><ShieldCheck /><div><h2>Protections appliquées</h2><p>Ces règles pourront évoluer dans l’administration du service.</p></div></div><div className="parent-restriction-list">{request.restrictionOptions.filter((entry) => request.restrictions.includes(entry.id)).map((entry) => <span key={entry.id}><Check size={16} /><b>{entry.label}</b><small>{entry.description}</small></span>)}</div><label className="parent-consent-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span><strong>Je confirme être le responsable légal de cet enfant.</strong><small>J’autorise la création du compte, le traitement nécessaire de son activité et la réception d’un récapitulatif quotidien. Je pourrai suspendre l’accès jusqu’à ses 13 ans.</small></span></label><button type="button" disabled={!accepted || busy} onClick={consent}><ShieldCheck size={18} />{busy ? "Validation…" : "Donner mon accord"}</button></section></div>}{complete && <section className="parent-portal-panel parent-consent-complete"><Check size={30} /><h2>Adresse validée</h2><p>La demande attend maintenant une revue de l’équipe. Vous recevrez un email dès que le compte sera approuvé ou refusé.</p></section>}</div></main>;
}

function ParentalDashboard({ token, siteName }) {
  const [date, setDate] = useState(() => new URL(window.location.href).searchParams.get("date") || today());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoke, setRevoke] = useState({ duration: "7", reason: "", confirmed: false });
  const [busy, setBusy] = useState(false);
  const load = () => { setError(""); return api(`/api/parental/portal?token=${encodeURIComponent(token)}&date=${date}`).then(setData).catch((requestError) => setError(requestError.message)); };
  useEffect(() => { load(); }, [token, date]);
  async function revokeAccess() {
    setBusy(true); setError("");
    try { setData(await api("/api/parental/portal/revoke", { method: "POST", body: JSON.stringify({ token, days: Number(revoke.duration), untilThirteen: revoke.duration === "until13", reason: revoke.reason, date }) })); setRevokeOpen(false); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function reactivate() {
    setBusy(true); setError("");
    try { setData(await api("/api/parental/portal/reactivate", { method: "POST", body: JSON.stringify({ token, date }) })); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  return <main className="parent-portal-page">
    <div className="parent-portal-shell">
      <ParentPageHeader siteName={siteName} eyebrow="Espace parent" title={data ? `Activité de ${data.child.pseudo}` : "Suivi du compte"}><p>Consultez l’usage quotidien et gérez l’accès au service jusqu’aux 13 ans de l’enfant.</p></ParentPageHeader>
      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="parent-portal-loading"><RefreshCw className="spinning" />Chargement de l’activité…</div>}
      {data && <>
        <section className="parent-access-strip">
          <div><ShieldCheck /><span><small>État de l’accès</small><strong>{!data.access.managed ? "Compte standard" : data.access.revoked ? "Suspendu" : "Autorisé"}</strong>{data.access.revokedUntil && <em>jusqu’au {new Intl.DateTimeFormat("fr-BE", { dateStyle: "long" }).format(new Date(data.access.revokedUntil))}</em>}</span></div>
          <div className="actions">{data.access.reactivationRequestedAt && data.access.revoked && <button type="button" disabled={busy} onClick={reactivate}><Check size={17} />Valider la réactivation</button>}{data.access.managed && !data.access.revoked && <button type="button" className="danger-button" onClick={() => setRevokeOpen(true)}><PauseCircle size={17} />Suspendre l’accès</button>}</div>
        </section>
        <div className="parent-day-toolbar"><div><CalendarDays size={18} /><span><strong>Journée consultée</strong><small>Les données sont agrégées dans le fuseau du casino.</small></span></div><input type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <section className="parent-metric-grid">
          <article><Clock3 /><span>Temps actif</span><strong>{duration(data.metrics.seconds)}</strong></article>
          <article><Activity /><span>Sessions</span><strong>{data.metrics.sessions}</strong></article>
          <article><Gamepad2 /><span>Parties</span><strong>{data.metrics.games}</strong></article>
          <article><Trophy /><span>Victoires</span><strong>{data.metrics.wins}</strong></article>
          <article><Activity /><span>Actions</span><strong>{data.metrics.actions}</strong></article>
          <article><Coins /><span>Jetons dépensés</span><strong>{data.metrics.debits}</strong></article>
        </section>
        <div className="parent-dashboard-columns">
          <section className="parent-portal-panel"><div className="parent-section-heading"><Activity /><div><h2>Chronologie agrégée</h2><p>Pages et types d’actions, sans contenu privé ni frappe au clavier.</p></div></div><div className="parent-activity-list">{data.activity.map((entry) => <article key={`${entry.category}-${entry.label}`}><span><strong>{entry.label}</strong><small>{new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.firstAt))}–{new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.lastAt))}</small></span><b>{entry.durationSeconds ? duration(entry.durationSeconds) : `${entry.count} action(s)`}</b></article>)}{!data.activity.length && <div className="empty-state">Aucune activité enregistrée ce jour.</div>}</div></section>
          <section className="parent-portal-panel"><div className="parent-section-heading"><Gamepad2 /><div><h2>Parties jouées</h2><p>Résultats disponibles pour la journée.</p></div></div><div className="parent-game-list">{data.history.map((entry) => <article key={entry.id}><span><strong>{entry.name}</strong><small>{entry.gameId} · {entry.players} participant(s)</small></span><b className={entry.won ? "won" : ""}>{entry.won ? "Victoire" : "Participation"}</b></article>)}{!data.history.length && <div className="empty-state">Aucune partie terminée ce jour.</div>}</div></section>
          <section className="parent-portal-panel parent-transactions-panel"><div className="parent-section-heading"><Coins /><div><h2>Mouvements de jetons</h2><p>Gains et dépenses de la journée, sans valeur monétaire réelle.</p></div></div><div className="parent-game-list">{data.transactions.map((entry) => <article key={entry.id}><span><strong>{transactionLabels[entry.reason] ?? "Mouvement de jetons"}</strong><small>{new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}{entry.gameId ? ` · ${entry.gameId}` : ""}</small></span><b className={entry.amount > 0 ? "won" : ""}>{entry.amount > 0 ? "+" : ""}{entry.amount}</b></article>)}{!data.transactions.length && <div className="empty-state">Aucun mouvement de jetons ce jour.</div>}</div></section>
        </div>
      </>}
    </div>
    {revokeOpen && <Dialog title="Suspendre l’accès" className="parent-revoke-dialog" onClose={() => setRevokeOpen(false)}><p>La session sera fermée immédiatement. La durée ne peut pas dépasser le treizième anniversaire.</p><label>Durée<select value={revoke.duration} onChange={(event) => setRevoke({ ...revoke, duration: event.target.value })}><option value="1">1 jour</option><option value="7">7 jours</option><option value="30">30 jours</option><option value="until13">Jusqu’aux 13 ans</option></select></label><label>Motif<textarea maxLength={240} value={revoke.reason} onChange={(event) => setRevoke({ ...revoke, reason: event.target.value })} placeholder="Ce motif sera visible sur l’écran de connexion de l’enfant." /></label><label className="parent-consent-check"><input type="checkbox" checked={revoke.confirmed} onChange={(event) => setRevoke({ ...revoke, confirmed: event.target.checked })} /><span><strong>Je confirme cette décision.</strong><small>Une demande de réactivation devra être validée depuis cet espace.</small></span></label><div className="actions"><button type="button" className="danger-button" disabled={!revoke.confirmed || busy} onClick={revokeAccess}>Confirmer la suspension</button><button type="button" className="secondary" onClick={() => setRevokeOpen(false)}>Annuler</button></div></Dialog>}
  </main>;
}
