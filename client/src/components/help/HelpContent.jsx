import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, HelpCircle, Search } from "lucide-react";
import { api, API_URL, BASE_PATH } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import { appPath } from "../../navigation/routes.js";
import "./help.css";

export function helpImageUrl(image) {
  if (!image) return "";
  if (image.startsWith("/api/help/images/")) return `${API_URL}${image}`;
  if (/^\/guides\/[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg|webp|gif)$/.test(image) && !image.includes("..")) return `${BASE_PATH}${image}`;
  return "";
}

export function HelpArticle({ entry }) {
  const image = helpImageUrl(entry.image);
  return <><MarkdownContent inlineImages={false}>{entry.body}</MarkdownContent>{image && <figure className="player-help-figure"><a href={image} target="_blank" rel="noopener noreferrer" aria-label={`Agrandir : ${entry.imageAlt || entry.title}`}><img src={image} alt={entry.imageAlt || entry.title} loading="lazy" /></a>{entry.imageAlt && <figcaption>{entry.imageAlt}</figcaption>}</figure>}</>;
}

export function WelcomeGuide({ document, onClose }) {
  const steps = document.entries.filter((entry) => entry.kind === "guide");
  const [index, setIndex] = useState(0);
  const current = steps[Math.min(index, steps.length - 1)];
  if (!current) return null;
  return <Dialog title={document.title} className="player-help-welcome" onClose={onClose}>
    <div className="player-help-step-head"><span>{current.category}</span><strong>{index + 1} / {steps.length}</strong></div>
    <progress value={index + 1} max={steps.length} aria-label="Avancement du guide" />
    <div className="player-help-step-body" key={current.id}><h3>{current.title}</h3><HelpArticle entry={current} /></div>
    <nav className="player-help-step-dots" aria-label="Étapes du guide">{steps.map((entry, position) => <button type="button" key={entry.id} className={position === index ? "active" : ""} onClick={() => setIndex(position)} title={entry.title} aria-label={`Étape ${position + 1} : ${entry.title}`} aria-current={position === index ? "step" : undefined}>{position + 1}</button>)}</nav>
    <div className="player-help-step-controls"><button type="button" className="secondary" onClick={onClose}>Plus tard</button><div><button type="button" className="secondary" disabled={index === 0} onClick={() => setIndex((value) => value - 1)} aria-label="Étape précédente" title="Étape précédente"><ArrowLeft size={18} /></button><button type="button" onClick={index === steps.length - 1 ? onClose : () => setIndex((value) => value + 1)}>{index === steps.length - 1 ? <Check size={18} /> : <ArrowRight size={18} />}{index === steps.length - 1 ? "Terminer" : "Continuer"}</button></div></div>
  </Dialog>;
}


export function HelpPage({ mode = "faq", siteName, onBack }) {
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [welcome, setWelcome] = useState(false);
  const [active, setActive] = useState("");
  useEffect(() => {
    let cancelled = false;
    api("/api/help").then((content) => { if (!cancelled) setDocument(content); }).catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, []);
  const entries = document?.entries.filter((entry) => entry.kind === mode) ?? [];
  const categories = [...new Set(entries.map((entry) => entry.category))];
  const filtered = entries.filter((entry) => (category === "all" || category === entry.category) && `${entry.title} ${entry.body}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
  const key = filtered.map((entry) => entry.id).join(":");
  useEffect(() => {
    if (mode !== "guide") return;
    const observer = new IntersectionObserver((records) => {
      const visible = records.filter((record) => record.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.dataset.helpEntry);
    }, { rootMargin: "-10% 0px -55% 0px" });
    document && window.document.querySelectorAll("[data-help-entry]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [mode, key, document]);
  return <main className="app-shell player-help-page">
    <header className="page-heading"><div><span className="eyebrow">{siteName} · Aide aux joueurs</span><h1>{mode === "faq" ? "Questions fréquentes" : "Guide du joueur"}</h1></div><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={17} />Casino</button></header>
    <section className="player-help-surface">
      <nav className="player-help-navigation" aria-label="Aide"><a href={appPath("faq")} className={mode === "faq" ? "active" : ""}><HelpCircle size={18} />FAQ</a><a href={appPath("guide")} className={mode === "guide" ? "active" : ""}><BookOpen size={18} />Tutos et guide</a>{entries.length > 0 && mode === "guide" && <button type="button" className="secondary" onClick={() => setWelcome(true)}><BookOpen size={17} />Ouvrir le guide d’accueil</button>}</nav>
      {error && <p className="error" role="alert">{error}</p>}
      {!document && !error && <p role="status">Chargement de l’aide…</p>}
      {document && <><div className="player-help-filters"><label><span className="sr-only">Rechercher dans l’aide</span><span><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une question ou un sujet" /></span></label><label><span className="sr-only">Rubrique</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Toutes les rubriques</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label></div>
        {mode === "guide" && document.intro && <p className="player-help-intro">{document.intro}</p>}
        <div className={mode === "guide" ? "player-help-guide-layout" : "player-help-questions"}>
          {mode === "guide" && <aside className="player-help-contents"><h2>Sommaire</h2><nav>{filtered.map((entry, position) => <a key={entry.id} className={active === entry.id ? "active" : ""} href={`#help-${entry.id}`} onClick={() => setActive(entry.id)}><span>{String(position + 1).padStart(2, "0")}</span>{entry.title}</a>)}</nav></aside>}
          <div>{filtered.map((entry, position) => mode === "faq" ? <details className="player-help-question" key={entry.id}><summary><span><small>{entry.category}</small><strong>{entry.title}</strong></span><HelpCircle size={19} /></summary><div><HelpArticle entry={entry} /></div></details> : <section key={entry.id} id={`help-${entry.id}`} data-help-entry={entry.id} className="player-help-chapter"><header><span>{String(position + 1).padStart(2, "0")} · {entry.category}</span><h2>{entry.title}</h2></header><HelpArticle entry={entry} /></section>)}{!filtered.length && <p className="empty-state">Aucune rubrique ne correspond à cette recherche.</p>}</div>
        </div></>}
    </section>
    {welcome && <WelcomeGuide document={document} onClose={() => setWelcome(false)} />}
  </main>;
}
