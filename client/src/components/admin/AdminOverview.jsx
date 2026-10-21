import { useLocale } from "../../locales/LocaleProvider.jsx";
import { AlertTriangle, ArrowRight, CheckCircle2, Gamepad2, MailWarning, Newspaper, Radio, Settings, ShoppingBag, Sparkles, Trophy, UserRoundCheck, Users, WalletCards } from "lucide-react";
import { gameTitle } from "../../features/games/config.js";
import { CompactNumber } from "../../utils/presentation.jsx";

function DashboardKpi({ icon: Icon, label, value, detail, tone }) {
  const { t: localeText } = useLocale();
  return <article className={`admin-dashboard-kpi tone-${tone}`}><span><Icon size={19} /></span><div><small>{localeText(label)}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function SectionLink({ icon: Icon, label, value, detail, onClick }) {
  const { t: localeText } = useLocale();
  return <button type="button" className="admin-dashboard-link" onClick={onClick}><span><Icon size={18} /></span><div><strong>{localeText(label)}</strong><small>{detail}</small></div><b>{value}</b><ArrowRight size={16} /></button>;
}

export function AdminOverview({ overview, settings, onNavigate, formatDate }) {
  const { t: localeText } = useLocale();
  const users = overview.users ?? {};
  const rooms = overview.rooms ?? {};
  const activity = overview.activity ?? {};
  const economy = overview.economy ?? {};
  const catalog = overview.catalog ?? {};
  const events = overview.events ?? {};
  const netToday = (economy.creditsToday ?? 0) - (economy.debitsToday ?? 0);
  const attention = [
    overview.detectedIncidents?.pending ? { tone: overview.detectedIncidents.ongoing ? "danger" : "warning", icon: AlertTriangle, title: `${overview.detectedIncidents.pending} incident(s) détecté(s) à examiner`, detail: overview.detectedIncidents.ongoing ? `${overview.detectedIncidents.ongoing} anomalie(s) non rétablie(s). Consulte le suivi dans Supervision > Statut public.` : "Les sondes sont rétablies ; complète et clôture les suivis dans Supervision > Statut public.", tab: "health" } : null,
    users.dataRequests?.pending ? { tone: users.dataRequests.overdue ? "danger" : "warning", icon: MailWarning, title: `${users.dataRequests.pending} demande(s) de données personnelles`, detail: users.dataRequests.overdue ? `${users.dataRequests.overdue} échéance(s) dépassée(s) : traiter sans délai.` : "Consulte les fiches signalées dans les comptes joueurs pour approuver les envois.", tab: "users" } : null,
    settings.emailVerificationRequired && !settings.emailVerificationAvailable ? { tone: "danger", icon: AlertTriangle, title: "Envoi d’emails indisponible", detail: "La validation est obligatoire mais le service SMTP n’est pas configuré.", tab: "settings" } : null,
    users.pendingVerification ? { tone: "warning", icon: MailWarning, title: `${users.pendingVerification} email(s) à valider`, detail: "Comptes créés avec une adresse encore non confirmée.", tab: "users" } : null,
    users.legacyLogins ? { tone: "warning", icon: Users, title: `${users.legacyLogins} ancien(s) identifiant(s)`, detail: "Ces joueurs doivent remplacer leur login par une adresse email.", tab: "users" } : null,
    catalog.disabledGames ? { tone: "neutral", icon: Gamepad2, title: `${catalog.disabledGames} jeu(x) masqué(s)`, detail: "Ils ne sont pas proposés sur la page d’accueil.", tab: "games" } : null,
    events.draft ? { tone: "neutral", icon: Sparkles, title: `${events.draft} événement(s) en brouillon`, detail: "Prêts à être complétés ou programmés.", tab: "events" } : null
  ].filter(Boolean);

  return <div className="admin-overview admin-dashboard">
    <header className="admin-dashboard-heading">
      <div><span className="eyebrow">{localeText("Situation actuelle")}</span><h2>{localeText("Vue d’ensemble")}</h2><p>{localeText("Les données importantes du casino, sans les rapports détaillés.")}</p></div>
      <div className={`admin-dashboard-state ${attention.some((item) => item.tone === "danger") ? "has-alert" : "is-clear"}`}>
        {attention.some((item) => item.tone === "danger") ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <div className="admin-dashboard-state-content"><span><strong>{attention.some((item) => item.tone === "danger") ? localeText("Action requise") : localeText("Aucun blocage critique")}</strong><small>{attention.length ? localeText("{value0} point(s) à examiner", { value0: attention.length }) : localeText("Aucun point bloquant détecté")}</small></span>{attention.length > 0 && <div className="admin-dashboard-state-items">{attention.map((item) => <button type="button" key={`${item.tab}-${item.title}`} onClick={() => onNavigate(item.tab)}><item.icon size={13} /><span>{item.title}</span><ArrowRight size={12} /></button>)}</div>}</div>
      </div>
    </header>

    <section className="admin-dashboard-kpis" aria-label={localeText("Activité du jour")}>
      <DashboardKpi icon={Gamepad2} label={localeText("Parties aujourd’hui")} value={activity.gamesToday ?? 0} detail={`${activity.gamesTotal ?? 0} archivées au total`} tone="gold" />
      <DashboardKpi icon={Users} label={localeText("Joueurs aujourd’hui")} value={activity.activePlayersToday ?? 0} detail={`${users.newToday ?? 0} inscription(s) aujourd’hui`} tone="green" />
      <DashboardKpi icon={Radio} label={localeText("Tables ouvertes")} value={rooms.active ?? 0} detail={`${rooms.playing ?? 0} en jeu · ${rooms.waiting ?? 0} en attente`} tone="blue" />
      <DashboardKpi icon={WalletCards} label={localeText("Flux net du jour")} value={<CompactNumber value={Math.abs(netToday)} prefix={netToday >= 0 ? "+" : "−"} label={localeText("Flux net exact du jour")} />} detail={`${economy.transactionsToday ?? 0} transaction(s)`} tone={netToday < 0 ? "red" : "green"} />
    </section>

    <section className="admin-dashboard-facts" aria-label={localeText("Indicateurs généraux")}>
      <span><b><CompactNumber value={economy.circulatingTokens ?? 0} label={localeText("Jetons en circulation exacts")} /></b>{" " + localeText("jetons en circulation")}</span>
      <span><b>{users.active ?? 0}</b>{" " + localeText("comptes actifs sur") + " "}{users.total ?? 0}</span>
      <span><b>{users.new7d ?? 0}</b>{" " + localeText("inscriptions sur 7 jours")}</span>
      <span><b>{rooms.seatedHumans ?? 0}</b>{" " + localeText("humains et") + " "}{rooms.seatedBots ?? 0}{" " + localeText("IA à table")}</span>
    </section>

    <div className="admin-dashboard-main-grid">
      <section className="admin-dashboard-panel admin-attention-panel">
        <div className="admin-dashboard-panel-heading"><div><span className="eyebrow">{localeText("File d’action")}</span><h3>{localeText("À examiner")}</h3></div><b>{attention.length}</b></div>
        <div className="admin-attention-list">
          {attention.slice(0, 5).map(({ tone, icon: Icon, title, detail, tab }) => <button type="button" key={`${tab}-${title}`} className={`tone-${tone}`} onClick={() => onNavigate(tab)}><span><Icon size={17} /></span><div><strong>{title}</strong><small>{detail}</small></div><ArrowRight size={16} /></button>)}
          {!attention.length && <div className="admin-dashboard-empty"><CheckCircle2 size={22} /><div><strong>{localeText("Rien à traiter")}</strong><span>{localeText("Les contrôles de configuration ne signalent aucun point.")}</span></div></div>}
        </div>
      </section>

      <section className="admin-dashboard-panel admin-live-panel">
        <div className="admin-dashboard-panel-heading"><div><span className="eyebrow">{localeText("Temps réel")}</span><h3>{localeText("Tables actives")}</h3></div><button type="button" className="secondary" onClick={() => onNavigate("rooms")}>{localeText("Toutes les tables")}<ArrowRight size={16}/></button></div>
        <div className="admin-room-list">{(overview.activeRooms ?? []).map((room) => <article key={room.id}><div><strong>{room.name}</strong><small>{localeText(gameTitle(room.gameId))}{" " + localeText("· code") + " "}{room.code}</small></div><span className={`status-badge ${room.playing ? "status-live" : "status-waiting"}`}>{room.playing ? localeText("En cours") : localeText("En attente")}</span><b>{room.players}{" " + localeText("joueur(s)")}</b></article>)}{!(overview.activeRooms ?? []).length && <div className="admin-dashboard-empty"><Radio size={22} /><div><strong>{localeText("Aucune table ouverte")}</strong><span>{localeText("Les nouvelles tables apparaîtront ici.")}</span></div></div>}</div>
      </section>
    </div>

    <div className="admin-dashboard-secondary-grid">
      <section className="admin-dashboard-panel">
        <div className="admin-dashboard-panel-heading"><div><span className="eyebrow">{localeText("Gestion")}</span><h3>{localeText("Catalogues et publication")}</h3></div></div>
        <div className="admin-dashboard-links">
          <SectionLink icon={Gamepad2} label={localeText("Jeux")} value={`${catalog.enabledGames ?? 0}/${catalog.games ?? 0}`} detail="publiés" onClick={() => onNavigate("games")} />
          <SectionLink icon={Trophy} label={localeText("Succès")} value={catalog.achievements ?? 0} detail={`${catalog.disabledAchievements ?? 0} désactivé(s)`} onClick={() => onNavigate("achievements")} />
          <SectionLink icon={ShoppingBag} label={localeText("Boutique")} value={catalog.shopItems ?? 0} detail={`${catalog.customShopItems ?? 0} personnalisé(s)`} onClick={() => onNavigate("shop")} />
          <SectionLink icon={Sparkles} label={localeText("Événements")} value={events.active ?? 0} detail={`${events.scheduled ?? 0} programmé(s)`} onClick={() => onNavigate("events")} />
          <SectionLink icon={Newspaper} label={localeText("Patchnotes")} value="" detail="versions et publications" onClick={() => onNavigate("patchnotes")} />
          <SectionLink icon={Settings} label={localeText("Paramètres")} value="" detail="identité, accès et économie" onClick={() => onNavigate("settings")} />
        </div>
      </section>

      <section className="admin-dashboard-panel admin-recent-users">
        <div className="admin-dashboard-panel-heading"><div><span className="eyebrow">{localeText("Comptes")}</span><h3>{localeText("Dernières inscriptions")}</h3></div><button type="button" className="secondary" onClick={() => onNavigate("users")}>{localeText("Tous les joueurs")}</button></div>
        <div>{(overview.recentUsers ?? []).map((entry) => <button type="button" key={entry.id} onClick={() => onNavigate("users")}><span><UserRoundCheck size={17} /></span><div><strong>{entry.displayName}</strong><small>{formatDate(entry.createdAt)}</small></div><em className={`status-badge ${entry.legacyLogin ? "status-inactive" : entry.emailVerified ? "status-active" : "status-waiting"}`}>{entry.legacyLogin ? localeText("Ancien login") : entry.emailVerified ? localeText("Validé") : localeText("À valider")}</em></button>)}{!(overview.recentUsers ?? []).length && <div className="admin-dashboard-empty"><Users size={22} /><div><strong>{localeText("Aucune inscription datée")}</strong><span>{localeText("Les prochains comptes apparaîtront ici.")}</span></div></div>}</div>
      </section>
    </div>
  </div>;
}
