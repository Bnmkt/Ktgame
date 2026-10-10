import { useEffect, useRef, useState } from "react";
import { Activity, Check, ChevronDown, Download, FlaskConical, Play, RefreshCw, ShieldCheck, Square, X } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmDialog } from "../common/ConfirmAction.jsx";
import { HealthChart } from "./ServerHealth.jsx";
import "./capacity-tests.css";

const states = { starting: "Démarrage", running: "En cours", stopping: "Arrêt en cours", stopped: "Interrompu", interrupted: "Serveur redémarré", passed: "Validé", failed: "À analyser" };
const phases = { setup: "Connexion des joueurs", preparation: "Préparation des tables", load: "Jeux et activités", cleanup: "Fermeture des tables" };
const number = (value) => value == null ? "-" : Number(value).toLocaleString("fr-BE", { maximumFractionDigits: 1 });
const date = (value) => value ? new Date(value).toLocaleString("fr-BE") : "-";
const ms = (value) => value == null ? "-" : `${number(value)} ms`;
const reasons = { "admin-stop": "Arrêt demandé", "real-room-opened": "Une vraie table a été ouverte", "live-server-safety": "Protection du serveur principal", "server-shutdown": "Arrêt du serveur", "server-restarted": "Redémarrage du serveur", "runner-failed": "Le moteur de test s'est arrêté", "runner-start-failed": "Démarrage impossible", safety: "Seuil de sécurité atteint", duration: "Durée prévue atteinte", interrupted: "Interruption", "setup failed": "Échec des connexions", "preparation failed": "Échec de préparation" };
const fields = [
  ["clients", "Joueurs simultanés", "joueurs"], ["seconds", "Durée en jeu", "s"], ["rampMs", "Délai entre connexions", "ms"],
  ["roomRampMs", "Délai entre tables", "ms"], ["actionMs", "Délai entre actions", "ms"], ["browseMs", "Délai entre lectures API", "ms"],
  ["setupConcurrency", "Connexions en parallèle", ""], ["gameWorkers", "Processus jeux (0 : désactivés)", ""], ["loopLimitMs", "Latence maximale P95", "ms"], ["freeMemoryMb", "Mémoire libre minimale", "Mo"], ["errorLimit", "Erreurs par échantillon", ""]
];
const switches = [["routinePolls", "Notifications et présence"], ["liveState", "États de table en temps réel"], ["chat", "Messages de chat"], ["events", "Événements communautaires"], ["reconnect", "Reconnexions"], ["ranked", "Matchmaking classé"]];
const checkNames = { integrity: "Intégrité SQLite", foreignKeys: "Relations entre données", uniqueRankedResults: "Résultats classés uniques", uniqueSettlements: "Attribution unique du classement", uniqueGameHistories: "Historiques sans doublon", uniqueAchievementRewards: "Récompenses uniques", uniqueEventActions: "Actions communautaires uniques", nonnegativeXp: "XP non négative", xpMatchesRecordedAwards: "XP et récompenses cohérentes", balancesMatchTransactions: "Soldes et transactions cohérents", validBalances: "Soldes valides", fictitiousAccounts: "Uniquement des comptes fictifs" };

