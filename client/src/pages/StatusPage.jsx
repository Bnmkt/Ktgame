import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Database, Gamepad2, Globe2, Mail, Plus, Radio, RefreshCw, Server, Wrench, XCircle } from "lucide-react";
import { api } from "../api.js";
import { Dialog } from "../components/common/Dialog.jsx";
import { MarkdownContent } from "../components/patchnotes/MarkdownContent.jsx";
import "./status.css";

const statusMeta = {
  operational: { label: "Opérationnel", Icon: CheckCircle2 },
  degraded: { label: "Service dégradé", Icon: AlertTriangle },
  maintenance: { label: "Maintenance", Icon: Wrench },
  outage: { label: "Indisponible", Icon: XCircle },
  unknown: { label: "État inconnu", Icon: Clock3 },
  no_data: { label: "Sans données", Icon: Clock3 }
};
const incidentTypeLabels = { maintenance: "Maintenance", warning: "Avertissement", outage: "Panne" };
const incidentStateLabels = { scheduled: "Planifié", in_progress: "En cours", completed: "Terminé" };
const componentIcons = { website: Globe2, api: Server, realtime: Radio, games: Gamepad2, database: Database, email: Mail };

function formatDate(value, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-BE", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

function formatUptime(value) {
  return value == null ? "En cours de mesure" : `${Number(value).toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} %`;
}

function StatusBadge({ status }) {
  const meta = statusMeta[status] ?? statusMeta.unknown;
  return <span className={`public-status-badge status-${status}`}><meta.Icon size={15} />{meta.label}</span>;
}

function StatusTimeline({ data }) {
  const scrollRef = useRef(null);
  const [selectedJustification, setSelectedJustification] = useState(null);
  const pointWidth = data.timeline.length > 3000 ? 5 : data.timeline.length > 1000 ? 7 : 10;
  const pointGap = 1;
  const width = Math.max(640, data.timeline.length * (pointWidth + pointGap) - pointGap);
  const timelineGridStyle = {
    columnGap: `${pointGap}px`,
    gridTemplateColumns: `repeat(${data.timeline.length}, ${pointWidth}px)`
  };
  const dayKey = (value) => new Date(value).toLocaleDateString("fr-BE", { day: "2-digit", month: "short" });
  useLayoutEffect(() => {
    const timeline = scrollRef.current;
    if (timeline) timeline.scrollLeft = timeline.scrollWidth - timeline.clientWidth;
  }, [data.rangeDays]);
  return <div className="status-timeline-matrix">
    <div className="status-timeline-labels"><div className="status-timeline-label-heading">Service</div>{data.components.map((component) => { const Icon = componentIcons[component.id] ?? Server; return <div className="status-timeline-label" key={component.id}><span><Icon size={19} /></span><div><h3>{component.name}</h3><StatusBadge status={component.status} /><strong>{formatUptime(component.uptime)}</strong></div></div>; })}</div>
    <div ref={scrollRef} className="status-timeline-scroll" tabIndex="0" aria-label={`Historique synchronisé sur ${data.rangeDays} jours`}>
      <div className="status-timeline-track" style={{ width }}>
        <div className="status-timeline-axis" style={timelineGridStyle}>{data.timeline.map((point, index) => { const previous = data.timeline[index - 1]; const label = !previous || new Date(previous.at).getDate() !== new Date(point.at).getDate() ? dayKey(point.at) : ""; return <span key={point.at}>{label}</span>; })}</div>
        {data.components.map((component) => <div className="status-timeline-row" style={timelineGridStyle} key={component.id}>{data.timeline.map((point) => {
          const value = point.components[component.id];
          const incidents = (value.incidentIds ?? []).map((id) => data.justifications?.find((incident) => incident.id === id)).filter(Boolean);
          const title = `${formatDate(point.at, true)} · ${statusMeta[value.status]?.label ?? value.status}${value.uptime == null ? "" : ` · ${formatUptime(value.uptime)}`}${value.latencyMs == null ? "" : ` · ${Math.round(value.latencyMs)} ms`}${incidents.length ? " · Justification disponible" : ""}`;
          return incidents.length
            ? <button type="button" key={point.at} className={`status-day status-${value.status} has-justification`} title={title} aria-label={`${component.name}, ${title}`} onClick={() => setSelectedJustification({ component, point, incidents })} />
            : <span key={point.at} className={`status-day status-${value.status}`} title={title} />;
        })}</div>)}
      </div>
    </div>
    {selectedJustification && <Dialog title="Justification du relevé" className="status-justification-dialog" onClose={() => setSelectedJustification(null)}>
      <div className="status-justification-context"><strong>{selectedJustification.component.name}</strong><span>Segment du {formatDate(selectedJustification.point.at, true)}</span></div>
      <div className="status-justification-list">{selectedJustification.incidents.map((incident) => <Incident key={incident.id} incident={incident} components={data.components} />)}</div>
    </Dialog>}
  </div>;
}

function LatencyChart({ components }) {
  const series = components.filter((component) => ["website", "api"].includes(component.id)).map((component, index) => ({ ...component, color: index ? "#f0bd48" : "#69d5aa" }));
  const values = series.flatMap((component) => component.days.map((day) => day.averageLatencyMs).filter((value) => value != null));
  if (!values.length) return <div className="status-chart-empty">Le graphique apparaîtra après les premiers relevés de latence.</div>;
  const width = 960, height = 250, left = 52, right = 18, top = 20, bottom = 34;
  const graphWidth = width - left - right, graphHeight = height - top - bottom;
  const max = Math.max(10, ...values);
  const x = (index, length) => left + (length <= 1 ? 0 : index * graphWidth / (length - 1));
  const y = (value) => top + graphHeight - Math.min(max, Math.max(0, value)) * graphHeight / max;
  const segments = (days) => {
    const rows = [];
    let current = [];
    days.forEach((day, index) => {
      if (day.averageLatencyMs == null) { if (current.length) rows.push(current); current = []; return; }
      current.push(`${x(index, days.length).toFixed(1)},${y(day.averageLatencyMs).toFixed(1)}`);
    });
    if (current.length) rows.push(current);
    return rows;
  };
  return <section className="status-latency-section">
    <header><div><span className="eyebrow">Performance sur {components[0]?.days.length ?? 0} jours</span><h2>Temps de réponse moyen</h2></div><div className="status-chart-legend">{series.map((entry) => <span key={entry.id}><i style={{ background: entry.color }} />{entry.name}</span>)}</div></header>
    <div className="status-latency-chart"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Temps de réponse moyen quotidien du site et de l’API">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + graphHeight * ratio} y2={top + graphHeight * ratio} /><text x={left - 8} y={top + graphHeight * ratio + 4}>{Math.round(max * (1 - ratio))} ms</text></g>)}
      {series.flatMap((entry) => segments(entry.days).map((points, index) => <polyline key={`${entry.id}-${index}`} points={points.join(" ")} style={{ stroke: entry.color }} />))}
      {series.flatMap((entry) => entry.days.map((day, index) => day.averageLatencyMs == null ? null : <circle key={`${entry.id}-${day.date}`} cx={x(index, entry.days.length)} cy={y(day.averageLatencyMs)} r="2.4" style={{ fill: entry.color }}><title>{entry.name} · {formatDate(`${day.date}T12:00:00Z`)} · {Math.round(day.averageLatencyMs)} ms</title></circle>))}
      <text className="status-chart-date" x={left} y={height - 7}>{formatDate(`${series[0].days[0].date}T12:00:00Z`)}</text><text className="status-chart-date" textAnchor="end" x={width - right} y={height - 7}>{formatDate(`${series[0].days.at(-1).date}T12:00:00Z`)}</text>
    </svg></div>
  </section>;
}

function Incident({ incident, components }) {
  const names = incident.components.map((id) => components.find((component) => component.id === id)?.name ?? id).join(" · ");
  const affected = incident.scheduledAt ? `Relevé concerné : ${formatDate(incident.scheduledAt, true)}` : "";
  return <article className={`public-incident incident-${incident.type}`}>
    <header><div><span>{incidentTypeLabels[incident.type]} · {incidentStateLabels[incident.state]}</span><h3>{incident.title}</h3></div><time>{formatDate(incident.updatedAt, true)}</time></header>
    <MarkdownContent className="status-incident-markdown">{incident.message}</MarkdownContent><small>{names}{affected ? ` · ${affected}` : ""}</small>
    {incident.updates?.length > 1 && <ol>{[...incident.updates].reverse().map((update) => <li key={update.id}><time>{formatDate(update.createdAt, true)}</time><div className="status-incident-update"><b>{incidentStateLabels[update.state]}</b><MarkdownContent>{update.message}</MarkdownContent></div></li>)}</ol>}
  </article>;
}

export function StatusPage({ siteName, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(async ({ quiet = false, days = 7 } = {}) => {
    if (!quiet) setLoading(true);
    try { setData(await api(`/api/status?days=${days}`)); setError(""); }
    catch { setError("Le serveur de statut ne répond pas actuellement."); }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => { load({ days: 7 }); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") load({ quiet: true, days: expanded ? data?.configuredRangeDays ?? 7 : 7 }); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load, expanded, data?.configuredRangeDays]);

  const globalStatus = error ? "outage" : data?.status ?? "unknown";
  const globalMeta = statusMeta[globalStatus] ?? statusMeta.unknown;
  return <main className="status-page">
    <header className="status-site-header"><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={17} />Retour au casino</button><div><span>{siteName}</span><strong>Service Status</strong></div><button type="button" className="secondary icon-toggle" title="Actualiser" aria-label="Actualiser l’état des services" onClick={() => load({ days: expanded ? data?.configuredRangeDays ?? 7 : 7 })} disabled={loading}><RefreshCw size={18} className={loading ? "spinning" : ""} /></button></header>
    <section className={`status-summary status-${globalStatus}`} aria-live="polite"><globalMeta.Icon size={28} /><div><h1>{error ? "Interruption du service de statut" : globalStatus === "operational" ? "Tous les services sont opérationnels" : globalStatus === "maintenance" ? "Une maintenance est en cours" : globalStatus === "degraded" ? "Certains services sont ralentis" : globalStatus === "outage" ? "Un service est indisponible" : "Collecte en cours"}</h1><p>{error || `Dernière consolidation ${data ? formatDate(data.generatedAt, true) : "en cours"}.`}</p></div></section>

    {error && <section className="status-offline-help"><p>L’interface publique reste accessible, mais l’API ne peut pas fournir son état ni son historique.</p><button type="button" onClick={() => load({ days: expanded ? data?.configuredRangeDays ?? 7 : 7 })}>Réessayer</button></section>}
    {data && <>
      {!!data.incidents.length && <section className="status-incidents"><div className="status-section-heading"><div><span className="eyebrow">Informations en cours</span><h2>Incidents et maintenances</h2></div></div>{data.incidents.map((incident) => <Incident key={incident.id} incident={incident} components={data.components} />)}</section>}
      <section className="status-components"><div className="status-section-heading"><div><span className="eyebrow">Disponibilité publique</span><h2>Services</h2></div><div className="status-range-actions"><p>{data.rangeDays} jours · segments de {data.displayIntervalMinutes} min</p>{!expanded && data.configuredRangeDays > 7 && <button type="button" className="secondary" onClick={async () => { setExpanded(true); await load({ days: data.configuredRangeDays }); }} disabled={loading}><Plus size={16} />Afficher {data.configuredRangeDays} jours</button>}</div></div>
        <StatusTimeline data={data} />
        <div className="status-history-legend"><span><i className="status-operational" />Opérationnel</span><span><i className="status-degraded" />Dégradé</span><span><i className="status-outage" />Indisponible</span><span><i className="status-no_data" />Sans données</span></div>
      </section>
      <LatencyChart components={data.components} />
      <section className="status-history"><div className="status-section-heading"><div><span className="eyebrow">Suivi</span><h2>Historique des incidents</h2></div><p>Collecte active depuis {formatDate(data.monitoringSince, true)}</p></div>{data.history.length ? data.history.map((incident) => <Incident key={incident.id} incident={incident} components={data.components} />) : <p className="status-empty">Aucun incident terminé depuis le début de la collecte.</p>}</section>
    </>}
  </main>;
}
