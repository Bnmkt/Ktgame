import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bug, LockKeyhole, Pencil, Search, Send } from "lucide-react";
import { api } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { Pagination } from "../../components/feedback/Feedback.jsx";
import { BugEditor } from "./BugReportsAdmin.jsx";
import { BugReportDetail, issueDate } from "./BugReportDetail.jsx";
import { bugReceipt } from "./BugReportProvider.jsx";

export function BugReportsPage({ id, user, onBack, onNavigate }) {
  const [metadata, setMetadata] = useState(null), [loadedResult, setResult] = useState(null), [loadedReport, setReport] = useState(null);
  const [filters, setFilters] = useState({ search: "", status: "all", category: "all", page: 1, pageSize: 20, mine: false });
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [comment, setComment] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [privateView, setPrivateView] = useState(false), [editing, setEditing] = useState(false);
  const privileged = Boolean((user?.admin || user?.editor) && !user?.requiresEmailUpgrade && !user?.requiresEmailVerification);
  const viewerKey = `${user?.id ?? "anonymous"}:${privileged}`, revision = useRef(0);
  const report = loadedReport?.viewerKey === viewerKey ? loadedReport : null;
  const result = loadedResult?.viewerKey === viewerKey ? loadedResult : null;
  useEffect(() => { api("/api/bugs/metadata", { background: true }).then(setMetadata).catch((reason) => setError(reason.message)); }, []);
  const load = useCallback(async () => {
    const requestRevision = ++revision.current;
    setLoading(true); setError("");
    try {
      const data = await api(id ? `/api/bugs/${id}` : `/api/bugs?${new URLSearchParams(filters)}`, { background: true, deduplicate: false, headers: id && bugReceipt(id) ? { "X-Bug-Receipt": bugReceipt(id) } : {} });
      if (requestRevision !== revision.current) return;
      if (id) setReport({ ...data, viewerKey }); else setResult({ ...data, viewerKey });
    } catch (reason) { if (requestRevision === revision.current) { setError(reason.message); setReport(null); } }
    finally { if (requestRevision === revision.current) setLoading(false); }
  }, [id, filters, viewerKey]);
  useEffect(() => { const timer = setTimeout(load, 180); return () => { clearTimeout(timer); revision.current++; }; }, [load]);
  useEffect(() => { setPrivateView(false); setComment(""); setMessage(""); setEditing(false); }, [id, user?.id]);
  async function sendComment(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const data = await api(`/api/bugs/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }), headers: bugReceipt(id) ? { "X-Bug-Receipt": bugReceipt(id) } : {} }); setComment(""); setMessage(data.message); await load(); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  const shown = report && privileged && !privateView && report.visible ? { ...report, title: report.publicTitle, description: report.publicDescription, images: report.images.filter((image) => image.visible), comments: report.comments.filter((entry) => entry.visible && entry.kind !== "internal"), privateView: false } : report;
  const changeFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  return <main className="app-shell issue-page"><header className="page-heading"><div><span className="eyebrow">KTGA.ME · Suivi public</span><h1><Bug size={27} />{id ? `BUG ${id}` : "Signalements de bugs"}</h1></div><button type="button" className="secondary" onClick={id ? () => onNavigate("") : onBack}><ArrowLeft size={17} />{id ? "Tous les bugs" : "Casino"}</button></header><section className="issue-page-panel">
    {error && <p className="error" role="alert">{error}</p>}
    {!id && <><div className="issue-filters"><label className="issue-search"><Search size={17} /><input aria-label="Rechercher un bug" placeholder="Titre ou BUG 1842" value={filters.search} onChange={(event) => changeFilter("search", event.target.value)} /></label>{["status", "category"].map((key) => <label key={key}>{key === "status" ? "Statut" : "Catégorie"}<select aria-label={key === "status" ? "Statut" : "Catégorie"} value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}><option value="all">Tous</option>{Object.entries(metadata?.[key === "status" ? "statuses" : "categories"] ?? {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}{user && <label className="issue-check"><input type="checkbox" checked={filters.mine} onChange={(event) => changeFilter("mine", event.target.checked)} />Mes signalements</label>}</div><p className="issue-muted">Les dossiers publiés sont relus. Les informations de compte et les diagnostics ne sont jamais publics.</p>{loading ? <p role="status">Chargement…</p> : !result?.rows.length ? <div className="issue-empty"><Bug size={30} /><h2>Aucun signalement à afficher</h2><p>Les nouveaux signalements restent privés pendant leur relecture.</p></div> : <div className="issue-list">{result.rows.map((row) => <a key={row.id} href={appPath("bugs", row.id)} className="issue-list-row" onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onNavigate(row.id); } }}><span className="issue-code">{row.code}</span><div><strong>{row.title}</strong><small>{metadata?.categories[row.category]} · {issueDate(row.created_at)}{!row.visible && " · Privé"}</small></div><span className={`issue-state issue-state-${row.status}`}>{metadata?.statuses[row.status]}</span><span>{metadata?.priorities[row.priority]}</span></a>)}</div>}{result && <Pagination {...result} onPage={(page) => setFilters({ ...filters, page })} onPageSize={(pageSize) => setFilters({ ...filters, pageSize, page: 1 })} label="Pages des signalements" />}</>}
    {id && (loading ? <p role="status">Chargement…</p> : shown && <><div className="issue-detail-heading"><h2>{shown.title}</h2>{privileged && <div className="actions"><button type="button" className="secondary" onClick={() => setPrivateView((current) => !current)}><LockKeyhole size={16} />{privateView ? "Version publique" : "Informations privées"}</button><button type="button" onClick={() => setEditing(true)}><Pencil size={16} />Gérer le dossier</button></div>}</div>{shown.privateView && <p className="issue-privacy-note"><LockKeyhole size={16} />{privileged ? "Dossier privé · réservé aux administrateurs et éditeurs." : "Tu consultes ton dossier original. Les autres visiteurs ne voient que sa version publique, après validation."}</p>}<BugReportDetail report={shown} metadata={metadata} showPrivate={shown.privateView} />{shown.comments.length > 0 && <section className="issue-text-section"><h3>Commentaires</h3>{shown.comments.map((entry) => <article key={entry.id} className="issue-comment"><header><strong>{entry.kind === "staff" ? "Équipe KTGA.ME" : entry.kind === "reporter" ? "Auteur du signalement" : entry.kind === "internal" ? "Note interne" : "Joueur"}</strong><time>{issueDate(entry.createdAt)}</time>{!entry.visible && <small>Privé / en attente</small>}</header><p className="issue-prewrap">{entry.body}</p></article>)}</section>}{(user || bugReceipt(id)) && <form className="issue-comment-form" onSubmit={sendComment}><label>Ajouter une précision<textarea aria-label="Ajouter une précision" rows={3} maxLength={4000} minLength={3} required value={comment} onChange={(event) => setComment(event.target.value)} /></label><small>Ne joins pas d’informations personnelles. Les commentaires sont relus avant publication.</small><button type="submit" disabled={busy}><Send size={16} />Envoyer</button>{message && <p role="status">{message}</p>}</form>}</>)}
  </section>{editing && <BugEditor id={id} onClose={() => { setEditing(false); load(); }} onChanged={load} />}</main>;
}
