import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, CalendarDays, Coins, Gamepad2, RefreshCw, ShoppingBag, Sparkles, Target, Trophy, Users, WalletCards, Zap } from "lucide-react";
import { api } from "../../api.js";
import { CompactNumber, formatCompactNumber, formatExactNumber, transactionLabel } from "../../utils/presentation.jsx";
import { shopTypeLabel } from "../cosmetics/Cosmetics.jsx";

const palette = ["#69d5aa", "#f0bd48", "#e36a78", "#7dc7ff"];
const weekdayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const formatNumber = (value, maximumFractionDigits = 1) => formatCompactNumber(Number(value || 0), maximumFractionDigits === 0 ? 10000 : 100000);
const formatPercent = (value) => `${formatNumber(Number(value || 0) * 100, 1)} %`;
const eventStatusLabels = { draft: "Brouillon", scheduled: "Planifié", active: "Actif", finished: "Terminé", cancelled: "Annulé" };
const formatDate = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium" }).format(new Date(value)) : "—";

function MetricCard({ icon: Icon, label, value, detail, tone = "gold" }) {
  return <article className={`metrics-kpi tone-${tone}`}><span><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function LineChart({ rows, series, height = 250 }) {
  const width = 900;
  const padding = { left: 42, right: 18, top: 18, bottom: 28 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...rows.flatMap((row) => series.map((entry) => Number(row[entry.key]) || 0)));
  const point = (value, index) => `${padding.left + (rows.length <= 1 ? 0 : index * chartWidth / (rows.length - 1))},${padding.top + chartHeight - (Number(value) || 0) * chartHeight / max}`;
  return <div className="metrics-chart"><div className="metrics-chart-legend">{series.map((entry, index) => <span key={entry.key}><i style={{ background: entry.color ?? palette[index] }} />{entry.label}</span>)}<small>Maximum : {formatNumber(max)}</small></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.map((entry) => entry.label).join(" et ")} preserveAspectRatio="none">{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * ratio} y2={padding.top + chartHeight * ratio} /><text x={padding.left - 8} y={padding.top + chartHeight * ratio + 4}>{formatNumber(max * (1 - ratio), 0)}</text></g>)}{series.map((entry, seriesIndex) => <polyline key={entry.key} points={rows.map((row, index) => point(row[entry.key], index)).join(" ")} style={{ stroke: entry.color ?? palette[seriesIndex] }} />)}<text className="metrics-axis-date" x={padding.left} y={height - 5}>{rows[0]?.date?.slice(5) ?? ""}</text><text className="metrics-axis-date" textAnchor="end" x={width - padding.right} y={height - 5}>{rows.at(-1)?.date?.slice(5) ?? ""}</text></svg></div>;
}

function DualAreaChart({ rows }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.credits, row.debits]));
  return <div className="metrics-volume-chart" style={{ gridTemplateColumns: `repeat(${Math.max(1, rows.length)}, minmax(2px, 1fr))` }}>{rows.map((row) => <div key={row.date} title={`${row.date} · crédits ${formatExactNumber(row.credits)} · débits ${formatExactNumber(row.debits)}`}><i className="credit" style={{ height: `${Math.max(row.credits ? 3 : 0, row.credits / max * 100)}%` }} /><i className="debit" style={{ height: `${Math.max(row.debits ? 3 : 0, row.debits / max * 100)}%` }} /></div>)}</div>;
}

function HorizontalBars({ rows, label, value, format = formatNumber, limit = 10 }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map(value));
  return <div className="metrics-bars">{shown.map((row, index) => <div key={row.id ?? row.reason ?? row.label ?? index}><span title={label(row)}>{label(row)}</span><i><b style={{ width: `${value(row) / max * 100}%` }} /></i><strong title={formatExactNumber(value(row))}>{format(value(row))}</strong></div>)}{!shown.length && <div className="empty-state">Pas encore de données sur cette période.</div>}</div>;
}

function Ranking({ title, rows, value, suffix = "" }) {
  return <section className="metrics-ranking"><h3>{title}</h3>{rows.map((row, index) => <article key={row.id}><b>{index + 1}</b><span><strong>{row.pseudo}</strong><small>{row.games} partie(s) · {row.wins} victoire(s)</small></span><em>{value(row)}{suffix}</em></article>)}{!rows.length && <div className="empty-state">Aucun joueur actif.</div>}</section>;
}

function Heatmap({ rows }) {
  const max = Math.max(1, ...rows.map((row) => row.games));
  return <div className="metrics-heatmap" aria-label="Intensité quotidienne des parties">{rows.map((row) => <i key={row.date} title={`${row.date} · ${row.games} partie(s) · ${row.activePlayers} joueur(s) actif(s)`} style={{ "--intensity": row.games / max }} />)}</div>;
}

