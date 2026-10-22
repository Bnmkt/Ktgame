import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, Clock3, Gamepad2, MailWarning, Radio, RefreshCw, Settings, ShoppingBag, Sparkles, Trophy, Users, WalletCards } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { gameTitle } from "../../features/games/config.js";
import { CompactNumber } from "../../utils/presentation.jsx";
import "./admin-overview.css";

function Metric({ icon: Icon, label, value, detail, tone = "gold" }) {
  return <article className={`overview-metric overview-tone-${tone}`}><Icon size={19}/><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

export function AdminOverview({ overview, settings, onNavigate, formatDate }) {
  const { t, region } = useLocale();
  const [snapshot, setSnapshot] = useState(overview);
  const [days, setDays] = useState(7);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setBusy(true); setError("");
    api(`/api/admin/overview?days=${days}`, { background: true }).then((result) => {
      if (current) setSnapshot(result);
    }).catch((failure) => { if (current) setError(failure.message); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [days, revision, overview]);
  const view = snapshot ?? overview ?? {};
  const users = view.users ?? {}, rooms = view.rooms ?? {}, activity = view.activity ?? {};
  const economy = view.economy ?? {}, catalog = view.catalog ?? {}, events = view.events ?? {};
  const period = view.period;
  const dayLabel = (value) => value ? new Intl.DateTimeFormat(region, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
  const dateLabel = (value) => formatDate ? formatDate(value) : new Intl.DateTimeFormat(region, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  const net = (economy.credits ?? 0) - (economy.debits ?? 0);
  const number = (value) => <CompactNumber value={value ?? 0}/>;
  const attention = [
    view.health?.status === "warning" ? { urgent: true, icon: Activity, title: t("Serveur à surveiller"), detail: t("Les mesures actuelles signalent une pression sur le serveur ou un processus."), tab: "health" } : null,
    view.detectedIncidents?.pending ? { urgent: Boolean(view.detectedIncidents.ongoing), icon: AlertTriangle, title: t("{count} incident(s) à examiner", { count: view.detectedIncidents.pending }), detail: t("{count} anomalie(s) encore en cours", { count: view.detectedIncidents.ongoing ?? 0 }), tab: "health" } : null,
    users.dataRequests?.pending ? { urgent: Boolean(users.dataRequests.overdue), icon: MailWarning, title: t("{count} demande(s) de données personnelles", { count: users.dataRequests.pending }), detail: t("{count} échéance(s) dépassée(s)", { count: users.dataRequests.overdue ?? 0 }), tab: "users" } : null,
    view.pendingWork?.parental?.pending ? { icon: Users, title: t("{count} autorisation(s) parentale(s)", { count: view.pendingWork.parental.pending }), detail: t("Accords parentaux vérifiés, en attente de décision."), tab: "parental" } : null,
    view.pendingWork?.tribunal?.awaitingEnforcement ? { urgent: true, icon: AlertTriangle, title: t("{count} décision(s) du tribunal à appliquer", { count: view.pendingWork.tribunal.awaitingEnforcement }), detail: t("Dossiers en attente de validation humaine."), tab: "tribunal" } : null,
    view.pendingWork?.tribunal?.pendingReports ? { icon: AlertTriangle, title: t("{count} signalement(s) à examiner", { count: view.pendingWork.tribunal.pendingReports }), detail: t("Signalements de comportement en attente."), tab: "tribunal" } : null,
    view.pendingWork?.bugs?.pending ? { icon: Settings, title: t("{count} bug(s) à suivre", { count: view.pendingWork.bugs.pending }), detail: t("Signalements non corrigés ou non clôturés."), tab: "bugs" } : null,
    settings.emailVerificationRequired && !settings.emailVerificationAvailable ? { urgent: true, icon: MailWarning, title: t("Envoi d’emails indisponible"), detail: t("La validation est obligatoire mais le service SMTP n’est pas configuré."), tab: "settings" } : null,
    users.pendingVerification ? { icon: MailWarning, title: t("{count} email(s) à valider", { count: users.pendingVerification }), detail: t("Adresses non confirmées par les joueurs."), tab: "users" } : null,
    users.legacyLogins ? { icon: Users, title: t("{count} ancien(s) identifiant(s)", { count: users.legacyLogins }), detail: t("Migration vers une adresse email nécessaire."), tab: "users" } : null
  ].filter(Boolean).sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
  const daily = activity.daily ?? [], peak = Math.max(1, ...daily.map((row) => row.games));
  const catalogLinks = [
    [Gamepad2, "Jeux", `${catalog.enabledGames ?? 0}/${catalog.games ?? 0}`, "games"],
    [Trophy, "Succès", catalog.achievements ?? 0, "achievements"],
    [ShoppingBag, "Boutique", catalog.shopItems ?? 0, "shop"],
    [Sparkles, "Événements", events.active ?? 0, "events"],
    [Settings, "Paramètres", null, "settings"]
  ];

  return <div className="overview-console" aria-busy={busy}>
    <header className="overview-heading">
      <div><span className="eyebrow">{t("Pilotage du casino")}</span><h2>{t("Vue d’ensemble")}</h2><p>{view.generatedAt ? t("Actualisé le {date}", { date: dateLabel(view.generatedAt) }) : t("Chargement…")}</p></div>
      <button type="button" className="secondary" title={t("Actualiser la vue d’ensemble")} onClick={() => setRevision((value) => value + 1)} disabled={busy}><RefreshCw size={16} className={busy ? "overview-refreshing" : ""}/>{t("Actualiser")}</button>
    </header>
    {error && <p className="error" role="alert">{error} {t("Les dernières données reçues restent affichées.")}</p>}

    <section className="overview-live" aria-label={t("Situation en direct")}>
      <div><span><Radio size={15}/>{t("En direct")}</span><strong>{users.online ?? 0}</strong><small>{t("joueurs connectés")}</small></div>
      <button type="button" onClick={() => onNavigate("rooms")}><span><Gamepad2 size={15}/>{t("Tables ouvertes")}</span><strong>{rooms.active ?? 0}</strong><small>{t("{playing} en jeu · {waiting} en attente", { playing: rooms.playing ?? 0, waiting: rooms.waiting ?? 0 })}</small></button>
      <div><span><Users size={15}/>{t("Joueurs à table")}</span><strong>{rooms.seatedPlayers ?? 0}</strong><small>{t("+ {guests} invité(s) · {bots} IA", { guests: rooms.seatedGuests ?? 0, bots: rooms.seatedBots ?? 0 })}</small></div>
      <button type="button" onClick={() => onNavigate("health")} className={`overview-health overview-health-${view.health?.status ?? "unknown"}`}><span><Activity size={15}/>{t("Santé serveur")}</span><strong>{view.health ? t(view.health.status === "healthy" ? "Stable" : "À surveiller") : t("Non disponible")}</strong><small>{view.health ? t("CPU {cpu}% · latence P95 {lag} ms", { cpu: Math.round(view.health.cpuPercent ?? 0), lag: Math.round(view.health.eventLoopP95 ?? 0) }) : "—"}<ArrowRight size={13}/></small></button>
    </section>

    <section className="overview-period" aria-label={t("Bilan de la période")}>
      <header className="overview-section-heading"><div><h3>{t("Bilan de la période")}</h3><p>{period ? t("Du {from} au {to} inclus · {zone}", { from: dayLabel(period.from), to: dayLabel(period.to), zone: period.timeZone }) : "—"}</p></div><div className="overview-period-picker" role="group" aria-label={t("Période affichée")}>{[1, 7, 30].map((value) => <button type="button" key={value} aria-pressed={(period?.days ?? days) === value} className={(period?.days ?? days) === value ? "active" : "secondary"} onClick={() => setDays(value)}>{t(value === 1 ? "Aujourd’hui" : "{count} jours", { count: value })}</button>)}</div></header>
      <div className="overview-metrics">
        <Metric icon={Gamepad2} label={t("Parties terminées")} value={activity.games ?? 0} detail={t("{ranked} classées · {classic} classiques", { ranked: activity.rankedGames ?? 0, classic: (activity.games ?? 0) - (activity.rankedGames ?? 0) })}/>
        <Metric icon={Users} label={t("Participants uniques")} value={activity.uniquePlayers ?? 0} detail={t("Comptes ayant terminé au moins une partie")} tone="green"/>
        <Metric icon={Users} label={t("Nouvelles inscriptions")} value={users.newInPeriod ?? 0} detail={t("Comptes avec une date d’inscription connue")} tone="blue"/>
        <Metric icon={WalletCards} label={t("Variation des portefeuilles")} value={<CompactNumber value={Math.abs(net)} prefix={net >= 0 ? "+" : "−"}/>} detail={t("{count} mouvement(s) de jetons", { count: economy.transactions ?? 0 })} tone={net >= 0 ? "green" : "red"}/>
      </div>
      <div className="overview-economy"><span><WalletCards size={16}/>{t("Soldes actuels des comptes")}<b>{number(economy.circulatingTokens)}</b></span><span><ArrowDownLeft size={16}/>{t("Jetons crédités sur la période")}<b>{number(economy.credits)}</b></span><span><ArrowUpRight size={16}/>{t("Jetons débités sur la période")}<b>{number(economy.debits)}</b></span></div>
    </section>

    <div className="overview-columns">
      <section className="overview-section">
        <header className="overview-section-heading"><div><h3>{t("Activité quotidienne")}</h3><p>{t("Parties terminées par jour")}</p></div><button type="button" className="secondary" onClick={() => onNavigate("health")}><Activity size={15}/>{t("Rapports détaillés")}</button></header>
        <div className="overview-chart" role="img" aria-label={t("Parties terminées par jour")}><div className="overview-chart-bars">{daily.map((row) => <div key={row.date} className="overview-chart-day" title={t("{date} : {games} partie(s), {players} participant(s), {signups} inscription(s)", { date: dayLabel(row.date), games: row.games, players: row.players, signups: row.signups })}><span className="overview-chart-value">{row.games || ""}</span><span className="overview-chart-track"><i style={{ height: `${row.games / peak * 100}%` }}/></span><small>{daily.length <= 7 ? dayLabel(row.date) : Number(row.date.slice(-2))}</small></div>)}</div></div>
        {!(activity.games ?? 0) && <p className="overview-muted">{t("Aucune partie terminée sur cette période.")}</p>}
        <div className="overview-game-list">{(activity.topGames ?? []).map((game) => <div key={game.id}><strong>{t(gameTitle(game.id))}</strong><span>{t("{count} partie(s)", { count: game.games })}</span><small>{t("{count} participant(s)", { count: game.players })}</small></div>)}</div>
      </section>
      <section className="overview-section">
        <header className="overview-section-heading"><div><h3>{t("À traiter")}</h3><p>{t("Suivi administratif et alertes actuelles")}</p></div><b className="overview-count">{attention.length}</b></header>
        <div className="overview-action-list">{attention.map(({ urgent, icon: Icon, title, detail, tab }) => <button key={`${tab}-${title}`} type="button" className={urgent ? "overview-action-urgent" : ""} onClick={() => onNavigate(tab)}><Icon size={18}/><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={16}/></button>)}</div>
        {!attention.length && <p className="overview-empty"><CheckCircle2 size={20}/>{t("Aucune action en attente dans les contrôles suivis.")}</p>}
      </section>
    </div>

    <div className="overview-columns">
      <section className="overview-section">
        <header className="overview-section-heading"><div><h3>{t("Tables actives")}</h3><p>{t("Salles publiques et privées")}</p></div><button type="button" className="secondary" onClick={() => onNavigate("rooms")}>{t("Toutes les tables")}<ArrowRight size={15}/></button></header>
        <div className="overview-table-list">{(view.activeRooms ?? []).map((room) => <div key={room.id}><span><strong>{room.name}</strong><small>{t(gameTitle(room.gameId))} · {room.code}</small></span><span className={`status-badge ${room.playing ? "status-live" : "status-waiting"}`}>{t(room.playing ? "En cours" : "En attente")}</span><b>{room.players}<Users size={14}/></b></div>)}</div>
        {!view.activeRooms?.length && <p className="overview-empty"><Radio size={20}/>{t("Aucune table ouverte")}</p>}
      </section>
      <section className="overview-section">
        <header className="overview-section-heading"><div><h3>{t("Dernières inscriptions connues")}</h3><p>{t("Toutes dates confondues, indépendamment de la période")}</p></div><button type="button" className="secondary" onClick={() => onNavigate("users")}>{t("Comptes")}<ArrowRight size={15}/></button></header>
        <div className="overview-account-list">{(view.recentUsers ?? []).map((user) => <button type="button" key={user.id} onClick={() => onNavigate("users")}><Users size={16}/><span><strong>{user.displayName}</strong><small>{dateLabel(user.createdAt)}</small></span><span className={`status-badge ${user.emailVerified ? "status-active" : "status-waiting"}`}>{t(user.legacyLogin ? "Ancien login" : user.emailVerified ? "Validé" : "À valider")}</span></button>)}</div>
        {!view.recentUsers?.length && <p className="overview-empty"><Clock3 size={20}/>{t("Aucune inscription datée")}</p>}
      </section>
    </div>

    <footer className="overview-footer"><div className="overview-account-totals"><span>{t("{total} comptes · {enabled} activés · {disabled} désactivés", { total: users.total ?? 0, enabled: users.active ?? 0, disabled: users.inactive ?? 0 })}</span>{users.unknownRegistrationDates > 0 && <span><AlertTriangle size={14}/>{t("{count} date(s) d’inscription inconnue(s), exclue(s) des périodes.", { count: users.unknownRegistrationDates })}</span>}</div><nav className="overview-shortcuts" aria-label={t("Gestion du contenu")}>{catalogLinks.map(([Icon, label, count, tab]) => <button type="button" className="secondary" key={tab} onClick={() => onNavigate(tab)}><Icon size={15}/>{t(label)}{count !== null && <b>{count}</b>}</button>)}</nav><details><summary>{t("Périmètre des indicateurs")}</summary><p>{t("Les périodes suivent les jours calendaires du casino, aujourd’hui inclus. Les inscriptions sans date fiable et les événements futurs sont exclus. Les participants sont des comptes distincts ayant terminé une partie, sans invités ni IA. Les parties classées annulées ne comptent pas comme terminées.")}</p><p>{t("Les mouvements concernent les comptes conservés, sans jetons virtuels des invités ou IA. Leur solde net n’est pas un revenu. Les soldes actuels ne comprennent pas les jetons engagés à table. La santé serveur et les dossiers à traiter sont deux suivis distincts.")}</p>{activity.cancelled > 0 && <p>{t("{count} partie(s) classée(s) annulée(s) sur cette période.", { count: activity.cancelled })}</p>}</details></footer>
  </div>;
}
