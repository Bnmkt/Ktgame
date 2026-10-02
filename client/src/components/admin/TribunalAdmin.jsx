import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bot, CheckSquare, ChevronLeft, ChevronRight, Clock3, Eye, FileWarning, Gavel, Plus, RefreshCw, Save, Scale, Settings, ShieldAlert, Trash2, Users } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";

const PAGE_SIZE = 8;
const formatDate = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
const statusLabels = { voting: "Vote en cours", "awaiting-enforcement": "Décision requise", resolved: "Résolu", dismissed: "Classé" };
const outcomeLabels = { "permanent-ban-review": "Bannissement définitif", "hard-ban-review": "Bannissement temporaire", "social-ban": "Restriction sociale", warning: "Avertissement", "not-guilty": "Non coupable" };
const outcomeOptions = Object.entries(outcomeLabels);

function Pager({ page, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return <nav className="admin-pagination" aria-label="Pages"><button type="button" className="secondary icon-toggle" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Page précédente"><ChevronLeft /></button><span>Page <strong>{page}</strong> sur {pages}</span><button type="button" className="secondary icon-toggle" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Page suivante"><ChevronRight /></button></nav>;
}

export function TribunalAdmin({ reportError, notifySuccess }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("reports");
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [settings, setSettings] = useState(null);
  const [pages, setPages] = useState({ reports: 1, cases: 1, history: 1 });
  const [selectedCases, setSelectedCases] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api("/api/admin/tribunal");
      setData(result);
      setSettings(result.settings);
      setSelectedCases((current) => current.filter((id) => result.cases.some((entry) => entry.id === id && entry.status === "awaiting-enforcement")));
    } catch (error) { reportError(error.message); }
    finally { setLoading(false); }
  }, [reportError]);
  useEffect(() => { load(); }, [load]);

  const pendingGroups = useMemo(() => {
    const groups = new Map();
    for (const report of data?.reports.filter((entry) => entry.status === "pending") ?? []) {
      const group = groups.get(report.accusedId) ?? { accused: report.accused, reports: [] };
      group.reports.push(report);
      groups.set(report.accusedId, group);
    }
    return [...groups.values()];
  }, [data]);
  const activeCases = (data?.cases ?? []).filter((entry) => ["voting", "awaiting-enforcement"].includes(entry.status));
  const historyCases = (data?.cases ?? []).filter((entry) => ["resolved", "dismissed"].includes(entry.status));
  const pageRows = (rows, key) => rows.slice((pages[key] - 1) * PAGE_SIZE, pages[key] * PAGE_SIZE);
  const visibleActive = pageRows(activeCases, "cases");
  const selectableVisible = visibleActive.filter((entry) => entry.status === "awaiting-enforcement").map((entry) => entry.id);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((id) => selectedCases.includes(id));

  async function dismissReport(report) {
    try { await api(`/api/admin/tribunal/reports/${report.id}/dismiss`, { method: "POST", body: JSON.stringify({ note: "Signalement classé après vérification administrative." }) }); setEditor(null); await load(); notifySuccess("Signalement classé."); }
    catch (error) { reportError(error.message); }
  }
  async function createCase(event) {
    event.preventDefault();
    try { await api("/api/admin/tribunal/cases", { method: "POST", body: JSON.stringify(editor.form) }); setEditor(null); await load(); notifySuccess("Dossier transmis au jury."); }
    catch (error) { reportError(error.message); }
  }
  async function caseAction(entry, action, body = {}) {
    try { await api(`/api/admin/tribunal/cases/${entry.id}/${action}`, { method: "POST", body: JSON.stringify(body) }); setEditor(null); await load(); notifySuccess(action === "resolve" ? "Délibération clôturée." : "Dossier classé."); }
    catch (error) { reportError(error.message); }
  }
  async function enforceDecision(event) {
    event.preventDefault();
    const ids = editor.caseIds ?? [editor.case.id];
    const path = ids.length > 1 ? "/api/admin/tribunal/cases/enforce-batch" : `/api/admin/tribunal/cases/${ids[0]}/enforce`;
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify({ caseIds: ids, outcome: editor.outcome, days: editor.days, reason: editor.reason }) });
      setEditor(null); setSelectedCases([]); await load();
      notifySuccess(ids.length > 1 ? `${result.applied?.length ?? ids.length} décision(s) appliquée(s).` : "Décision appliquée.");
    } catch (error) { reportError(error.message); }
  }
  async function saveSettings(event) {
    event.preventDefault();
    try { const result = await api("/api/admin/tribunal/settings", { method: "PATCH", body: JSON.stringify(settings) }); setSettings(result); notifySuccess("Réglages du tribunal enregistrés."); }
    catch (error) { reportError(error.message); }
  }
  function openDecision(entries) {
    const first = entries[0];
    const rule = settings.verdictRules.find((candidate) => candidate.outcome === first.outcome);
    setEditor({ kind: "decision", case: first, caseIds: entries.map((entry) => entry.id), outcome: first.outcome || "warning", days: rule?.defaultDays || (first.outcome === "social-ban" ? first.socialBanDays : first.hardBanDays), reason: entries.length > 1 ? "Décision groupée du tribunal" : `Décision du tribunal ${first.code}` });
  }
  function toggleRule(index, field, value) {
    setSettings((current) => ({ ...current, verdictRules: current.verdictRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule) }));
  }

  if (loading && !data) return <section className="card admin-loading"><RefreshCw className="spinning" /><strong>Ouverture du greffe…</strong></section>;
  return <div className="tribunal-admin">
    <header className="tribunal-admin-heading"><div className="tribunal-admin-emblem"><Scale /></div><div><span className="eyebrow">Modération communautaire</span><h2>Tribunal des joueurs</h2><p>Vérifie les saisines, supervise les votes et décide humainement de chaque sanction.</p></div><button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCw size={17} className={loading ? "spinning" : ""} /> Actualiser</button></header>
    <section className="tribunal-admin-counts"><article><FileWarning /><span>À examiner</span><strong>{data.counts.pendingReports}</strong></article><article><Users /><span>En délibération</span><strong>{data.counts.voting}</strong></article><article className={data.counts.awaitingEnforcement ? "attention" : ""}><ShieldAlert /><span>À décider</span><strong>{data.counts.awaitingEnforcement}</strong></article><article><Archive /><span>Décisions</span><strong>{data.counts.resolved}</strong></article></section>
    <nav className="segmented-tabs tribunal-admin-tabs" aria-label="Sections du tribunal">
      <button type="button" className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><FileWarning size={17} />Signalements</button>
      <button type="button" className={tab === "cases" ? "active" : ""} onClick={() => setTab("cases")}><Gavel size={17} />Dossiers</button>
      <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><Archive size={17} />Décisions</button>
      <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={17} />Paramètres</button>
    </nav>

    {tab === "reports" && <section className="tribunal-admin-list"><div className="admin-section-heading"><div><span className="eyebrow">Greffe</span><h3>Signalements à vérifier</h3><small>Les saisines visant le même compte sont regroupées, sans fusionner les compteurs.</small></div></div>{pageRows(pendingGroups, "reports").map((group) => <article key={group.accused.id} className="tribunal-report-group"><header><div><span>Joueur mis en cause</span><strong>{group.accused.pseudo}</strong><small>{group.accused.email}</small></div><b>{group.reports.length} saisine(s)</b></header><div>{group.reports.map((report) => <section key={report.id}><span>{data.categories.find((category) => category.id === report.category)?.label ?? report.category}</span><p>{report.description}</p><small>Par {report.reporter.pseudo} · {formatDate(report.createdAt)}</small><div className="actions"><button type="button" className="secondary" onClick={() => setEditor({ kind: "report", report })}>Examiner</button></div></section>)}</div><button type="button" onClick={() => setEditor({ kind: "case", form: { reportIds: group.reports.map((entry) => entry.id), title: "Comportement en partie", summary: group.reports.map((entry) => entry.description).join("\n\n"), votingDurationHours: data.settings.votingDurationHours, minimumVotes: data.settings.minimumVotes, hardBanDays: data.settings.hardBanDays, socialBanDays: data.settings.socialBanDays } })}><Gavel size={18} /> Constituer un dossier</button></article>)}{!pendingGroups.length && <div className="empty-state"><Scale size={28} /><strong>Le greffe est à jour</strong><span>Aucun signalement n’attend de vérification.</span></div>}<Pager page={pages.reports} total={pendingGroups.length} onChange={(page) => setPages({ ...pages, reports: page })} /></section>}

    {tab === "cases" && <section className="tribunal-admin-list"><div className="admin-section-heading"><div><span className="eyebrow">Audiences</span><h3>Dossiers actifs</h3><small>Chaque proposition de sanction attend une décision humaine, individuelle ou groupée.</small></div></div>{selectableVisible.length > 0 && <div className="tribunal-batch-toolbar"><label><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedCases((current) => allVisibleSelected ? current.filter((id) => !selectableVisible.includes(id)) : [...new Set([...current, ...selectableVisible])])} /> Sélectionner les décisions de cette page</label><button type="button" disabled={!selectedCases.length} onClick={() => openDecision(activeCases.filter((entry) => selectedCases.includes(entry.id)))}><CheckSquare size={17} /> Valider la sélection ({selectedCases.length})</button></div>}{visibleActive.map((entry) => <CaseRow key={entry.id} entry={entry} selected={selectedCases.includes(entry.id)} onSelect={() => setSelectedCases((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])} onOpen={() => setEditor({ kind: "case-detail", case: entry })} onResolve={() => caseAction(entry, "resolve")} onDismiss={() => setEditor({ kind: "dismiss-case", case: entry })} onEnforce={() => openDecision([entry])} />)}{!activeCases.length && <div className="empty-state"><Scale /><strong>Aucune audience active</strong></div>}<Pager page={pages.cases} total={activeCases.length} onChange={(page) => setPages({ ...pages, cases: page })} /></section>}

    {tab === "history" && <section className="tribunal-admin-list"><div className="admin-section-heading"><div><span className="eyebrow">Registre</span><h3>Décisions rendues</h3></div></div>{pageRows(historyCases, "history").map((entry) => <CaseRow key={entry.id} entry={entry} onOpen={() => setEditor({ kind: "case-detail", case: entry })} />)}{!historyCases.length && <div className="empty-state"><Archive /><strong>Aucune décision archivée</strong></div>}<Pager page={pages.history} total={historyCases.length} onChange={(page) => setPages({ ...pages, history: page })} /></section>}

    {tab === "settings" && settings && <form className="tribunal-admin-settings tribunal-settings-layout" onSubmit={saveSettings}><div className="admin-section-heading"><div><span className="eyebrow">Règlement</span><h3>Paramètres du tribunal</h3><small>Les seuils proposent une décision. Une personne habilitée doit toujours la confirmer.</small></div><button type="submit"><Save size={17} /> Enregistrer</button></div><section className="tribunal-settings-section"><header><Users /><div><h4>Accès au jury</h4><p>Conditions nécessaires pour consulter et juger les dossiers non liés au compte.</p></div></header><label className="admin-toggle-row"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span><strong>Tribunal ouvert</strong><small>Autorise l’affectation et le dépôt des votes.</small></span></label><div className="admin-field-grid"><label>Durée du vote (heures)<input type="number" min="1" max="720" value={settings.votingDurationHours} onChange={(event) => setSettings({ ...settings, votingDurationHours: Number(event.target.value) })} /></label><label>Votes minimum<input type="number" min="1" max="100" value={settings.minimumVotes} onChange={(event) => setSettings({ ...settings, minimumVotes: Number(event.target.value) })} /></label><label>Parties minimum<input type="number" min="0" max="10000" value={settings.minimumGames} onChange={(event) => setSettings({ ...settings, minimumGames: Number(event.target.value) })} /></label><label>Comportement minimum du juré<input type="number" min="0" max="100" value={settings.minimumBehaviorScore} onChange={(event) => setSettings({ ...settings, minimumBehaviorScore: Number(event.target.value) })} /></label><label>Récompense maximale<input type="number" min="0" max="100000" value={settings.maximumReward} onChange={(event) => setSettings({ ...settings, maximumReward: Number(event.target.value) })} /></label></div></section><section className="tribunal-settings-section"><header><Scale /><div><h4>Calcul du score final</h4><p>Le vote moyen est diminué seulement si le comportement passe sous le seuil, puis selon les sanctions déjà réellement appliquées.</p></div></header><div className="admin-field-grid"><label>Pénalité à partir d’un score sous<input type="number" min="1" max="100" value={settings.behaviorPenaltyThreshold} onChange={(event) => setSettings({ ...settings, behaviorPenaltyThreshold: Number(event.target.value) })} /></label><label>Pénalité comportementale maximale<input type="number" min="0" max="3" step="0.1" value={settings.behaviorPenaltyMaximum} onChange={(event) => setSettings({ ...settings, behaviorPenaltyMaximum: Number(event.target.value) })} /></label><label>Pénalité par sanction réelle<input type="number" min="0" max="1" step="0.05" value={settings.priorSanctionPenalty} onChange={(event) => setSettings({ ...settings, priorSanctionPenalty: Number(event.target.value) })} /></label></div><code className="tribunal-formula">score final = moyenne des votes − pénalité comportementale − (sanctions réelles × pénalité)</code></section><section className="tribunal-settings-section"><header><Gavel /><div><h4>Seuils de décision</h4><p>La première ligne dont le maximum est supérieur ou égal au score devient la proposition du système.</p></div></header><div className="tribunal-threshold-table"><div className="tribunal-threshold-head"><span>Jusqu’à</span><span>Proposition</span><span>Libellé interne</span><span>Durée</span><span /></div>{settings.verdictRules.map((rule, index) => <div className="tribunal-threshold-row" key={rule.id}><input aria-label="Score maximum" type="number" min="-1" max="5" step="0.01" value={rule.maximumScore} onChange={(event) => toggleRule(index, "maximumScore", Number(event.target.value))} /><select aria-label="Décision proposée" value={rule.outcome} onChange={(event) => toggleRule(index, "outcome", event.target.value)}>{outcomeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="Libellé" value={rule.label} onChange={(event) => toggleRule(index, "label", event.target.value)} /><input aria-label="Durée par défaut" type="number" min="0" max="3650" value={rule.defaultDays} onChange={(event) => toggleRule(index, "defaultDays", Number(event.target.value))} /><button type="button" className="secondary icon-toggle" disabled={settings.verdictRules.length <= 1} onClick={() => setSettings({ ...settings, verdictRules: settings.verdictRules.filter((_, ruleIndex) => ruleIndex !== index) })} aria-label="Supprimer ce seuil"><Trash2 size={16} /></button></div>)}</div><button type="button" className="secondary" onClick={() => setSettings({ ...settings, verdictRules: [...settings.verdictRules, { id: `rule-${Date.now()}`, maximumScore: 5, outcome: "not-guilty", label: "Nouvelle décision", defaultDays: 0 }] })}><Plus size={16} /> Ajouter un seuil</button></section><section className="tribunal-settings-section"><header><Bot /><div><h4>Ouverture automatique</h4><p>Regroupe les signalements concordants sans juger leur contenu et sans appliquer de sanction.</p></div></header><div className="tribunal-automation-settings"><Bot /><div><strong>Pré-évaluation automatique</strong><p>Un dossier est ouvert après le nombre défini de déclarants distincts.</p></div><label><input type="checkbox" checked={settings.automaticReviewEnabled} onChange={(event) => setSettings({ ...settings, automaticReviewEnabled: event.target.checked })} /> Activée</label><label>Seuil<input type="number" min="2" max="100" value={settings.automaticReportThreshold} onChange={(event) => setSettings({ ...settings, automaticReportThreshold: Number(event.target.value) })} /></label></div></section></form>}

    {editor?.kind === "report" && <Dialog title="Examiner le signalement" className="tribunal-admin-dialog" onClose={() => setEditor(null)}><div className="tribunal-report-detail"><span>{data.categories.find((entry) => entry.id === editor.report.category)?.label}</span><h3>{editor.report.accused.pseudo}</h3><p>{editor.report.description}</p>{editor.report.evidence.map((item, index) => <div key={index}><strong>{item.label}</strong><small>{item.value}</small></div>)}</div><div className="actions"><button type="button" onClick={() => setEditor({ kind: "case", form: { reportIds: [editor.report.id], title: "Comportement en partie", summary: editor.report.description, votingDurationHours: data.settings.votingDurationHours, minimumVotes: data.settings.minimumVotes, hardBanDays: data.settings.hardBanDays, socialBanDays: data.settings.socialBanDays } })}><Gavel size={17} />Ouvrir un dossier</button><button type="button" className="danger" onClick={() => dismissReport(editor.report)}>Classer sans suite</button></div></Dialog>}
    {editor?.kind === "case" && <Dialog title="Constituer le dossier" className="tribunal-admin-dialog" onClose={() => setEditor(null)}><form onSubmit={createCase}><label>Intitulé<input required value={editor.form.title} onChange={(event) => setEditor({ ...editor, form: { ...editor.form, title: event.target.value } })} /></label><label>Exposé présenté aux jurés<textarea required value={editor.form.summary} onChange={(event) => setEditor({ ...editor, form: { ...editor.form, summary: event.target.value } })} /></label><div className="admin-field-grid"><label>Durée (heures)<input type="number" min="1" max="720" value={editor.form.votingDurationHours} onChange={(event) => setEditor({ ...editor, form: { ...editor.form, votingDurationHours: Number(event.target.value) } })} /></label><label>Votes minimum<input type="number" min="1" max="100" value={editor.form.minimumVotes} onChange={(event) => setEditor({ ...editor, form: { ...editor.form, minimumVotes: Number(event.target.value) } })} /></label></div><div className="actions"><button type="submit"><Gavel size={17} />Transmettre au jury</button><button type="button" className="secondary" onClick={() => setEditor(null)}>Annuler</button></div></form></Dialog>}
    {editor?.kind === "case-detail" && <Dialog title={`Dossier ${editor.case.code}`} className="tribunal-admin-dialog tribunal-case-dialog" onClose={() => setEditor(null)}><CaseDetail entry={editor.case} /><div className="actions">{editor.case.status === "awaiting-enforcement" && <button type="button" onClick={() => openDecision([editor.case])}><Gavel size={17} /> Décider</button>}<button type="button" className="secondary" onClick={() => setEditor(null)}>Fermer</button></div></Dialog>}
    {editor?.kind === "dismiss-case" && <Dialog title="Classer ce dossier ?" className="tribunal-admin-dialog" onClose={() => setEditor(null)}><p>Le vote sera interrompu et aucune sanction ni récompense ne sera distribuée.</p><div className="actions"><button type="button" className="danger" onClick={() => caseAction(editor.case, "dismiss", { note: "Dossier classé par un administrateur." })}>Confirmer le classement</button><button type="button" className="secondary" onClick={() => setEditor(null)}>Annuler</button></div></Dialog>}
    {editor?.kind === "decision" && <Dialog title={editor.caseIds.length > 1 ? `Décider pour ${editor.caseIds.length} dossiers` : "Décision humaine"} className="tribunal-admin-dialog" onClose={() => setEditor(null)}><form onSubmit={enforceDecision}><div className="tribunal-sanction-warning"><ShieldAlert /><p>La proposition issue des seuils reste modifiable. Vérifie chaque dossier avant d’appliquer une décision en série.</p></div><label>Décision<select value={editor.outcome} onChange={(event) => setEditor({ ...editor, outcome: event.target.value, days: settings.verdictRules.find((rule) => rule.outcome === event.target.value)?.defaultDays ?? 0 })}>{outcomeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{["hard-ban-review", "social-ban"].includes(editor.outcome) && <label>Durée (jours)<input type="number" min="1" max={editor.outcome === "social-ban" ? 30 : 3650} value={editor.days} onChange={(event) => setEditor({ ...editor, days: Number(event.target.value) })} /></label>}<label>Motif<input required maxLength="240" value={editor.reason} onChange={(event) => setEditor({ ...editor, reason: event.target.value })} /></label><div className="actions"><button type="submit" className={editor.outcome.includes("ban") ? "danger" : ""}><Gavel size={18} /> Appliquer la décision</button><button type="button" className="secondary" onClick={() => setEditor(null)}>Annuler</button></div></form></Dialog>}
  </div>;
}

function CaseDetail({ entry }) {
  return <div className="tribunal-case-detail"><section><span className="eyebrow">Prévenu</span><h3>{entry.accused.pseudo}</h3><p>{entry.accusedReports.total} signalement(s) par {entry.accusedReports.reporters} joueur(s) · comportement {entry.accusedBehavior.score}/100 · {entry.accusedBehavior.sanctions} sanction(s) réelle(s)</p></section><section className="tribunal-case-score-breakdown"><span>Moyenne des votes<strong>{entry.rawScore ?? "-"}</strong></span><span>Score final<strong>{entry.finalScore ?? "-"}</strong></span><span>Comportement avant<strong>{entry.behaviorBefore ?? entry.accusedBehavior.score}/100</strong></span><span>Proposition<strong>{outcomeLabels[entry.outcome] ?? "En attente"}</strong></span></section><section><span className="eyebrow">Exposé</span><p>{entry.summary}</p></section><section><span className="eyebrow">Pièces du dossier</span><div className="tribunal-admin-evidence">{entry.evidence.map((item, index) => <article key={`${item.label}-${index}`}><b>{index + 1}</b><div><strong>{item.label}</strong><p>{item.value}</p><small>{formatDate(item.occurredAt)}</small></div></article>)}</div></section></div>;
}

function CaseRow({ entry, selected = false, onSelect, onOpen, onResolve, onDismiss, onEnforce }) {
  return <article className={`tribunal-case-row status-${entry.status}`}>
    {entry.status === "awaiting-enforcement" && <label className="tribunal-case-select"><input type="checkbox" checked={selected} onChange={onSelect} /><span>Sélectionner</span></label>}
    <div className="tribunal-case-stamp"><Scale /><span>{entry.code}</span></div><div className="tribunal-case-main"><span>{statusLabels[entry.status] ?? entry.status}</span><h4>{entry.title}</h4><p>Mis en cause : <strong>{entry.accused.pseudo}</strong> · {entry.accusedReports?.total ?? entry.reportCount} signalement(s)</p><small><Clock3 size={13} /> {entry.status === "voting" ? `Clôture ${formatDate(entry.endsAt)}` : `Décision ${formatDate(entry.resolvedAt)}`}</small></div><div className="tribunal-case-result">{entry.finalScore !== null && <strong>{entry.finalScore}/5</strong>}<span>{outcomeLabels[entry.outcome] ?? `${entry.voteCount}/${entry.minimumVotes} votes`}</span></div><div className="actions"><button type="button" className="secondary" onClick={onOpen}><Eye size={16} /> Ouvrir</button>{entry.status === "voting" && entry.voteCount > 0 && <button type="button" onClick={onResolve}>Clôturer</button>}{entry.status === "awaiting-enforcement" && <button type="button" className="danger" onClick={onEnforce}>Décider</button>}{entry.status === "voting" && <button type="button" className="secondary" onClick={onDismiss}>Classer</button>}</div>
  </article>;
}
