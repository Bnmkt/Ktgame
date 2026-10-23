import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useCallback, useEffect, useState } from "react";
import { Activity, Cpu, Database, Gauge, HardDrive, MemoryStick, Network, Radio, RefreshCw, Server, Timer, Users, ListOrdered, CircleAlert } from "lucide-react";
import { api } from "../../api.js";
import { CompactNumber, formatExactNumber } from "../../utils/presentation.jsx";
import { HealthLogs } from "./HealthLogs.jsx";
import { AdminMetrics } from "./AdminMetrics.jsx";
import { PublicStatusAdmin } from "./PublicStatusAdmin.jsx";
import "./server-execution.css";

const healthPalette = ["#f0bd48", "#69d5aa", "#7dc7ff", "#e36a78"];

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes.toLocaleString("fr-BE")} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let amount = bytes / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toLocaleString("fr-BE", { maximumFractionDigits: amount >= 100 ? 0 : 1 })} ${units[unit]}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total % 86400 / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  return `${days ? `${days} j ` : ""}${String(hours).padStart(2, "0")} h ${String(minutes).padStart(2, "0")} min`;
}

function percent(value) {
  return `${Number(value || 0).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} %`;
}

function HealthKpi({ icon: Icon, label, value, detail, level = "normal" }) {
  const { t: localeText } = useLocale();
  return <article className={`health-kpi health-${level}`}><span><Icon size={20} /></span><div><small>{localeText(label)}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

export function HealthChart({ title, rows, series, percentage = false, formatValue = (value) => Number(value || 0).toLocaleString("fr-BE", { maximumFractionDigits: 1 }) }) {
  const { t: localeText } = useLocale();
  const width = 900;
  const height = 230;
  const padding = { left: 50, right: 18, top: 18, bottom: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = percentage ? 100 : Math.max(1, ...rows.flatMap((row) => series.map((entry) => Number(entry.value(row)) || 0)));
  const segments = (entry) => {
    const lines = [[]];
    rows.forEach((row, index) => {
    const value = entry.value(row);
    if (entry.skipMissing && value == null) { if (lines.at(-1).length) lines.push([]); return; }
    const x = padding.left + (rows.length <= 1 ? 0 : index * chartWidth / (rows.length - 1));
    const y = padding.top + chartHeight - Math.min(max, Math.max(0, Number(value) || 0)) * chartHeight / max;
    lines.at(-1).push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });
    return lines.filter((line) => line.length).map((line) => line.join(" "));
  };
  const firstTime = rows[0]?.at ? new Date(rows[0].at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) : "";
  const lastTime = rows.at(-1)?.at ? new Date(rows.at(-1).at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  return <section className="metrics-section health-chart-card"><div className="metrics-section-heading"><div><span className="eyebrow">{localeText("Historique temps réel")}</span><h3>{title}</h3></div><small>{localeText("Maximum :") + " "}{formatValue(max)}</small></div><div className="health-chart-legend">{series.map((entry, index) => <span key={entry.label}><i style={{ background: entry.color ?? healthPalette[index] }} />{localeText(entry.label)}<b>{formatValue(entry.value(rows.at(-1) ?? {}))}</b></span>)}</div><div className="health-chart"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={title}>{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * ratio} y2={padding.top + chartHeight * ratio} /><text x={padding.left - 8} y={padding.top + chartHeight * ratio + 4}>{formatValue(max * (1 - ratio))}</text></g>)}{series.flatMap((entry, index) => segments(entry).map((points, segment) => <polyline key={`${entry.label}-${segment}`} points={points} style={{ stroke: entry.color ?? healthPalette[index] }} />))}<text className="health-chart-time" x={padding.left} y={height - 6}>{firstTime}</text><text className="health-chart-time" textAnchor="end" x={width - padding.right} y={height - 6}>{lastTime}</text></svg></div></section>;
}

function DetailList({ rows }) {
  const { t: localeText } = useLocale();
  return <dl className="health-detail-list">{rows.map(([label, value, title]) => <div key={label}><dt>{localeText(label)}</dt><dd title={title ?? String(value)}>{value}</dd></div>)}</dl>;
}

export function SystemHealth({ system }) {
  const { t } = useLocale();
  const disk = system.disk;
  const rows = [["Hôte",system.hostname],["Plateforme",`${system.platform} ${system.release}`],["Architecture",system.architecture],["Processeur",system.cpuModel],["Cœurs logiques",system.cpuCount],["RAM utilisée",formatBytes(system.totalMemory-system.freeMemory)],["RAM totale",formatBytes(system.totalMemory)],["RAM disponible",formatBytes(system.freeMemory)]];
  if (disk) {
    rows.push(["Disque utilisé",formatBytes(disk.usedBytes)],["Capacité du disque",formatBytes(disk.totalBytes)],["Espace disponible",formatBytes(disk.availableBytes)]);
    if (disk.reservedBytes) rows.push(["Espace réservé système",formatBytes(disk.reservedBytes)]);
    if (disk.unavailable) rows.push(["Mesure disque",t("Dernier relevé conservé")]);
  } else rows.push(["Mesure disque",t("Indisponible")]);
  rows.push(["Uptime",formatDuration(system.uptimeSeconds)]);
  return <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">{t("Machine")}</span><h3><Cpu size={19}/>{" " + t("Système")}</h3></div></div><DetailList rows={rows}/></section>;
}

function milliseconds(value) {
  return value == null ? "\u2014" : `${Number(value).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} ms`;
}

function ProcessHealth({ data }) {
  const { t: localeText } = useLocale();
  if (!data.processes) return null;
  const states = { healthy: "Opérationnel", warning: "À surveiller", starting: "Démarrage", idle: "Au repos", disabled: "Désactivé", stopped: "Arrêté" };
  const processes = [["site", data.processes.site], ["accounts", data.processes.accounts], ...(data.processes.games ?? []).map((row) => [row.workerId, { ...row, memoryRss: row.rss }])].filter(([, row]) => row);
  return <section className="metrics-section health-processes" aria-label={localeText("Processus du casino")}>
    <div className="metrics-section-heading"><h3><Server size={19} />{" " + localeText("Processus du casino")}</h3><small>{formatBytes(data.processTotals?.memoryRss)}{" " + localeText("au total")}</small></div>
    <div className="metrics-table-scroll"><table className="score-table"><thead><tr><th>{localeText("Processus")}</th><th>{localeText("État")}</th><th>{localeText("CPU")}</th><th>{localeText("Mémoire")}</th><th>{localeText("Boucle P95")}</th><th>{localeText("En vol")}</th><th>{localeText("En attente")}</th></tr></thead><tbody>
      {processes.map(([key, row]) => <tr key={key}><th scope="row">{key === "site" ? data.gameWorkers?.enabled ? localeText("Gateway : site et chat") : localeText("Site, tables et chat") : key === "accounts" ? localeText("Comptes") : localeText("Jeux · {value0}", { value0: key })}<small>{row.pid ? localeText("PID {value0}", { value0: row.pid }) : ""}</small></th><td><span className={`status-badge ${row.status === "healthy" || row.status === "idle" ? "status-active" : "status-inactive"}`}>{states[row.status] ?? row.status}</span></td><td>{row.cpuPercent == null ? "\u2014" : percent(row.cpuPercent)}</td><td>{row.memoryRss == null ? "\u2014" : formatBytes(row.memoryRss)}</td><td>{milliseconds(row.eventLoopP95)}</td><td>{row.inFlight ?? row.busy ?? "\u2014"}{row.taskCapacity ? ` / ${row.taskCapacity}` : ""}</td><td>{row.queued ?? "\u2014"}{row.queueCapacity ? ` / ${row.queueCapacity}` : ""}</td></tr>)}
    </tbody></table></div>
    {data.gameWorkers?.enabled && <div className="metrics-table-scroll"><table className="score-table"><thead><tr><th>{localeText("Worker")}</th><th>{localeText("Rooms")}</th><th>{localeText("IPC moyen")}</th><th>{localeText("IPC P95")}</th><th>{localeText("Traitement moyen")}</th><th>{localeText("Traitement P95")}</th><th>{localeText("Erreurs")}</th><th>{localeText("Expirations")}</th></tr></thead><tbody>{data.gameWorkers.workers.map((row) => <tr key={row.workerId}><th scope="row">{row.workerId}</th><td>{row.assignedRooms}</td><td>{milliseconds(row.ipc?.averageMs)}</td><td>{milliseconds(row.ipc?.p95Ms)}</td><td>{milliseconds(row.actions?.averageMs)}</td><td>{milliseconds(row.actions?.p95Ms)}</td><td>{row.errors}</td><td>{row.timeouts}</td></tr>)}</tbody></table></div>}
  </section>;
}

function ExecutionHealth({ data, reportError }) {
  const { t: localeText } = useLocale();
  const [selectedService, setSelectedService] = useState("history");
  const [retainedDays, setRetainedDays] = useState(1);
  const [retained, setRetained] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (retainedDays === 1) { setRetained(data.executionHistory); return; }
    setRetained(null);
    api(`/api/admin/execution-history?days=${retainedDays}`).then((result) => { if (!cancelled) setRetained(result); }).catch((error) => { if (!cancelled) reportError?.(error); });
    return () => { cancelled = true; };
  }, [retainedDays, data.executionHistory, reportError]);
  const work = data.workers?.password;
  if (!work || !data.caches) return <div className="empty-state">{localeText("Mesures des traitements indisponibles.")}</div>;
  const cacheNames = { configuration: "Configurations", statistics: "Statistiques des joueurs", achievements: "Progression des succès", memberStats: "Statistiques des cartes de profil" };
  const rows = data.history ?? [];
  return <section className="health-execution" aria-label={localeText("Workers et caches")}>
    <div className="metrics-section-heading"><h3>{work.sharedProcess ? localeText("Traitements des comptes") : localeText("Authentification")}</h3><span className={`status-badge ${work.status === "healthy" ? "status-active" : "status-inactive"}`}>{work.status === "stopped" ? localeText("Arrêté") : work.status === "warning" ? localeText("À surveiller") : work.started ? localeText("Opérationnel") : localeText("Au repos")}</span></div>
    {work.status === "warning" && <div className="health-execution-alert" role="status"><CircleAlert size={18} /><div><strong>{localeText("Authentification à surveiller")}</strong><span>{work.queued}{" " + localeText("tâche(s) en attente · plus ancienne :") + " "}{milliseconds(work.oldestWaitMs)}{work.lastIssueAt ? localeText(" · dernière anomalie : {value0}", { value0: new Date(work.lastIssueAt).toLocaleString("fr-BE") }) : ""}</span></div></div>}
    <div className="metrics-kpi-grid health-kpi-grid">
      <HealthKpi icon={Cpu} label={work.sharedProcess ? localeText("Processus Comptes") : localeText("Workers démarrés")} value={`${work.started} / ${work.capacity}`} detail={`${work.busy} occupé(s) · ${work.idle} disponible(s)`} level={work.status === "warning" ? "warning" : "good"} />
      <HealthKpi icon={ListOrdered} label={localeText("File d’attente")} value={`${work.queued} / ${work.queueCapacity}`} detail={`Plus ancienne : ${milliseconds(work.oldestWaitMs)}`} level={work.queued >= work.queueCapacity * .8 ? "danger" : work.queued ? "warning" : "good"} />
      <HealthKpi icon={Timer} label={work.sharedProcess ? localeText("Attente P95 · authentification") : localeText("Attente P95")} value={milliseconds(work.wait.p95Ms)} detail={work.sharedProcess ? "Maximum des P95 par opération · 60 s" : `${work.wait.recentSamples} mesures · ${work.timingWindowSeconds} s · max. ${work.timingSampleLimit}`} level={work.wait.p95Ms > 1000 ? "warning" : "normal"} />
      <HealthKpi icon={Activity} label={work.sharedProcess ? localeText("Traitement P95 · authentification") : localeText("Traitement P95")} value={milliseconds(work.processing.p95Ms)} detail={work.sharedProcess ? "Maximum des P95 par opération · 60 s" : `${work.processing.recentSamples} mesures · ${work.timingWindowSeconds} s · max. ${work.timingSampleLimit}`} />
    </div>
    <div className="metrics-two-columns health-execution-details">
      <section className="metrics-section"><div className="metrics-section-heading"><h3><Cpu size={19} /> {work.sharedProcess ? localeText("Mots de passe") : localeText("Workers de mots de passe")}</h3><small>{localeText("Depuis le démarrage")}</small></div><DetailList rows={[
        ["Tâches admises", formatExactNumber(work.submitted)], ["Terminées", formatExactNumber(work.completed)],
        ["Échecs de traitement", formatExactNumber(work.failed)], ["Refus pour saturation", formatExactNumber(work.rejected)],
        ["Erreurs de workers", formatExactNumber(work.workerErrors)], ["Arrêts inattendus", formatExactNumber(work.unexpectedExits)],
        ["Tâches annulées", formatExactNumber(work.cancelled)], ["Attente moyenne / maximum", `${milliseconds(work.wait.averageMs)} / ${milliseconds(work.wait.maxMs)}`],
        ["Traitement moyen / maximum", `${milliseconds(work.processing.averageMs)} / ${milliseconds(work.processing.maxMs)}`],
        ["Dernière anomalie", work.lastIssueAt ? new Date(work.lastIssueAt).toLocaleString("fr-BE") : "Aucune"]
      ]} /></section>
      <section className="metrics-section"><div className="metrics-section-heading"><h3><Database size={19} />{" " + localeText("Caches applicatifs")}</h3><small>{localeText("Depuis leur initialisation")}</small></div><div className="metrics-table-scroll"><table className="score-table health-cache-table"><thead><tr><th>{localeText("Cache")}</th><th>{localeText("Entrées")}</th><th>{localeText("Réutilisation")}</th><th>{localeText("Lectures réutilisées")}</th><th>{localeText("Recalculs")}</th><th>{localeText("Invalidations")}</th><th>{localeText("Évictions")}</th></tr></thead><tbody>{Object.entries(data.caches).map(([key, cache]) => <tr key={key}><th scope="row">{cacheNames[key] ?? key}</th><td>{cache.entries}{cache.capacity != null ? ` / ${cache.capacity}` : ""}</td><td>{cache.hitRate == null ? "\u2014" : percent(cache.hitRate * 100)}</td><td>{formatExactNumber(cache.hits)}</td><td>{formatExactNumber(cache.misses)}</td><td>{formatExactNumber(cache.invalidations)}</td><td>{formatExactNumber(cache.evictions)}</td></tr>)}</tbody></table></div></section>
    </div>
    <div className="health-chart-grid">
      <HealthChart title={localeText("Occupation des workers et file")} rows={rows} series={[{ label:"Occupés", value:(row)=>row.workerBusy, color:healthPalette[2] }, { label:"En attente", value:(row)=>row.workerQueued, color:healthPalette[0] }]} />
      <HealthChart title={localeText("Délais d’authentification")} rows={rows} formatValue={milliseconds} series={[{ label:"Attente P95 (60 s)", value:(row)=>row.workerWaitP95, color:healthPalette[0], skipMissing:true }, { label:"Traitement P95 (60 s)", value:(row)=>row.workerProcessingP95, color:healthPalette[1], skipMissing:true }, { label:"Plus ancienne attente", value:(row)=>row.workerOldestWaitMs, color:healthPalette[3] }]} />
    </div>
    {data.services && <>
      <section className="metrics-section"><div className="metrics-section-heading"><h3><Server size={19} />{" " + localeText("Services applicatifs")}</h3><small>{localeText("Depuis le démarrage · P95 sur 60 s")}</small></div>
        {data.workers.reading?.status === "warning" && <div className="health-execution-alert" role="status"><CircleAlert size={18} /><span>{localeText("Lectures à surveiller ·") + " "}{data.workers.reading.queued}{" " + localeText("en attente ·") + " "}{milliseconds(data.workers.reading.oldestWaitMs)}</span></div>}
        <DetailList rows={[[work.sharedProcess ? "Processus Comptes partagé" : "Workers de lecture", `${data.workers.reading?.started ?? 0} / ${data.workers.reading?.capacity ?? 0}`], ["File partagée", `${data.workers.reading?.queued ?? 0} / ${data.workers.reading?.queueCapacity ?? 0}`]]} />
        <div className="metrics-table-scroll"><table className="score-table health-cache-table health-service-table"><thead><tr><th>{localeText("Service")}</th><th>{localeText("Exécution")}</th><th>{localeText("Terminées")}</th><th>{localeText("Échecs")}</th><th>{localeText("En attente")}</th><th>{localeText("Refusées")}</th><th>{localeText("Annulées / expirées")}</th><th>{localeText("Attente P95")}</th><th>{localeText("Traitement P95")}</th></tr></thead><tbody>{Object.entries(data.services).map(([key, service]) => <tr key={key}><th scope="row">{service.name}</th><td>{service.mode === "game-process" ? localeText("Gateway + Game Workers") : service.mode === "accounts-process" ? localeText("Processus Comptes") : service.mode === "read-worker" ? localeText("Worker partagé") : localeText("Processus principal")}</td><td>{formatExactNumber(service.completed)}</td><td>{formatExactNumber(service.failed)}</td><td>{service.queued}</td><td>{service.rejected}</td><td>{service.cancelled} / {service.timedOut}</td><td>{milliseconds(service.wait?.p95Ms)}</td><td>{milliseconds(service.processing.p95Ms)}</td></tr>)}</tbody></table></div>
      </section>
      <section className="metrics-section"><div className="metrics-section-heading"><h3>{localeText("Suivi par service")}</h3><label className="health-service-choice">{localeText("Service")}<select value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>{Object.entries(data.services).map(([key, service]) => <option key={key} value={key}>{service.name}</option>)}</select></label></div>
        <div className="health-chart-grid"><HealthChart title={localeText("Traitement et attente du service")} rows={rows} formatValue={milliseconds} series={[{ label:"Traitement P95", value:(row)=>row.services?.[selectedService]?.processingP95, skipMissing:true }, { label:"Attente P95", value:(row)=>row.services?.[selectedService]?.waitP95, skipMissing:true }]} />
        <HealthChart title={localeText("File du service")} rows={rows} series={[{ label:"En attente", value:(row)=>row.services?.[selectedService]?.queued, skipMissing:true }, { label:"En cours", value:(row)=>row.services?.[selectedService]?.busy, skipMissing:true }]} /></div>
      </section>
      <section className="metrics-section"><div className="metrics-section-heading"><h3>{localeText("Relevés conservés")}</h3><div className="segmented-tabs">{[[1,"24 h"],[7,"7 jours"],[30,"30 jours"]].map(([days,label]) => <button type="button" key={days} className={retainedDays === days ? "active" : ""} onClick={() => setRetainedDays(days)}>{localeText(label)}</button>)}</div><small>{data.executionHistory?.retentionDays ?? 30}{" " + localeText("jours · relevés de") + " "}{data.executionHistory?.intervalMinutes ?? 5}{" " + localeText("min")}</small></div><div className="metrics-table-scroll"><table className="score-table health-cache-table"><thead><tr><th>{localeText("Service")}</th><th>{localeText("Terminées")}</th><th>{localeText("Échecs")}</th><th>{localeText("Refusées")}</th><th>{localeText("Annulées / expirées")}</th><th>{localeText("Temps moyen")}</th></tr></thead><tbody>{Object.entries(retained?.services ?? {}).map(([key, row]) => <tr key={key}><th scope="row">{data.services[key]?.name ?? key}</th><td>{formatExactNumber(row.completed)}</td><td>{row.failed}</td><td>{row.rejected}</td><td>{row.cancelled} / {row.timedOut}</td><td>{milliseconds(row.averageMs)}</td></tr>)}</tbody></table>{!Object.keys(retained?.services ?? {}).length && <div className="empty-state">{retained ? localeText("Aucun relevé sur cette période.") : localeText("Lecture des relevés…")}</div>}</div></section>
    </>}
  </section>;
}

