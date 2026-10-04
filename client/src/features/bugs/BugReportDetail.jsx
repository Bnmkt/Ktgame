import { useEffect, useState } from "react";
import { API_URL, getToken } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { bugReceipt } from "./BugReportProvider.jsx";
import { MarkdownContent } from "../../components/patchnotes/MarkdownContent.jsx";

export const issueDate = (value) => new Date(value).toLocaleString("fr-BE", { dateStyle: "medium", timeStyle: "short" });
export function BugImage({ image, reportId }) {
  const [url, setUrl] = useState(""), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl;
    setFailed(false); setUrl("");
    fetch(`${API_URL}/api/bugs/images/${image.id}`, { credentials: "include", signal: controller.signal, headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(bugReceipt(reportId) ? { "X-Bug-Receipt": bugReceipt(reportId) } : {}) } }).then((response) => { if (!response.ok) throw new Error(); return response.blob(); }).then((blob) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.id, reportId]);
  return failed ? <p>Capture indisponible.</p> : url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Capture du signalement" loading="lazy" /></a> : <span role="status">Chargement de la capture…</span>;
}
export function BugReportDetail({ report, metadata, showPrivate = report.privateView }) {
  const section = (title, text) => <section className="issue-text-section"><h3>{title}</h3>{text && title === "Description" ? <MarkdownContent inlineImages={false}>{text}</MarkdownContent> : <p className={text ? "issue-prewrap" : "issue-muted"}>{text || "Non renseigné."}</p>}</section>;
  return <>
    <div className="issue-badges"><span className={`issue-state issue-state-${report.status}`}>{metadata?.statuses?.[report.status] ?? report.status}</span><span>{metadata?.priorities?.[report.priority] ?? report.priority}</span><span>{metadata?.categories?.[report.category] ?? report.category}</span><time dateTime={report.createdAt}>{issueDate(report.createdAt)}</time></div>
    {!showPrivate && report.awaitingReview ? <p className="issue-privacy-note">Ce signalement a été reçu. Son contenu attend une relecture avant publication.</p> : <>{section("Description", report.description)}<div className="issue-fields">{section("Résultat attendu", report.expected)}{section("Résultat obtenu", report.actual)}</div>{section("Étapes pour reproduire", report.steps)}</>}
    {showPrivate && <><p className="issue-muted">Fréquence : {metadata?.frequencies?.[report.frequency]} · Impact : {metadata?.impacts?.[report.impact]}</p><section className="issue-text-section"><h3>Contexte privé</h3>{Object.values(report.context ?? {}).some(Boolean) ? <dl className="issue-context-list">{Object.entries(report.context).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{{ page: "Page", zone: "Zone", game: "Jeu", match: "Partie", room: "Salon", event: "Événement", other: "Autre" }[key]}</dt><dd>{value}</dd></div>)}</dl> : <p className="issue-muted">Non renseigné.</p>}</section>{report.diagnostics && <details className="issue-diagnostic"><summary>Diagnostic privé · {report.diagnostics.browser} / {report.diagnostics.system}</summary><dl className="issue-context-list">{Object.entries(report.diagnostics).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><p>Écran : {report.diagnostics.resolution?.width} × {report.diagnostics.resolution?.height} · Fenêtre : {report.diagnostics.viewport?.width} × {report.diagnostics.viewport?.height}</p>{["javascript", "api", "websocket"].map((kind) => <section key={kind}><h4>{{ javascript: "JavaScript", api: "API", websocket: "WebSocket" }[kind]}</h4>{report.diagnostics[kind]?.length ? <ul>{report.diagnostics[kind].map((entry, index) => <li key={index}><time>{issueDate(entry.at)}</time> · {[entry.code, entry.file, entry.line ? `ligne ${entry.line}` : "", entry.method, entry.route, entry.status].filter(Boolean).join(" · ")}</li>)}</ul> : <p>Aucune erreur recueillie.</p>}</section>)}</details>}</>}
    {report.images?.length > 0 && <section className="issue-text-section"><h3>Captures</h3><div className="issue-image-grid">{report.images.map((image) => <figure key={image.id}><BugImage image={image} reportId={report.id} />{showPrivate && <figcaption>{image.visible ? "Publiée" : "Privée"}</figcaption>}</figure>)}</div></section>}
    {report.links?.length > 0 && <section className="issue-text-section"><h3>Bugs associés</h3><ul className="issue-linked-list">{report.links.map((link) => <li key={`${link.sourceId}-${link.targetId}-${link.type}`}><span>{link.direction === "incoming" && ["duplicate", "depends_on"].includes(link.type) ? link.type === "duplicate" ? "A pour doublon" : "Requis par" : metadata?.relations?.[link.type]}</span><a href={appPath("bugs", link.id)}>BUG {link.id} · {link.title}</a></li>)}</ul></section>}
  </>;
}
