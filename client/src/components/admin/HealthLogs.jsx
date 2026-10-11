import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, RefreshCw, Search } from "lucide-react";
import { api } from "../../api.js";
import { DateTimeInput } from "../common/DateTimeInput.jsx";
import { localDateTime, localDateTimeToIso } from "../../utils/dates.js";

const categories = [["authentication", "Authentification"], ["access", "Accès refusé"], ["cors", "Origine refusée (CORS)"], ["rate-limit", "Limite de requêtes"], ["server", "Erreur serveur"], ["request", "Requête invalide / introuvable"], ["interrupted", "Connexion interrompue"], ["socket", "Connexion temps réel"], ["cache", "Cache (304)"], ["success", "Succès"], ["lifecycle", "Démarrage serveur"]];
const initialFilters = () => ({ from: localDateTime(new Date(Date.now() - 24 * 3600000)), to: "", level: "", category: "", status: "", method: "", search: "" });
const dateLabel = (at) => new Date(at).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "medium" });

export function HealthLogs() {
  const { t: localeText } = useLocale();
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
    <header className="metrics-heading"><div><span className="eyebrow">{localeText("Historique persistant")}</span><h2>{localeText("Journaux du serveur")}</h2><p>{localeText("Requêtes, refus de connexion et erreurs, y compris avant authentification.")}</p></div><button className="secondary" disabled={loading} onClick={() => update(filters)}><RefreshCw size={17} className={loading ? "spinning" : ""} />{localeText("Actualiser")}</button></header>
    <div className="health-log-notice">{localeText("Conservation :") + " "}{data?.retentionDays ?? 14}{" " + localeText("jours, jusqu’à") + " "}{(data?.maxRows ?? 100000).toLocaleString("fr-BE")}{" " + localeText("entrées. Les dates sont affichées en") + " "}{timezone}{localeText(". Seules les requêtes parvenues au serveur peuvent être enregistrées. Les données commencent à l’activation de ce journal.")}</div>
    <form className="health-log-filters" onSubmit={(event) => { event.preventDefault(); update(); }}>
      <label>{localeText("Du")}<DateTimeInput storage="local" value={draft.from} onValueChange={(value) => setDraft((current) => ({ ...current, from: value }))} /></label><label>{localeText("Au")}<DateTimeInput storage="local" value={draft.to} onValueChange={(value) => setDraft((current) => ({ ...current, to: value }))} /></label>
      <label>{localeText("Niveau")}<select {...field("level")}><option value="">{localeText("Tous les niveaux")}</option><option value="info">{localeText("Informations")}</option><option value="warning">{localeText("Avertissements / refus")}</option><option value="error">{localeText("Erreurs serveur")}</option></select></label>
      <label>{localeText("Catégorie")}<select {...field("category")}><option value="">{localeText("Toutes les catégories")}</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{localeText("Statut HTTP")}<input type="number" min="100" max="599" placeholder={localeText("Ex. 401, 429, 500")} {...field("status")} /></label>
      <label>{localeText("Méthode")}<select {...field("method")}><option value="">{localeText("Toutes les méthodes")}</option>{["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"].map((method) => <option key={method}>{method}</option>)}</select></label>
      <label className="health-log-search"><span><Search size={15} />{" " + localeText("Route, ID joueur ou ID requête")}</span><input type="search" placeholder={localeText("Ex. /api/me")} maxLength="100" {...field("search")} /></label>
      <div className="actions"><button type="submit" disabled={loading}><Filter size={17} />{localeText("Filtrer")}</button><button type="button" className="secondary" disabled={loading} onClick={() => { const next = initialFilters(); setDraft(next); update(next); }}>{localeText("Réinitialiser")}</button></div>
    </form>
    {error && <div className="error" role="alert">{localeText(error)}</div>}
    {data?.storageError && <div className="error">{localeText("Le stockage du journal a rencontré une erreur. Certaines entrées n’ont pas pu être enregistrées.")}</div>}
    {data?.dropped > 0 && <div className="health-log-notice">{data.dropped}{" " + localeText("entrée(s) perdue(s) depuis le démarrage (saturation ou stockage indisponible).")}</div>}
    {data && <>
      <section className="health-log-summary">{[["Résultats filtrés", data.summary.total], ["Refus HTTP 4xx", data.summary.clientErrors], ["Erreurs HTTP 5xx", data.summary.serverErrors], ["Connexions interrompues", data.summary.interrupted], ["Durée moyenne", `${data.summary.averageMs.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} ms`]].map(([label, value]) => <article key={label}><small>{localeText(label)}</small><strong>{typeof value === "number" ? value.toLocaleString("fr-BE") : value}</strong></article>)}</section>
      <div className="health-log-legend">{localeText("Un 304 indique une réponse en cache. Un 401 indique une authentification manquante ou invalide, pas une panne du serveur. Clique une entrée pour ses détails.")}</div>
      <section className="health-log-entries" aria-busy={loading}>
        {!data.rows.length && <div className="empty-state">{localeText("Aucune entrée pour ces filtres.")}</div>}
        {data.rows.map((row) => <details className={`health-log-entry log-${row.level}`} key={row.id}>
          <summary><time dateTime={row.at}>{dateLabel(row.at)}</time><span className="health-log-status">{row.status || (row.category === "interrupted" ? localeText("Coupure") : localeText("Système"))}</span><span className="health-log-route"><b>{row.method}</b><code>{row.route}</code></span><span>{categories.find(([key]) => key === row.category)?.[1] ?? row.category}</span><span className="health-log-duration">{row.duration.toLocaleString("fr-BE", { maximumFractionDigits: 1 })}{" " + localeText("ms")}</span></summary>
          <div className="health-log-detail"><p>{row.message}</p><dl>{[["Requête", row.requestId], ["Joueur identifié", row.userId || "Non authentifié / inconnu"], ["Origine", row.origin || "Non fournie"], ["Navigateur", row.browser || "Non identifié"], ["Horodatage UTC", row.at], ["Niveau", row.level === "error" ? "Erreur" : row.level === "warning" ? "Avertissement" : "Information"]].map(([label, value]) => <div key={label}><dt>{localeText(label)}</dt><dd>{value}</dd></div>)}</dl></div>
        </details>)}
      </section>
      <footer className="health-log-pagination"><small>{localeText("Page") + " "}{data.page} / {data.pageCount} · {data.summary.total.toLocaleString("fr-BE")}{" " + localeText("entrée(s) · relevé du") + " "}{dateLabel(data.generatedAt)}</small><div className="actions"><button className="secondary" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={17} />{localeText("Précédente")}</button><button className="secondary" disabled={loading || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>{localeText("Suivante")}<ChevronRight size={17} /></button></div></footer>
    </>}
    {loading && !data && <div role="status" className="empty-state">{localeText("Chargement des journaux…")}</div>}
  </div>;
}