export function CapacityTests({ reportError }) {
  const [data, setData] = useState(null), [config, setConfig] = useState(null), [run, setRun] = useState(null);
  const [tab, setTab] = useState("configure"), [selected, setSelected] = useState(""), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null), [comparison, setComparison] = useState(null);
  const selectedRef = useRef(""), initialized = useRef(false);
  const [clock, setClock] = useState(Date.now());
  selectedRef.current = selected;
  useEffect(() => {
    let disposed = false, pending = false;
    async function refresh() {
      if (pending) return; pending = true;
      try {
        const result = await api("/api/admin/tests");
        if (disposed) return;
        setData(result); setConfig((current) => current ?? result.defaults);
        if (!initialized.current) {
          initialized.current = true;
          const id = result.activeId ?? result.runs[0]?.id ?? "";
          selectedRef.current = id; setSelected(id);
          if (result.activeId) setTab("results");
        }
        const id = selectedRef.current;
        if (id) { const detail = await api(`/api/admin/tests/${id}`); if (!disposed && id === selectedRef.current) setRun(detail); }
      } catch (error) { if (!disposed) reportError?.(error.message); }
      finally { pending = false; }
    }
    refresh(); const timer = setInterval(refresh, 5000), tick = setInterval(() => setClock(Date.now()), 1000);
    return () => { disposed = true; clearInterval(timer); clearInterval(tick); };
  }, [reportError]);
  async function choose(id) {
    selectedRef.current = id; setSelected(id); setRun(null); setComparison(null); setTab("results");
    try { const result = await api(`/api/admin/tests/${id}`); if (selectedRef.current === id) setRun(result); } catch (error) { reportError?.(error.message); }
  }
  async function start() {
    setBusy(true);
    try { const result = await api("/api/admin/tests", { method: "POST", body: JSON.stringify({ confirm: true, config }) }); setRun(result); setSelected(result.id); selectedRef.current = result.id; setData((current) => ({ ...current, activeId: result.id })); setComparison(null); setTab("results"); }
    finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true);
    try { setRun(await api(`/api/admin/tests/${run.id}/stop`, { method: "POST", body: "{}" })); } finally { setBusy(false); }
  }
  async function download() {
    try {
      const result = await api(`/api/admin/tests/${run.id}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `ktga-test-${run.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { reportError?.(error.message); }
  }
  if (!data || !config) return <section className="card capacity-tool"><RefreshCw size={20} /> Chargement des tests…</section>;
  const active = ["starting", "running", "stopping"].includes(run?.state);
  const report = run?.report, counts = report?.counters ?? run?.progress ?? {};
  const samples = run?.samples ?? [], rows = report?.health ?? samples.map((sample) => sample.health).filter(Boolean);
  const elapsed = Math.max(0, Math.floor((Math.min(clock, Date.parse(run?.finishedAt) || clock) - Date.parse(report?.loadStartedAt ?? run?.progress?.loadStartedAt)) / 1000)) || 0;
  const gameNames = Object.fromEntries(data.games.map((game) => [game.id, game.name]));
  const latestHealth = rows.at(-1);
  const selectedGames = data.games.filter((game) => config.games.includes(game.id));
  let available = Number(config.clients), covered = 0;
  for (const game of selectedGames) { const needed = Math.min(game.maxPlayers, Math.max(2, game.minPlayers)); if (available < needed) break; available -= needed; covered++; }
  function update(key, value) { setConfig((current) => ({ ...current, [key]: value })); }
  return <section className="card capacity-tool" aria-label="Debug et tests">
    <div className="admin-section-heading"><div><span className="eyebrow">Diagnostic</span><h2><FlaskConical size={24} /> Debug / Tests</h2></div><span className="status-badge"><ShieldCheck size={15} /> Instance isolée</span></div>
    <nav className="capacity-tabs" aria-label="Vues des tests">{[["configure", "Configuration"], ["results", "Résultats"], ["history", "Historique"]].map(([id, label]) => <button type="button" key={id} className={tab === id ? "active" : "secondary"} onClick={() => setTab(id)}>{label}{id === "history" ? ` (${data.runs.length})` : ""}</button>)}</nav>
    {tab === "configure" && <form onSubmit={(event) => { event.preventDefault(); setConfirm("start"); }}>
      <div className="capacity-host"><strong>{data.host.cpus} CPU · {number(data.host.totalMemory / 1073741824)} Go</strong><span>{number(data.host.freeMemory / 1048576)} Mo disponibles</span><span>{data.safety.rooms} table(s) réelle(s) ouverte(s)</span></div>
      <div className="capacity-config-heading"><h3>Charge et cadence</h3><label>Préréglage<select defaultValue="10" onChange={(event) => setConfig({ ...data.defaults, clients: Number(event.target.value), seconds: Number(event.target.value) >= 200 ? 90 : 60 })}><option value="10">Diagnostic · 10 joueurs</option><option value="50">Progressif · 50 joueurs</option><option value="200">Charge · 200 joueurs</option><option value="500">Charge élevée · 500 joueurs</option></select></label></div>
      <div className="capacity-fields">{fields.map(([key, label, unit]) => <label key={key}>{label}{unit ? ` (${unit})` : ""}<input type="number" required min={data.limits[key][0]} max={data.limits[key][1]} step="1" value={config[key]} onChange={(event) => update(key, event.target.value === "" ? "" : Number(event.target.value))} /></label>)}</div>
      <div className="capacity-config-heading"><h3>Jeux</h3><div><button type="button" className="secondary" onClick={() => update("games", data.games.map((game) => game.id))}><Check size={15} /> Tous</button><button type="button" className="secondary" onClick={() => update("games", [])}><X size={15} /> Aucun</button></div></div>
      <div className="capacity-games">{data.games.map((game) => <label key={game.id}><input type="checkbox" checked={config.games.includes(game.id)} onChange={(event) => update("games", event.target.checked ? [...config.games, game.id] : config.games.filter((id) => id !== game.id))} /><span>{game.name}<small>{game.minPlayers}–{game.maxPlayers} joueurs</small></span></label>)}</div>
      <p className="capacity-scope">Tables prévues pour {covered} / {selectedGames.length} jeux sélectionnés. {covered < selectedGames.length ? "Augmente le nombre de joueurs pour exercer tous les jeux." : ""}</p>
      <h3>Activités</h3><div className="capacity-switches">{switches.map(([key, label]) => <label key={key}><input type="checkbox" checked={config[key]} onChange={(event) => update(key, event.target.checked)} />{label}</label>)}</div>
      <div className="capacity-safety" role="status"><ShieldCheck size={20} /><div><strong>Comptes fictifs · emails désactivés · données séparées</strong><p>Une vraie table ouverte bloque le lancement. Une nouvelle table ou une surcharge du serveur principal arrête le test. Les seuils du serveur de test sont contrôlés sur trois mesures de 5 secondes.</p></div></div>
      {data.activeId && <button type="button" className="secondary" onClick={() => choose(data.activeId)}><Activity size={17} /> Voir le test en cours</button>}
      <div className="capacity-controls"><button type="submit" disabled={busy || Boolean(data.activeId) || data.safety.rooms > 0 || !config.games.length}><Play size={17} /> Lancer le test</button></div>
    </form>}
    {tab === "results" && (!run ? <div className="empty-state"><FlaskConical /><strong>Aucun test sélectionné</strong></div> : <>
      <div className="capacity-result-heading"><div><span className={`status-badge ${run.state === "passed" ? "status-active" : run.state === "failed" ? "status-inactive" : "status-waiting"}`}>{states[run.state]}</span><h3>{run.config.clients} joueurs · {run.config.seconds} s</h3><small>{date(run.createdAt)} · version {run.siteVersion}</small></div><div className="capacity-controls"><button type="button" className="secondary" onClick={download}><Download size={17} /> Export JSON</button><button type="button" className="secondary" disabled={Boolean(data.activeId)} onClick={() => { setConfig(run.config); setTab("configure"); }}><RefreshCw size={17} /> Réutiliser</button>{active && <button type="button" className="danger-button" disabled={busy || run.state === "stopping"} onClick={() => setConfirm("stop")}><Square size={16} /> Arrêter</button>}</div></div>
      <div className="capacity-phase" role="status"><strong>{active ? phases[run.progress?.phase] ?? "Création de l'instance de test" : reasons[run.stopReason] ?? run.stopReason}</strong><span>{elapsed} / {run.config.seconds} s en jeu</span><progress max={run.config.seconds} value={Math.min(elapsed, run.config.seconds)} aria-label="Durée en jeu" /></div>
      <div className="capacity-kpis">{[["Joueurs connectés", active ? run.progress?.connected : report?.clients], ["Requêtes", counts.requests], ["Erreurs inattendues", counts.errors], ["Actions de jeu", counts.actions], ["Parties terminées", counts.completed], ["Latence P95", ms(report?.latency?.p95Ms ?? run.progress?.p95Ms)]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{typeof value === "number" ? number(value) : value ?? "-"}</strong></article>)}</div>
      <p className="capacity-scope">{run.scope} Un test validé confirme ce scénario, pas une capacité garantie.</p>
      {run.cleanupWarning && <p className="capacity-error">Le nettoyage des fichiers temporaires n'a pas pu être terminé. Le rapport est conservé.</p>}
      {report?.incomplete && <p className="capacity-error">Rapport incomplet : les mesures sont conservées, mais ce test ne valide pas une capacité.</p>}
      {report?.diagnostics && <p className="capacity-scope">Générateur : code {report.diagnostics.generator?.exitCode ?? "-"}{report.diagnostics.generator?.signal ? ` · ${report.diagnostics.generator.signal}` : ""}{report.diagnostics.generator?.error ? ` · ${report.diagnostics.generator.error}` : ""}{report.diagnostics.issue ? ` · ${report.diagnostics.issue}` : ""} · rapport {number(report.diagnostics.reportBytes / 1024)} Ko.</p>}
      {rows.length > 0 && <div className="health-chart-grid">
        <HealthChart title="Requêtes et connexions" rows={rows} series={[{ label: "Requêtes/s", value: (row) => row.rps }, { label: "Connexions", value: (row) => row.sockets }]} />
        <HealthChart title="Latence des processus" rows={rows} formatValue={ms} series={[{ label: "Site et jeux P95", value: (row) => row.loopP95 }, { label: "Comptes P95", value: (row) => row.accountsLoopP95, skipMissing: true }, { label: "Site et jeux maximum", value: (row) => row.loopMax }]} />
        <HealthChart title="Mémoire" rows={rows} formatValue={(value) => `${number(value)} Mo`} series={[{ label: "Serveur de test", value: (row) => row.rss / 1048576 }, { label: "Libre sur la machine", value: (row) => row.systemFreeMemory / 1048576 }]} />
        <HealthChart title="Traitements en attente" rows={rows} series={latestHealth?.processes?.accounts ? [{ label: "Comptes (file partagée)", value: (row) => row.processes?.accounts?.queued, skipMissing: true }, { label: "Historique", value: (row) => row.services?.history?.queued, skipMissing: true }, { label: "Profils", value: (row) => row.services?.account?.queued, skipMissing: true }] : [{ label: "Authentification", value: (row) => row.workers?.password?.queued, skipMissing: true }, { label: "Lectures", value: (row) => row.workers?.reading?.queued, skipMissing: true }]} />
        <HealthChart title="Utilisation CPU" rows={rows} percentage formatValue={(value) => `${number(value)} %`} series={[{ label: "Instance de test / CPU disponibles", value: (row) => row.cpu / row.cpuCount, skipMissing: true }, { label: "Machine entière", value: (row) => row.systemCpu, skipMissing: true }]} />
        <HealthChart title="Latence des requêtes" rows={samples} formatValue={ms} series={[{ label: "P95 cumulée", value: (row) => row.p95Ms, skipMissing: true }]} />
      </div>}
      {latestHealth?.services && <><h3>Services applicatifs</h3><small>Dernier relevé : {date(latestHealth.at)} · les échecs HTTP incluent les refus contrôlés du scénario.</small><div className="metrics-table-scroll"><table className="score-table capacity-route-table"><thead><tr><th>Service</th><th>Traitements terminés</th><th>Échecs</th><th>File</th><th>Refus</th><th>Attente P95</th><th>Traitement P95</th></tr></thead><tbody>{Object.entries(latestHealth.services).map(([id, service]) => <tr key={id}><th>{service.name}</th><td>{number(service.completed)}</td><td>{number(service.failed)}</td><td>{number(service.queued)}</td><td>{number(service.rejected)}</td><td>{ms(service.wait?.p95Ms)}</td><td>{ms(service.processing?.p95Ms)}</td></tr>)}</tbody></table></div></>}
      {report && <>
        <div className="capacity-config-heading"><h3>Comparer</h3><label>Autre test<select value={comparison?.id ?? ""} onChange={async (event) => { if (!event.target.value) return setComparison(null); try { setComparison(await api(`/api/admin/tests/${event.target.value}`)); } catch (error) { reportError?.(error.message); } }}><option value="">Aucune comparaison</option>{data.runs.filter((item) => item.id !== run.id && ["passed", "failed", "stopped"].includes(item.state)).map((item) => <option value={item.id} key={item.id}>{date(item.createdAt)} · {item.config.clients} joueurs</option>)}</select></label></div>
        {comparison?.report && <div className="metrics-table-scroll"><table className="score-table"><thead><tr><th>Mesure</th><th>Ce test</th><th>Test comparé</th></tr></thead><tbody>{[["Joueurs", run.config.clients, comparison.config.clients], ["Durée en jeu (s)", run.config.seconds, comparison.config.seconds], ["Requêtes", report.counters?.requests, comparison.report.counters?.requests], ["Erreurs", report.counters?.errors, comparison.report.counters?.errors], ["P95 (ms)", report.latency?.p95Ms, comparison.report.latency?.p95Ms], ["Actions", report.counters?.actions, comparison.report.counters?.actions]].map(([label, a, b]) => <tr key={label}><th>{label}</th><td>{number(a)}</td><td>{number(b)}</td></tr>)}</tbody></table></div>}
        <h3>Couverture des jeux</h3><div className="metrics-table-scroll"><table className="score-table"><thead><tr><th>Jeu</th><th>Tables lancées</th><th>Actions</th><th>Parties terminées</th></tr></thead><tbody>{run.config.games.map((id) => <tr key={id}><th>{gameNames[id]}</th><td>{number(report.coverage?.[id]?.started ?? 0)}</td><td>{number(report.coverage?.[id]?.actions ?? 0)}</td><td>{number(report.coverage?.[id]?.completed ?? 0)}</td></tr>)}</tbody></table></div>
        <h3>Requêtes API</h3><div className="metrics-table-scroll"><table className="score-table capacity-route-table"><thead><tr><th>Route</th><th>Requêtes</th><th>Moyenne</th><th>P50</th><th>P95</th><th>P99</th><th>Maximum</th></tr></thead><tbody>{Object.entries(report.routes ?? {}).sort((a, b) => b[1].p95Ms - a[1].p95Ms).map(([route, value]) => <tr key={route}><th>{route}</th><td>{number(value.count)}</td>{["meanMs", "p50Ms", "p95Ms", "p99Ms", "maxMs"].map((key) => <td key={key}>{ms(value[key])}</td>)}</tr>)}</tbody></table></div>
        <h3>Intégrité des données</h3>{report.integrity ? <ul className="capacity-checks">{Object.entries(report.integrity.checks).map(([key, passed]) => <li key={key} className={passed ? "capacity-ok" : "capacity-error"}>{passed ? <Check size={16} /> : <X size={16} />}<span>{checkNames[key] ?? key}</span></li>)}</ul> : <p>Vérifications indisponibles pour ce test.</p>}
        {report.failures?.length > 0 && <><h3>Échecs à analyser</h3><ul className="capacity-checks">{report.failures.map((failure, index) => <li key={index} className="capacity-error"><X size={16} /><span>{failure.route} · {failure.category} · {failure.count} occurrence(s)</span></li>)}</ul></>}
        <details className="capacity-config-details"><summary><ChevronDown size={16} /> Configuration de ce test</summary><pre>{JSON.stringify(run.config, null, 2)}</pre></details>
      </>}
    </>)}
    {tab === "history" && <><div className="capacity-config-heading"><h3>{data.runs.length} tests conservés</h3><span>{data.retentionDays} jours · {data.retainedRuns} tests maximum</span></div><div className="metrics-table-scroll"><table className="score-table"><thead><tr><th>Date</th><th>Joueurs</th><th>Durée</th><th>État</th><th>Erreurs</th><th /></tr></thead><tbody>{data.runs.map((item) => <tr key={item.id}><th>{date(item.createdAt)}</th><td>{item.config.clients}</td><td>{item.config.seconds} s</td><td>{states[item.state]}</td><td>{number(item.progress?.errors)}</td><td><button type="button" className="secondary" onClick={() => choose(item.id)}><Activity size={16} /> Résultats</button></td></tr>)}</tbody></table></div>{!data.runs.length && <div className="empty-state">Aucun test enregistré.</div>}</>}
    {confirm && <ConfirmDialog title={confirm === "start" ? "Lancer le test ?" : "Arrêter le test ?"} danger={confirm === "stop" || config.clients >= 200} message={confirm === "start" ? `${config.clients} joueurs fictifs joueront pendant ${config.seconds} secondes après la préparation. Le test partage les ressources du serveur et peut ralentir le site. Aucun compte réel ne sera modifié.` : "Les tables fictives seront fermées et le rapport partiel sera conservé."} confirmLabel={confirm === "start" ? "Lancer" : "Arrêter"} onConfirm={confirm === "start" ? start : stop} onClose={() => setConfirm(null)} />}
  </section>;
}
