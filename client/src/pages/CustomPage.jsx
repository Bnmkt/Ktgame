import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { api, BASE_PATH } from "../api.js";
import { appPath } from "../navigation/routes.js";
import { useLocale } from "../locales/LocaleProvider.jsx";
import { applyPageMetadata, pageMetadata } from "../seo/metadata.js";
import { MarkdownContent } from "../components/patchnotes/MarkdownContent.jsx";
import { PublicGamesOverview } from "./PublicGamesPage.jsx";
import "./custom-pages.css";

export function CustomPageContent({ page }) {
  const root = useRef(null);
  const { t } = useLocale();
  useEffect(() => {
    if (!page.systemRoute || page.format !== "html") return;
    const content = root.current?.querySelector(".custom-page-html");
    if (!content) return;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT), originals = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest("style,script,pre,code")) continue;
      const original = node.textContent, key = original.trim(), translated = key && t(key);
      if (translated && translated !== key) { originals.push([node, original]); node.textContent = original.replace(key, translated); }
    }
    return () => { for (const [node, text] of originals) node.textContent = text; };
  }, [page.systemRoute, page.format, page.html, t]);
  useEffect(() => {
    const element = root.current;
    if (!page.scriptUrl) return;
    const script = document.createElement("script");
    script.src = `${window.location.pathname.startsWith("/discord-activity/") ? "/discord-activity" : BASE_PATH}${page.scriptUrl}`;
    element.appendChild(script);
    return () => { element.dispatchEvent(new Event("ktga-page-dispose")); script.remove(); };
  }, [page.scriptUrl, page.html, page.content]);
  return <div ref={root} className="custom-page-runtime">{page.style && <style>{`@scope (.custom-page-runtime) {\n${page.style}\n}`}</style>}{page.format === "html" ? <div className="custom-page-content custom-page-html" dangerouslySetInnerHTML={{ __html: page.html || "" }}/> : <MarkdownContent className="custom-page-content">{page.content || ""}</MarkdownContent>}</div>;
}

export function CustomPage({ slug, systemRoute = "", games = [], fallback, user, accountReady = true, siteName = "KTGA.ME", initialPage }) {
  const { t } = useLocale();
  const previewId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("preview");
  const [page, setPage] = useState(() => !previewId && initialPage && (systemRoute ? initialPage.systemRoute === systemRoute : initialPage.slug === slug) ? initialPage : null);
  const [loading, setLoading] = useState(!page), [error, setError] = useState(""), [missing, setMissing] = useState(false);
  useEffect(() => {
    if (previewId && !accountReady) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setMissing(false);
    if (previewId && !user?.admin && !user?.editor) { setError(t("Accès réservé")); setLoading(false); return; }
    api(previewId ? `/api/admin/pages/${encodeURIComponent(previewId)}?render=1` : systemRoute ? `/api/page-content?path=${encodeURIComponent(systemRoute)}` : `/api/pages/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch(failure => { if (!controller.signal.aborted) { setPage(null); setError(failure.message); setMissing(failure.status === 404); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, systemRoute, previewId, accountReady, user?.admin, user?.editor]);
  useEffect(() => {
    if (!page) return;
    const meta = pageMetadata({ pathname: appPath("page", page.slug), siteName, customPages: [{ ...page, indexable: previewId ? false : page.indexable }] });
    applyPageMetadata(meta);
  }, [page, previewId, siteName]);
  useEffect(() => {
    if (!page?.systemRoute || !window.location.hash) return;
    try {
      const fragment = decodeURIComponent(window.location.hash.slice(1));
      if (!document.getElementById(fragment)) document.getElementById(`cp-${fragment}`)?.scrollIntoView();
    } catch { /* Ignore malformed URL fragments. */ }
  }, [page]);
  const presentation = page?.presentation ?? {};
  if (!loading && missing && fallback) return fallback;
  return <main className="app-shell custom-page" style={presentation.maxWidth ? { maxWidth: `${presentation.maxWidth}px` } : undefined}>{(presentation.showTitle !== false || presentation.showBackLink !== false) && <header className="page-heading">{presentation.showTitle !== false && <div><span className="eyebrow">{siteName}{previewId && <> · <Eye size={14}/> {t("Brouillon")}</>}</span><h1>{page?.title ? page.systemRoute ? t(page.title) : page.title : t("Page personnalisée")}</h1></div>}{presentation.showBackLink !== false && <a className="secondary custom-page-back" href={appPath("lobby")}><ArrowLeft size={17}/>{t("Casino")}</a>}</header>}<section className="custom-page-surface" style={Number.isInteger(presentation.padding) ? { padding: `${presentation.padding}px` } : undefined}>{loading && !page ? <p role="status">{t("Chargement…")}</p> : error ? <p className="error" role="alert">{t(error)}</p> : page && <><CustomPageContent page={page}/>{page.systemRoute === "/jeux" && <PublicGamesOverview games={games} siteName={siteName}/>}</>}</section></main>;
}
