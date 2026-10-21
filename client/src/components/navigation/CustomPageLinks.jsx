import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { readPublicPageData } from "../../seo/metadata.js";

export function CustomPageLinks() {
  const [pages, setPages] = useState(() => readPublicPageData()?.customPages ?? []);
  useEffect(() => {
    let active = true;
    const load = () => api("/api/pages", { background: true }).then(value => { if (active) setPages(value); }).catch(() => {});
    load(); window.addEventListener("ktga-pages-updated", load);
    return () => { active = false; window.removeEventListener("ktga-pages-updated", load); };
  }, []);
  return pages.filter(page => page.showFooter && !page.systemRoute).map(page => <a key={page.slug} href={appPath("page", page.slug)}>{page.footerLabel || page.title}</a>);
}