export function ServerHealth({ reportError }) {
  const { t: localeText } = useLocale();
  const [tab, setTab] = useState("overview");
  return <div className="server-health-tabs-page"><nav className="segmented-tabs health-subtabs" aria-label={localeText("Santé serveur")}><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>{localeText("Vue d’ensemble")}</button><button className={tab === "execution" ? "active" : ""} onClick={() => setTab("execution")}>{localeText("Workers et caches")}</button><button className={tab === "metrics" ? "active" : ""} onClick={() => setTab("metrics")}>{localeText("Metrics")}</button><button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>{localeText("Journaux")}</button><button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>{localeText("Statut public")}</button></nav>{tab === "status" ? <PublicStatusAdmin reportError={reportError} /> : tab === "logs" ? <HealthLogs /> : tab === "metrics" ? <AdminMetrics reportError={reportError} /> : <ServerHealthOverview reportError={reportError} view={tab} />}</div>;
}

function ServerHealthOverview({ reportError, view }) {
  const { t: localeText } = useLocale();
  const [points, setPoints] = useState(360);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setData(await api(`/api/admin/health?points=${points}`));
      reportError?.("");
    } catch (error) {
      reportError?.(error.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [points, reportError]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const refresh = () => { if (document.visibilityState === "visible") load({ quiet: true }); };
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [autoRefresh, load]);

  if (loading && !data) return <section className="card metrics-loading"><RefreshCw className="spinning" /><strong>{localeText("Lecture de la santé du serveur…")}</strong><small>{localeText("Initialisation des sondes CPU, mémoire, réseau et SQLite.")}</small></section>;
  if (!data) return null;

  const memory = data.process.memory;
  const heapRatio = memory.heapUsed / Math.max(1, memory.heapLimit);
  const rows = data.history ?? [];
  const rowCounts = Object.entries(data.database.rows ?? {});
  const sampledAt = new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(data.generatedAt));

  return <div className={`admin-metrics-page server-health-page ${view === "execution" ? "health-execution-page" : ""}`}>
    <header className="metrics-heading health-heading"><div><span className="eyebrow">{localeText("Supervision technique")}</span><h2>{view === "execution" ? localeText("Workers et caches") : localeText("Santé serveur")}</h2><p>{localeText("Dernier relevé le") + " "}{sampledAt}{" " + localeText("· échantillonnage toutes les") + " "}{data.sampleIntervalSeconds}{" " + localeText("secondes.")}</p></div><div className="metrics-actions"><div className="segmented-tabs">{[[180, "15 min"], [360, "30 min"], [720, "1 heure"]].map(([value, label]) => <button type="button" key={value} className={points === value ? "active" : ""} onClick={() => setPoints(value)}>{localeText(label)}</button>)}</div><button type="button" className={`secondary health-live-toggle ${autoRefresh ? "active" : ""}`} onClick={() => setAutoRefresh((value) => !value)}><Radio size={17} />{autoRefresh ? localeText("Temps réel actif") : localeText("Temps réel en pause")}</button><button type="button" className="secondary" onClick={() => load()} disabled={loading}><RefreshCw size={17} className={loading ? "spinning" : ""} />{localeText("Actualiser")}</button></div></header>

    <section className={`health-global-status status-${data.status}`}><span><i />{data.status === "healthy" ? localeText("Tous les systèmes sont opérationnels") : localeText("Une ressource demande ton attention")}</span><small>{localeText("Processus") + " "}{data.process.pid} · {data.process.nodeVersion}{" " + localeText("· uptime") + " "}{formatDuration(data.process.uptimeSeconds)}</small></section>

    <ProcessHealth data={data} />
    {view === "execution" ? <ExecutionHealth data={data} reportError={reportError} /> : <><section className="metrics-kpi-grid health-kpi-grid">
      <HealthKpi icon={Cpu} label={localeText("CPU du processus")} value={percent(data.process.cpuPercent)} detail={`${data.system.cpuCount} cœur(s) · système ${percent(data.system.cpuPercent)}`} level={data.process.cpuPercent > 80 ? "danger" : data.process.cpuPercent > 50 ? "warning" : "good"} />
      <HealthKpi icon={MemoryStick} label={localeText("Mémoire du processus")} value={formatBytes(memory.rss)} detail={`Heap ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapLimit)}`} level={heapRatio > .85 ? "danger" : heapRatio > .65 ? "warning" : "good"} />
      <HealthKpi icon={Timer} label={localeText("Boucle événementielle")} value={`${Number(data.eventLoop.p95Ms).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} ms`} detail={`Moyenne ${data.eventLoop.meanMs} ms · max ${data.eventLoop.maxMs} ms`} level={data.eventLoop.p95Ms > 150 ? "danger" : data.eventLoop.p95Ms > 60 ? "warning" : "good"} />
      <HealthKpi icon={Network} label={localeText("Trafic API")} value={`${data.traffic.requestsPerSecond.toLocaleString("fr-BE", { maximumFractionDigits: 2 })} req/s`} detail={`${data.traffic.averageDurationMs.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} ms de moyenne`} level={data.traffic.averageDurationMs > 250 ? "danger" : data.traffic.averageDurationMs > 100 ? "warning" : "normal"} />
      <HealthKpi icon={Radio} label={localeText("Temps réel")} value={`${data.realtime.sockets} socket(s)`} detail={`${data.realtime.watchedConnections} connexion(s) dans les salles`} level="good" />
      <HealthKpi icon={Users} label={localeText("Tables actives")} value={data.realtime.activeRooms} detail={`${data.realtime.playingRooms} en jeu · ${data.realtime.waitingRooms} en attente`} />
      <HealthKpi icon={Database} label={localeText("Base SQLite")} value={formatBytes(data.database.fileBytes)} detail={`WAL ${formatBytes(data.database.walBytes)} · ${percent(data.database.fragmentationRatio * 100)} libre`} level={data.database.fragmentationRatio > .3 ? "warning" : "good"} />
      <HealthKpi icon={Gauge} label={localeText("Requêtes cumulées")} value={<CompactNumber value={data.traffic.totalRequests} label={localeText("Nombre exact de requêtes")} />} detail={`${data.traffic.totalErrors} erreur(s) · ${data.traffic.activeRequests} active(s)`} level={data.traffic.totalErrors ? "warning" : "good"} />
    </section>

    <div className="health-chart-grid">
      <HealthChart title={localeText("Utilisation CPU")} percentage rows={rows} formatValue={percent} series={[{ label: "Site et jeux", value: (row) => row.cpuProcess, color: healthPalette[0] }, { label: "Comptes", value: (row) => row.accountsCpu, skipMissing: true, color: healthPalette[1] }, { label: "Machine", value: (row) => row.cpuSystem, color: healthPalette[2] }]} />
      <HealthChart title={localeText("Mémoire utilisée")} rows={rows} formatValue={(value) => formatBytes(Number(value) * 1024 * 1024)} series={[{ label: "Site et jeux", value: (row) => row.memoryRss / 1024 / 1024, color: healthPalette[2] }, { label: "Comptes", value: (row) => row.accountsRss == null ? null : row.accountsRss / 1024 / 1024, skipMissing: true, color: healthPalette[1] }]} />
      <HealthChart title={localeText("Latence de la boucle")} rows={rows} formatValue={(value) => `${Number(value || 0).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} ms`} series={[{ label: "P95", value: (row) => row.eventLoopP95, color: healthPalette[0] }, { label: "Maximum", value: (row) => row.eventLoopMax, color: healthPalette[3] }]} />
      <HealthChart title={localeText("Requêtes et latence API")} rows={rows} series={[{ label: "Requêtes/s", value: (row) => row.requestsPerSecond, color: healthPalette[1] }, { label: "Latence moyenne (ms)", value: (row) => row.requestLatencyAverage, color: healthPalette[0] }, { label: "Latence max (ms)", value: (row) => row.requestLatencyMax, color: healthPalette[3] }]} />
    </div>

    <div className="metrics-three-columns health-details-grid">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">{localeText("Processus")}</span><h3><Server size={19} />{" " + localeText("Node.js")}</h3></div></div><DetailList rows={[["PID", data.process.pid], ["Environnement", data.process.environment], ["Version", data.process.nodeVersion], ["Démarré", new Date(data.process.startedAt).toLocaleString("fr-BE")], ["Uptime", formatDuration(data.process.uptimeSeconds)], ["Mémoire externe", formatBytes(memory.external)], ["Array buffers", formatBytes(memory.arrayBuffers)]]} /></section>
      <SystemHealth system={data.system}/>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">{localeText("Jeux")}</span><h3><Activity size={19} />{" " + localeText("Runtime")}</h3></div></div><DetailList rows={[["Joueurs assis", data.realtime.seatedHumans], ["IA assises", data.realtime.seatedBots], ["Sessions invitées", data.realtime.guestSessions], ["Timers IA en attente", data.realtime.pendingBotTimers], ["Tables en jeu", data.realtime.playingRooms], ["Tables en attente", data.realtime.waitingRooms], ["Sockets ouvertes", data.realtime.sockets]]} /></section>
    </div>

    <div className="metrics-two-columns health-data-grid">
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">{localeText("Stockage")}</span><h3><HardDrive size={19} />{" " + localeText("Détails SQLite")}</h3></div><small>{data.database.journalMode.toUpperCase()}</small></div><DetailList rows={[["Fichier principal", formatBytes(data.database.fileBytes), formatExactNumber(data.database.fileBytes)], ["Journal WAL", formatBytes(data.database.walBytes), formatExactNumber(data.database.walBytes)], ["Mémoire partagée", formatBytes(data.database.shmBytes)], ["Pages", formatExactNumber(data.database.pageCount)], ["Pages libres", formatExactNumber(data.database.freePages)], ["Taille d’une page", formatBytes(data.database.pageSize)], ["Données utilisées", formatBytes(data.database.usedBytes)]]} /><div className="health-row-counts">{rowCounts.map(([table, count]) => <span key={table}><small>{table.replaceAll("_", " ")}</small><strong><CompactNumber value={count} label={localeText("Nombre exact dans {value0}", { value0: table })} /></strong></span>)}</div></section>
      <section className="metrics-section"><div className="metrics-section-heading"><div><span className="eyebrow">{localeText("API")}</span><h3><Network size={19} />{" " + localeText("Routes les plus coûteuses")}</h3></div><small>{localeText("Depuis le dernier démarrage")}</small></div><div className="metrics-table-scroll"><table className="score-table health-endpoint-table"><thead><tr><th>{localeText("Route")}</th><th>{localeText("Appels")}</th><th>{localeText("Moyenne")}</th><th>{localeText("Maximum")}</th><th>{localeText("Erreurs")}</th><th>{localeText("Dernier statut")}</th></tr></thead><tbody>{data.traffic.endpoints.map((endpoint) => <tr key={endpoint.route}><td><code>{endpoint.route}</code><small>{endpoint.lastSeenAt ? new Date(endpoint.lastSeenAt).toLocaleTimeString("fr-BE") : "—"}</small></td><td><CompactNumber value={endpoint.requests} /></td><td>{endpoint.averageDurationMs.toLocaleString("fr-BE", { maximumFractionDigits: 1 })}{" " + localeText("ms")}</td><td>{endpoint.maxDurationMs.toLocaleString("fr-BE", { maximumFractionDigits: 1 })}{" " + localeText("ms")}</td><td className={endpoint.errors ? "negative-amount" : ""}>{endpoint.errors} <small>{percent(endpoint.errorRate * 100)}</small></td><td><span className={`status-badge ${endpoint.lastStatus >= 400 ? "status-inactive" : "status-active"}`}>{endpoint.lastStatus}</span></td></tr>)}</tbody></table></div>{!data.traffic.endpoints.length && <div className="empty-state">{localeText("Les routes apparaîtront après les premières requêtes.")}</div>}</section>
    </div></>}
  </div>;
}
