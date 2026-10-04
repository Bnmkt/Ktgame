import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, RefreshCw, Search } from "lucide-react";
import { api } from "../../api.js";
import { DateTimeInput } from "../common/DateTimeInput.jsx";
import { localDateTime, localDateTimeToIso } from "../../utils/dates.js";

const categories = [["authentication", "Authentification"], ["access", "Accès refusé"], ["cors", "Origine refusée (CORS)"], ["rate-limit", "Limite de requêtes"], ["server", "Erreur serveur"], ["request", "Requête invalide / introuvable"], ["interrupted", "Connexion interrompue"], ["socket", "Connexion temps réel"], ["cache", "Cache (304)"], ["success", "Succès"], ["lifecycle", "Démarrage serveur"]];
const initialFilters = () => ({ from: localDateTime(new Date(Date.now() - 24 * 3600000)), to: "", level: "", category: "", status: "", method: "", search: "" });
const dateLabel = (at) => new Date(at).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "medium" });

export function HealthLogs() {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const snapshot = useRef(new Date().toISOString());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, ["from", "to"].includes(key) ? localDateTimeToIso(value) : value);
    }
    if (!filters.to) query.set("to", snapshot.current);
    setLoading(true);
    setError("");
    api(`/api/admin/health/logs?${query}`).then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page, refresh]);
  const field = (key) => ({ value: draft[key], onChange: (event) => setDraft((current) => ({ ...current, [key]: event.target.value })) });
  function update(next = draft) {
    if (next.from && next.to && new Date(next.from) > new Date(next.to)) { setError("La date de fin doit être postérieure à la date de début."); return; }
    snapshot.current = new Date().toISOString();
    setFilters({ ...next }); setPage(1); setRefresh((value) => value + 1);
  }
  return <div className="health-logs-page">
    <header className="metrics-heading"><div><span className="eyebrow">Historique persistant</span><h2>Journaux du serveur</h2><p>Requêtes, refus de connexion et erreurs, y compris avant authentification.</p></div><button className="secondary" disabled={loading} onClick={() => update(filters)}><RefreshCw size={17} className={loading ? "spinning" : ""} />Actualiser</button></header>
    <div className="health-log-notice">Conservation : {data?.retentionDays ?? 14} jours, jusqu’à {(data?.maxRows ?? 100000).toLocaleString("fr-BE")} entrées. Les dates sont affichées en {timezone}. Seules les requêtes parvenues au serveur peuvent être enregistrées. Les données commencent à l’activation de ce journal.</div>
    <form className="health-log-filters" onSubmit={(event) => { event.preventDefault(); update(); }}>
      <label>Du<DateTimeInput storage="local" value={draft.from} onValueChange={(value) => setDraft((current) => ({ ...current, from: value }))} /></label><label>Au<DateTimeInput storage="local" value={draft.to} onValueChange={(value) => setDraft((current) => ({ ...current, to: value }))} /></label>
      <label>Niveau<select {...field("level")}><option value="">Tous les niveaux</option><option value="info">Informations</option><option value="warning">Avertissements / refus</option><option value="error">Erreurs serveur</option></select></label>
      <label>Catégorie<select {...field("category")}><option value="">Toutes les catégories</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Statut HTTP<input type="number" min="100" max="599" placeholder="Ex. 401, 429, 500" {...field("status")} /></label>
      <label>Méthode<select {...field("method")}><option value="">Toutes les méthodes</option>{["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"].map((method) => <option key={method}>{method}</option>)}</select></label>
      <label className="health-log-search"><span><Search size={15} /> Route, ID joueur ou ID requête</span><input type="search" placeholder="Ex. /api/me" maxLength="100" {...field("search")} /></label>
      <div className="actions"><button type="submit" disabled={loading}><Filter size={17} />Filtrer</button><button type="button" className="secondary" disabled={loading} onClick={() => { const next = initialFilters(); setDraft(next); update(next); }}>Réinitialiser</button></div>
    </form>
    {error && <div className="error" role="alert">{error}</div>}
    {data?.storageError && <div className="error">Le stockage du journal a rencontré une erreur. Certaines entrées n’ont pas pu être enregistrées.</div>}
    {data?.dropped > 0 && <div className="health-log-notice">{data.dropped} entrée(s) perdue(s) depuis le démarrage (saturation ou stockage indisponible).</div>}
    {data && <>
      <section className="health-log-summary">{[["Résultats filtrés", data.summary.total], ["Refus HTTP 4xx", data.summary.clientErrors], ["Erreurs HTTP 5xx", data.summary.serverErrors], ["Connexions interrompues", data.summary.interrupted], ["Durée moyenne", `${data.summary.averageMs.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} ms`]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{typeof value === "number" ? value.toLocaleString("fr-BE") : value}</strong></article>)}</section>
      <div className="health-log-legend">Un 304 indique une réponse en cache. Un 401 indique une authentification manquante ou invalide, pas une panne du serveur. Clique une entrée pour ses détails.</div>
      <section className="health-log-entries" aria-busy={loading}>
        {!data.rows.length && <div className="empty-state">Aucune entrée pour ces filtres.</div>}
        {data.rows.map((row) => <details className={`health-log-entry log-${row.level}`} key={row.id}>
          <summary><time dateTime={row.at}>{dateLabel(row.at)}</time><span className="health-log-status">{row.status || (row.category === "interrupted" ? "Coupure" : "Système")}</span><span className="health-log-route"><b>{row.method}</b><code>{row.route}</code></span><span>{categories.find(([key]) => key === row.category)?.[1] ?? row.category}</span><span className="health-log-duration">{row.duration.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} ms</span></summary>
          <div className="health-log-detail"><p>{row.message}</p><dl>{[["Requête", row.requestId], ["Joueur identifié", row.userId || "Non authentifié / inconnu"], ["Origine", row.origin || "Non fournie"], ["Navigateur", row.browser || "Non identifié"], ["Horodatage UTC", row.at], ["Niveau", row.level === "error" ? "Erreur" : row.level === "warning" ? "Avertissement" : "Information"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
        </details>)}
      </section>
      <footer className="health-log-pagination"><small>Page {data.page} / {data.pageCount} · {data.summary.total.toLocaleString("fr-BE")} entrée(s) · relevé du {dateLabel(data.generatedAt)}</small><div className="actions"><button className="secondary" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={17} />Précédente</button><button className="secondary" disabled={loading || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Suivante<ChevronRight size={17} /></button></div></footer>
    </>}
    {loading && !data && <div role="status" className="empty-state">Chargement des journaux…</div>}
  </div>;
}
