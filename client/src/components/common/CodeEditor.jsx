import { lazy, Suspense } from "react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
const Editor = lazy(() => import("./CodeEditorImpl.jsx"));
export { sourceLanguage } from "./code-files.js";

export function CodeEditor(props) {
  const { t } = useLocale();
  return <Suspense fallback={<div className="code-field-loading" role="status">{t("Chargement de l’éditeur…")}</div>}><Editor {...props}/></Suspense>;
}
