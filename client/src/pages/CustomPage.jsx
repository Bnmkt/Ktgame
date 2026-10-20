import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { api, BASE_PATH } from "../api.js";
import { appPath } from "../navigation/routes.js";
import { useLocale } from "../locales/LocaleProvider.jsx";
import { applyPageMetadata, pageMetadata } from "../seo/metadata.js";
import { MarkdownContent } from "../components/patchnotes/MarkdownContent.jsx";
import "./custom-pages.css";

export function CustomPageContent({ page }) {
  const root = useRef(null);
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

export function CustomPage({ slug, user, accountReady = true, siteName = "KTGA.ME", initialPage }) {
  const { t } = useLocale();
  const previewId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("preview");
  const [page, setPage] = useState(() => !previewId && initialPage?.slug === slug ? initialPage : null);
  const [loading, setLoading] = useState(!page), [error, setError] = useState("");
  useEffect(() => {
    if (previewId && !accountReady) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    if (previewId && !user?.admin && !user?.editor) { setError(t("Accès réservé")); setLoading(false); return; }
    api(previewId ? `/api/admin/pages/${encodeURIComponent(previewId)}?render=1` : `/api/pages/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch(failure => { if (!controller.signal.aborted) { setPage(null); setError(failure.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, previewId, accountReady, user?.admin, user?.editor]);
  useEffect(() => {
    if (!page) return;
    const meta = pageMetadata({ pathname: appPath("page", page.slug), siteName, customPages: [{ ...page, indexable: previewId ? false : page.indexable }] });
    applyPageMetadata(meta);
  }, [page, previewId, siteName]);
  const presentation = page?.presentation ?? {};
  return <main className="app-shell custom-page" style={presentation.maxWidth ? { maxWidth: `${presentation.maxWidth}px` } : undefined}>{(presentation.showTitle !== false || presentation.showBackLink !== false) && <header className="page-heading">{presentation.showTitle !== false && <div><span className="eyebrow">{siteName}{previewId && <> · <Eye size={14}/> {t("Brouillon")}</>}</span><h1>{page?.title || t("Page personnalisée")}</h1></div>}{presentation.showBackLink !== false && <a className="secondary custom-page-back" href={appPath("lobby")}><ArrowLeft size={17}/>{t("Casino")}</a>}</header>}<section className="custom-page-surface" style={Number.isInteger(presentation.padding) ? { padding: `${presentation.padding}px` } : undefined}>{loading ? <p role="status">{t("Chargement…")}</p> : error ? <p className="error" role="alert">{t(error)}</p> : page && <CustomPageContent page={page}/>}</section></main>;
}
