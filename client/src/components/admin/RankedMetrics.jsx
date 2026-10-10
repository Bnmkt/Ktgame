import { useEffect, useRef, useState } from "react";
import { Activity, ChartNoAxesColumn, Gauge, RefreshCw, Swords, Trophy, Users, WifiOff } from "lucide-react";
import { api } from "../../api.js";
import { formatExactNumber } from "../../utils/presentation.jsx";

const number = (value, digits = 1) => value == null ? "—" : formatExactNumber(value, digits);
const percent = (value) => value == null ? "—" : `${number(value)} %`;
const colors = ["#79caba", "#81b8e9", "#e9bf61", "#ef8594"];
const dateLabel = (value) => value.length === 7 ? new Intl.DateTimeFormat("fr-BE", { month: "short", year: "numeric" }).format(new Date(`${value}-01T12:00:00Z`)) : new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00Z`));

function Stat({ icon: Icon, label, value, detail }) {
  return <article className="metrics-kpi"><span><Icon size={19}/></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function Distribution({ rows, onSelect }) {
  return <div className="ranked-metrics-distribution"><div className="ranked-metrics-scale"><span>0 %</span><span>50 %</span><span>100 %</span></div><div className="ranked-metrics-distribution-rows">{rows.map((row, index) => <div className="ranked-metrics-bin" key={row.id}>
    {onSelect ? <button type="button" onClick={() => onSelect(row.id)} title={`Divisions ${row.name}`}>{row.name}</button> : <span>{row.name}{row.division ? ` ${row.division}` : ""}</span>}
    <i title={`${row.count} profil(s) · ${percent(row.percent)}`}><b style={{ width: `${row.percent}%`, background: colors[index % colors.length] }}/></i><strong>{number(row.count, 0)}<small>{percent(row.percent)}</small></strong>
  </div>)}</div></div>;
}

function ActivityChart({ rows, mode }) {
  const container = useRef(null), [width, setWidth] = useState(900);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const series = mode === "results" ? [{ key: "wins", name: "Victoires", color: colors[0] }, { key: "losses", name: "Défaites", color: colors[3] }, { key: "draws", name: "Égalités", color: colors[2] }] : [{ key: "matches", name: "Parties", color: colors[2] }, { key: "activePlayers", name: "Joueurs distincts", color: colors[1] }];
  const height = 240, left = 48, right = 20, top = 18, bottom = 30;
  const highest = Math.max(1, ...rows.flatMap((row) => series.map((s) => row[s.key] ?? 0)));
  const step = Math.max(1, Math.ceil(highest/4)), max = Math.ceil(highest/step)*step;
  const x = (index) => left + index * (width-left-right) / Math.max(1, rows.length-1);
  const y = (value) => height-bottom-(value ?? 0)*(height-top-bottom)/max;
  return <div className="ranked-metrics-activity" ref={container}><div className="metrics-chart-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }}/>{s.name}</span>)}</div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={mode === "results" ? "Résultats classés au fil du temps" : "Activité classée au fil du temps"}>
    {Array.from({ length: max/step+1 }, (_, index) => index*step).map((value) => <g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)}/><text x={left-8} y={y(value)+4} textAnchor="end">{number(value, 0)}</text></g>)}
    {series.map((s) => <g key={s.key}><polyline points={rows.map((row, index) => `${x(index)},${y(row[s.key])}`).join(" ")} stroke={s.color} strokeDasharray={s.key === "losses" ? "6 4" : undefined}/>{rows.length <= 100 && rows.map((row, index) => <circle key={row.date} cx={x(index)} cy={y(row[s.key])} r={2.5} fill={s.color}><title>{dateLabel(row.date)} · {s.name} : {row[s.key] ?? 0}</title></circle>)}</g>)}
    {rows.length > 0 && <><text x={left} y={height-5}>{dateLabel(rows[0].date)}</text><text x={width-right} y={height-5} textAnchor="end">{dateLabel(rows.at(-1).date)}</text></>}
  </svg></div>;
}

export function RankedMetrics({ gameId, onGameChange, games }) {
  const [period, setPeriod] = useState("30"), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0), [divisionRank, setDivisionRank] = useState(""), [chart, setChart] = useState("activity");
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setData(null); setError("");
    api(`/api/admin/ranked/metrics?${new URLSearchParams({ gameId, period })}`, { signal: controller.signal, background: true })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [gameId, period, revision]);
  const selectedRank = data?.ranks.some((row) => row.id === divisionRank) ? divisionRank : "";
  const divisionRows = data?.divisions.filter((row) => !selectedRank || row.rankId === selectedRank) ?? [];
  const live = data?.live.reduce((total, row) => ({ queued: total.queued+row.queued, preparing: total.preparing+row.preparing, playing: total.playing+row.playing }), { queued: 0, preparing: 0, playing: 0 });
  return <section className="ranked-metrics-workspace" aria-busy={loading}>
    <header className="ranked-metrics-heading"><div><h3><ChartNoAxesColumn size={20}/>Métriques du classé</h3>{data && <small>Relevé le {new Date(data.generatedAt).toLocaleString("fr-BE", { timeZone: data.timeZone })}</small>}</div><button type="button" className="secondary" title="Actualiser les métriques" aria-label="Actualiser les métriques" disabled={loading} onClick={() => setRevision((n) => n+1)}><RefreshCw size={18} className={loading ? "spinning" : ""}/></button></header>
    <div className="ranked-metrics-filters"><label>Jeu<select aria-label="Jeu" value={gameId} onChange={(event) => onGameChange(event.target.value)}><option value="">Tous les jeux classés</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label><label>Période<select aria-label="Période" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="7">7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option><option value="365">Un an</option><option value="season">Saison en cours</option><option value="all">Tout l’historique</option></select></label></div>
    {error && <p className="error" role="alert">{error}</p>}{loading && <p role="status">Calcul des métriques…</p>}
    {data && <>
      <section className="ranked-metrics-section"><h4>Classement actuel</h4><div className="metrics-kpi-grid ranked-metrics-kpis">
        <Stat icon={Users} label="Joueurs classés" value={number(data.population.players, 0)} detail={`${number(data.population.profiles, 0)} profils joueur / jeu`}/>
        <Stat icon={Gauge} label="Elo moyen" value={number(data.population.averageElo)} detail="Un profil par joueur et par jeu joué"/>
        <Stat icon={ChartNoAxesColumn} label="Elo médian" value={number(data.population.medianElo)} detail={`Minimum ${number(data.population.minimumElo)} · maximum ${number(data.population.maximumElo)}`}/>
      </div><p className="ranked-metrics-note">Comptes actifs ayant terminé leurs placements. La répartition et l’Elo correspondent au classement actuel, indépendamment de la période.</p></section>
      <div className="ranked-metrics-columns"><section className="ranked-metrics-section"><div className="ranked-metrics-section-heading"><h4>Répartition des rangs</h4><small>{number(data.population.profiles, 0)} profils</small></div><Distribution rows={data.ranks} onSelect={setDivisionRank}/></section>
        <section className="ranked-metrics-section"><div className="ranked-metrics-section-heading"><h4>Répartition des divisions</h4><select aria-label="Rang des divisions" value={data.ranks.some((row) => row.id === divisionRank) ? divisionRank : ""} onChange={(event) => setDivisionRank(event.target.value)}><option value="">Tous les rangs</option>{data.ranks.map((rank) => <option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></div><Distribution rows={divisionRows}/></section></div>
      <section className="ranked-metrics-section"><div className="ranked-metrics-section-heading"><h4>Résultats sur la période</h4><small>{data.period.start ? `${dateLabel(data.period.start)} → ` : "Depuis le début · "}{dateLabel(data.period.end)}</small></div><div className="metrics-kpi-grid ranked-metrics-kpis">
        <Stat icon={Swords} label="Parties terminées" value={number(data.summary.matches, 0)} detail={`${number(data.summary.activePlayers, 0)} joueurs distincts · ${number(data.summary.averagePlayers)} joueurs / partie`}/>
        <Stat icon={Trophy} label="Taux de victoire" value={percent(data.summary.winRate)} detail={`${number(data.summary.wins, 0)} victoires · ${number(data.summary.losses, 0)} défaites · ${number(data.summary.draws, 0)} égalités`}/>
        <Stat icon={Activity} label="Ratio défaites / victoires" value={number(data.summary.lossWinRatio, 2)} detail="Participations individuelles, hors égalités"/>
        <Stat icon={WifiOff} label="Taux de forfait" value={percent(data.summary.forfeitRate)} detail={`${number(data.summary.abandons, 0)} abandons · ${number(data.summary.disconnects, 0)} déconnexions · ${number(data.summary.afk, 0)} inactivités`}/>
        <Stat icon={Gauge} label="Variation Elo moyenne" value={number(data.summary.averageVariation, 2)} detail="Amplitude des points gagnés ou perdus"/>
        <Stat icon={Users} label="Participations" value={number(data.summary.participations, 0)} detail={`${number(data.summary.cancelled, 0)} parties à attribution Elo annulée`}/>
      </div><p className="ranked-metrics-note">Une victoire correspond à la première place, partagée si nécessaire. Une égalité est comptée lorsque tous les participants terminent à égalité. Les parties sans attribution Elo sont exclues des résultats.</p></section>
      <section className="ranked-metrics-section"><div className="ranked-metrics-section-heading"><h4>{data.period.bucket === "month" ? "Évolution mensuelle" : "Évolution quotidienne"}</h4><div className="segmented-tabs" aria-label="Graphique classé">{[["activity", "Activité"], ["results", "Résultats"]].map(([id, label]) => <button key={id} type="button" className={chart === id ? "active" : ""} aria-pressed={chart === id} onClick={() => setChart(id)}>{label}</button>)}</div></div><ActivityChart rows={data.series} mode={chart}/>{!data.summary.matches && <p className="empty-state">Aucune partie classée comptabilisée sur cette période.</p>}</section>
      <section className="ranked-metrics-section"><h4>Détail par jeu</h4><div className="metrics-table-scroll"><table className="score-table ranked-metrics-table"><thead><tr><th>Jeu</th><th>Profils</th><th>Elo moyen</th><th>Elo médian</th><th>Parties</th><th>Victoires</th><th>Défaites</th><th>Égalités</th><th>Victoire %</th><th>Forfait %</th><th>Variation Elo</th></tr></thead><tbody>{data.games.map((game) => <tr key={game.gameId}><td><strong>{game.name}</strong></td><td>{number(game.population.profiles, 0)}</td><td>{number(game.population.averageElo)}</td><td>{number(game.population.medianElo)}</td><td>{number(game.results.matches, 0)}</td><td>{number(game.results.wins, 0)}</td><td>{number(game.results.losses, 0)}</td><td>{number(game.results.draws, 0)}</td><td>{percent(game.results.winRate)}</td><td>{percent(game.results.forfeitRate)}</td><td>{number(game.results.averageVariation, 2)}</td></tr>)}</tbody></table></div></section>
      <section className="ranked-metrics-section"><h4>En ce moment</h4><p className="ranked-metrics-live">{live.queued} joueurs en recherche · {live.preparing} propositions en préparation · {live.playing} parties en cours</p><div className="metrics-table-scroll"><table className="score-table ranked-metrics-table"><thead><tr><th>Jeu</th><th>Joueurs en recherche</th><th>Propositions</th><th>Parties en cours</th></tr></thead><tbody>{data.live.map((row) => <tr key={row.gameId}><td>{row.name}</td><td>{row.queued}</td><td>{row.preparing}</td><td>{row.playing}</td></tr>)}</tbody></table></div></section>
    </>}
  </section>;
}