export function AdminMetrics({ reportError }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    reportError?.("");
    try {
      setData(await api(`/api/admin/metrics?days=${days}`));
    } catch (error) {
      reportError?.(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [days]);
  const peakHour = useMemo(() => data?.activity?.byHour?.reduce((best, row) => row.games > (best?.games ?? -1) ? row : best, null), [data]);
  const peakDay = useMemo(() => data?.activity?.byWeekday?.reduce((best, row) => row.games > (best?.games ?? -1) ? row : best, null), [data]);
  if (loading && !data) return <section className="card metrics-loading"><RefreshCw className="spinning" /><strong>Calcul des métriques…</strong><small>Analyse des joueurs, parties, transactions, objets et succès.</small></section>;
  if (!data) return null;
  const { summary, activity, economy, rooms, shop, achievements } = data;
  const communityEvents = data.communityEvents ?? { summary: {}, statuses: [], events: [], topParticipants: [] };
  const eventSummary = communityEvents.summary ?? {};
  return <div className="admin-metrics-page">
    <header className="metrics-heading"><div><span className="eyebrow">Observatoire du casino</span><h2>Metrics</h2><p>Données consolidées le {new Intl.DateTimeFormat("fr-BE", { dateStyle: "long", timeStyle: "short" }).format(new Date(data.generatedAt))}.</p></div><div className="metrics-actions"><div className="segmented-tabs">{[30, 90, 365].map((value) => <button type="button" key={value} className={days === value ? "active" : ""} onClick={() => setDays(value)}>{value} jours</button>)}</div><button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCw size={17} className={loading ? "spinning" : ""} />Actualiser</button></div></header>

    <section className="metrics-kpi-grid">
      <MetricCard icon={Users} label="Joueurs actifs" value={formatNumber(summary.activePlayers, 0)} detail={`${summary.newAccounts} nouveau(x) compte(s) · ${summary.activeAccounts}/${summary.accounts} actifs`} tone="green" />
      <MetricCard icon={Gamepad2} label="Parties terminées" value={formatNumber(summary.games, 0)} detail={`${formatNumber(activity.averageGamesPerDay)} par jour · ${summary.totalGames} au total`} />
      <MetricCard icon={Coins} label="Jetons en circulation" value={<CompactNumber value={summary.circulation} label="Circulation exacte" />} detail={<>Médiane <CompactNumber value={data.users.balanceMedian} /> · moyenne <CompactNumber value={data.users.balanceAverage} /></>} tone="blue" />
      <MetricCard icon={WalletCards} label="Flux net" value={<CompactNumber value={Math.abs(summary.net)} prefix={summary.net >= 0 ? "+" : "−"} label="Flux net exact" />} detail={<><CompactNumber value={summary.credits} /> crédités · <CompactNumber value={summary.debits} /> débités</>} tone={summary.net >= 0 ? "green" : "red"} />
      <MetricCard icon={Activity} label="Activité récente" value={`${activity.active1d} / ${activity.active7d} / ${activity.active30d}`} detail="Joueurs actifs sur 1, 7 et 30 jours" />
      <MetricCard icon={Trophy} label="Pots engagés" value={<CompactNumber value={summary.pots} label="Pots engagés exacts" />} detail={<><CompactNumber value={summary.games ? summary.pots / summary.games : 0} /> par partie</>} />
      <MetricCard icon={ShoppingBag} label="Boutique" value={<CompactNumber value={shop.revenue} label="Revenu exact" />} detail={<><CompactNumber value={shop.purchases} /> achat(s) · <CompactNumber value={shop.catalogItems} /> objets</>} tone="blue" />
      <MetricCard icon={Bot} label="Tables actives" value={rooms.active} detail={`${rooms.playing} en jeu · ${rooms.seatedPlayers} joueurs · ${rooms.seatedBots} IA`} tone="green" />
    </section>

    <section className="metrics-section metrics-wide metrics-community-events">
      <div className="metrics-section-heading"><div><span className="eyebrow">Communauté</span><h3>Événements communautaires</h3></div><small>Données de la période sélectionnée, sauf les cagnottes courantes et les totaux explicitement indiqués.</small></div>
      <div className="metrics-kpi-grid metrics-event-kpis">
        <MetricCard icon={CalendarDays} label="Événements" value={`${eventSummary.active ?? 0} actif(s)`} detail={`${eventSummary.total ?? 0} au catalogue · ${eventSummary.scheduled ?? 0} planifié(s)`} tone="green" />
        <MetricCard icon={Users} label="Participants uniques" value={<CompactNumber value={eventSummary.uniqueParticipants ?? 0} />} detail={`${formatNumber(eventSummary.joins ?? 0, 0)} inscription(s) sur la période`} tone="blue" />
        <MetricCard icon={Zap} label="Actions effectuées" value={<CompactNumber value={eventSummary.actions ?? 0} label="Actions exactes" />} detail={`${formatNumber(eventSummary.paidActions ?? 0, 0)} payantes · ${formatNumber(eventSummary.criticalActions ?? 0, 0)} critiques`} />
        <MetricCard icon={Target} label="Impact communautaire" value={<CompactNumber value={eventSummary.damage ?? 0} label="Dégâts exacts" />} detail={<><CompactNumber value={eventSummary.contribution ?? 0} label="Contribution exacte" /> de contribution</>} tone="red" />
        <MetricCard icon={Coins} label="Cagnottes courantes" value={<CompactNumber value={eventSummary.currentPot ?? 0} label="Cagnottes exactes" />} detail={<><CompactNumber value={eventSummary.potInflow ?? 0} /> ajoutés sur la période</>} />
        <MetricCard icon={WalletCards} label="Achats d’actions" value={<CompactNumber value={eventSummary.purchaseRevenue ?? 0} label="Revenu exact" />} detail={<><CompactNumber value={eventSummary.entryRevenue ?? 0} /> d’entrées payantes</>} tone="blue" />
        <MetricCard icon={Trophy} label="Récompenses versées" value={<CompactNumber value={eventSummary.rewardsDistributed ?? 0} label="Récompenses exactes" />} detail={<><CompactNumber value={eventSummary.potOutflow ?? 0} /> sortis des cagnottes</>} tone="green" />
        <MetricCard icon={Sparkles} label="Taux critique" value={formatPercent((eventSummary.criticalActions ?? 0) / Math.max(1, eventSummary.actions ?? 0))} detail="Part des actions ayant déclenché un lancer critique" />
      </div>
    </section>

    <div className="metrics-two-columns">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Participation</span><h3>Activité des événements</h3></div><small>Actions, joueurs et achats par jour</small></div><LineChart rows={activity.daily} series={[{ key: "eventActions", label: "Actions", color: palette[1] }, { key: "eventParticipants", label: "Participants", color: palette[0] }, { key: "eventPurchases", label: "Actions achetées", color: palette[3] }]} /></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Objectifs</span><h3>Dégâts et contribution</h3></div><small>Impact journalier des actions</small></div><LineChart rows={activity.daily} series={[{ key: "eventDamage", label: "Dégâts", color: palette[2] }, { key: "eventContribution", label: "Contribution", color: palette[0] }]} /><div className="metrics-economy-totals"><span><small>Entrées au pot</small><strong><CompactNumber value={eventSummary.potInflow ?? 0} label="Entrées exactes" /></strong></span><span><small>Achats</small><strong><CompactNumber value={eventSummary.purchaseRevenue ?? 0} label="Achats exacts" /></strong></span><span><small>Récompenses</small><strong><CompactNumber value={eventSummary.rewardsDistributed ?? 0} label="Récompenses exactes" /></strong></span></div></section>
    </div>

    <div className="metrics-two-columns">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Cycle de vie</span><h3>État des événements</h3></div></div><HorizontalBars rows={communityEvents.statuses ?? []} label={(row) => eventStatusLabels[row.status] ?? row.status} value={(row) => row.count} format={(value) => `${value} événement(s)`} /></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Classement</span><h3>Contributeurs de la période</h3></div><small>Classés par contribution générée</small></div><div className="metrics-item-list metrics-event-contributors">{(communityEvents.topParticipants ?? []).slice(0, 10).map((entry, index) => <article key={entry.id}><b>#{index + 1}</b><span><strong>{entry.pseudo}</strong><small>{entry.events.join(" · ") || "Événement"} · {entry.actions} action(s), {entry.criticalActions} critique(s)</small></span><em><CompactNumber value={entry.contribution} label="Contribution exacte" /> pts</em></article>)}</div>{!communityEvents.topParticipants?.length && <div className="empty-state">Aucune contribution sur cette période.</div>}</section>
    </div>

    <section className="metrics-section metrics-wide"><div className="metrics-section-heading"><div><span className="eyebrow">Analyse détaillée</span><h3>Performance par événement</h3></div><small>{communityEvents.events?.length ?? 0} événement(s), activité filtrée sur {days} jours</small></div><div className="metrics-table-scroll"><table className="score-table metrics-table metrics-event-table"><thead><tr><th>Événement</th><th>Progression</th><th>Participants</th><th>Actions</th><th>Critiques</th><th>Dégâts</th><th>Contribution</th><th>Cagnotte</th><th>Revenus</th><th>Récompenses</th></tr></thead><tbody>{(communityEvents.events ?? []).map((event) => <tr key={event.id}><td><strong>{event.name}</strong><small>{eventStatusLabels[event.status] ?? event.status} · {event.gameType === "cards" ? "Cartes" : "Dés"}<br />{formatDate(event.startsAt)} → {formatDate(event.endsAt)}</small></td><td><div className="metrics-event-progress"><span>{formatNumber(event.progress)} %</span><i><b style={{ width: `${Math.min(100, Math.max(0, event.progress))}%` }} /></i><small>{event.milestonesReached}/{event.milestonesTotal} palier(s)</small></div></td><td><strong><CompactNumber value={event.activeParticipants} /></strong><small>{event.participants} total · {event.joins} nouveau(x)</small></td><td><strong><CompactNumber value={event.actions} /></strong><small>{event.totalActions} au total · {event.paidActions} payante(s)</small></td><td>{event.criticalActions}<small>{formatPercent(event.criticalActions / Math.max(1, event.actions))}</small></td><td><CompactNumber value={event.damage} label="Dégâts exacts" /></td><td><CompactNumber value={event.contribution} label="Contribution exacte" /></td><td><strong><CompactNumber value={event.currentPot} label="Cagnotte exacte" /></strong><small>+<CompactNumber value={event.potInflow} /> / −<CompactNumber value={event.potOutflow} /></small></td><td><CompactNumber value={event.entryRevenue + event.purchaseRevenue} label="Revenus exacts" /><small>{event.purchasedActions} action(s) achetée(s)</small></td><td><CompactNumber value={event.rewardsDistributed} label="Récompenses exactes" /><small>{event.rewardedPlayers} bénéficiaire(s)</small></td></tr>)}</tbody></table></div>{!communityEvents.events?.length && <div className="empty-state">Aucun événement configuré.</div>}</section>

    <section className="metrics-section metrics-wide"><div className="metrics-section-heading"><div><span className="eyebrow">Fréquentation</span><h3>Activité quotidienne</h3></div><small>{formatNumber(activity.averageActivePlayersPerDay)} joueur(s) actif(s) par jour en moyenne</small></div><LineChart rows={activity.daily} series={[{ key: "games", label: "Parties", color: palette[1] }, { key: "activePlayers", label: "Joueurs actifs", color: palette[0] }, { key: "signups", label: "Inscriptions", color: palette[3] }]} /><Heatmap rows={activity.daily} /></section>

    <div className="metrics-two-columns">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Économie</span><h3>Crédits et débits quotidiens</h3></div><div className="metrics-inline-legend"><span><i className="credit" />Crédits</span><span><i className="debit" />Débits</span></div></div><DualAreaChart rows={activity.daily} /><div className="metrics-economy-totals"><span><small>Volume</small><strong><CompactNumber value={summary.credits + summary.debits} label="Volume exact" /></strong></span><span><small>Transactions</small><strong><CompactNumber value={summary.transactions} /></strong></span><span><small>Flux net</small><strong className={summary.net >= 0 ? "positive-amount" : "negative-amount"}><CompactNumber value={Math.abs(summary.net)} prefix={summary.net >= 0 ? "+" : "−"} label="Flux net exact" /></strong></span></div></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Rythme</span><h3>Moments les plus actifs</h3></div><small>Heures Europe/Brussels</small></div><div className="metrics-peak"><span><small>Jour le plus actif</small><strong>{weekdayLabels[peakDay?.weekday] ?? "—"}</strong><em>{peakDay?.games ?? 0} parties</em></span><span><small>Heure de pointe</small><strong>{String(peakHour?.hour ?? 0).padStart(2, "0")}h</strong><em>{peakHour?.games ?? 0} parties</em></span></div><HorizontalBars rows={activity.byWeekday.map((row) => ({ ...row, label: weekdayLabels[row.weekday] }))} label={(row) => row.label} value={(row) => row.games} limit={7} /></section>
    </div>

    <section className="metrics-section metrics-wide"><div className="metrics-section-heading"><div><span className="eyebrow">Catalogue</span><h3>Performance des jeux</h3></div><small><CompactNumber value={data.games.filter((game) => game.games > 0).length} /> jeu(x) joué(s) sur la période</small></div><div className="metrics-table-scroll"><table className="score-table metrics-table"><thead><tr><th>Jeu</th><th>Parties</th><th>Joueurs uniques</th><th>Places moyennes</th><th>Part IA</th><th>Pot cumulé</th><th>Pot moyen</th></tr></thead><tbody>{data.games.map((game) => <tr key={game.id}><td><strong>{game.name}</strong><small>{game.type === "cards" ? "Cartes" : "Dés"}</small></td><td><CompactNumber value={game.games} /></td><td><CompactNumber value={game.uniquePlayers} /></td><td>{formatNumber(game.averagePlayers)}</td><td>{formatPercent(game.botRate)}</td><td><CompactNumber value={game.pot} label="Pot cumulé exact" /></td><td><CompactNumber value={game.averagePot} label="Pot moyen exact" /></td></tr>)}</tbody></table></div></section>

    <div className="metrics-three-columns">
      <Ranking title="Joueurs les plus actifs" rows={data.users.topActive} value={(row) => row.games} suffix=" parties" />
      <Ranking title="Plus grands gagnants" rows={data.users.topWinners} value={(row) => row.wins} suffix=" victoires" />
      <Ranking title="Plus gros soldes" rows={data.users.topWealth} value={(row) => <CompactNumber value={row.tokens} label="Solde exact" />} />
    </div>

    <div className="metrics-two-columns">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Transactions</span><h3>Événements économiques</h3></div><small>Classés par volume</small></div><HorizontalBars rows={economy.reasons} label={(row) => transactionLabel(row.reason)} value={(row) => row.volume} format={formatCompactNumber} /></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Répartition</span><h3>Distribution des soldes</h3></div><small>{data.users.zeroBalance} compte(s) à zéro</small></div><HorizontalBars rows={data.users.balanceBuckets} label={(row) => row.label} value={(row) => row.count} format={(value) => `${value} joueur(s)`} limit={6} /></section>
    </div>

    <div className="metrics-three-columns metrics-detail-cards">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Bonus</span><h3>Bonus quotidiens</h3></div></div><div className="metrics-big-number"><strong><CompactNumber value={economy.bonuses.claims} /></strong><span>réclamation(s)</span></div><dl><div><dt>Jetons distribués</dt><dd><CompactNumber value={economy.bonuses.amount} label="Total exact distribué" /></dd></div><div><dt>Bonus moyen</dt><dd><CompactNumber value={economy.bonuses.average} label="Bonus moyen exact" /></dd></div><div><dt>Multiplicateur moyen</dt><dd>×{formatNumber(economy.bonuses.averageMultiplier)}</dd></div></dl></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Succès</span><h3>Progression globale</h3></div></div><div className="metrics-donut" style={{ "--ratio": `${achievements.completionRate * 360}deg` }}><strong>{formatPercent(achievements.completionRate)}</strong><span>complétés</span></div><dl><div><dt>Moyenne par joueur</dt><dd>{formatNumber(achievements.averagePerUser)}</dd></div><div><dt>Jamais obtenus</dt><dd>{achievements.neverUnlocked}</dd></div><div><dt>Secrets obtenus</dt><dd>{achievements.secretUnlocked}</dd></div></dl></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Boutique</span><h3>Adoption cosmétique</h3></div></div><div className="metrics-big-number"><strong>{formatNumber(shop.averageInventory)}</strong><span>objets par joueur</span></div><dl><div><dt>Objets intégrés</dt><dd>{shop.catalogItems - shop.customItems}</dd></div><div><dt>Objets personnalisés</dt><dd>{shop.customItems}</dd></div><div><dt>Achats sur la période</dt><dd>{shop.purchases}</dd></div></dl></section>
    </div>

    <div className="metrics-two-columns">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Collection</span><h3>Objets les plus possédés</h3></div></div><div className="metrics-item-list">{shop.ownership.slice(0, 12).map((item) => <article key={item.id}><span><strong>{item.name}</strong><small>{shopTypeLabel(item.type)} · {item.category}</small></span><b>{item.owners} propriétaire(s)</b><em>{item.equipped} équipé(s)</em></article>)}</div></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">Rareté</span><h3>Succès les plus rares</h3></div></div><div className="metrics-item-list">{achievements.rare.map((entry) => <article key={entry.id}><span><strong>{entry.title}</strong><small>{entry.group}{entry.secret ? " · Secret" : ""}</small></span><b>{entry.unlocked} joueur(s)</b><em>{formatPercent(entry.rate)}</em></article>)}</div></section>
    </div>
  </div>;
}
