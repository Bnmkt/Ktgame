import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { applyVariableLines, variableLines, applyPageVariableLines, pageVariableLines } from "../../features/pages/variable-lines.js";

export function TemplateVariablesBulk({ fields, onChange, value: source, onTextChange: setSource, disabled, values = {}, mode = "definitions" }) {
  const { t } = useLocale();
  const serialize = next => mode === "values" ? pageVariableLines(fields, next) : variableLines(next);
  const serialized = mode === "values" ? serialize(values) : serialize(fields);
  const [error, setError] = useState("");
  const pending = source !== serialized;
  return <section className="page-template-bulk"><label>{t("Variables en bloc")}<textarea rows={12} maxLength={600000} spellCheck={false} disabled={disabled} value={source} onChange={event => { setSource(event.target.value); setError(""); }} placeholder={'{nom_variable} : valeur\n{message} : Bienvenue sur KTGA'}/></label><div className="custom-pages-actions"><button type="button" disabled={disabled || !pending} onClick={() => { try { const next = mode === "values" ? applyPageVariableLines(source, fields, values) : applyVariableLines(source, fields); onChange(next); setSource(serialize(next)); setError(""); } catch (failure) { setError(failure.message); } }}><Check size={17}/>{t("Ajouter / mettre à jour")}</button><button type="button" className="secondary" disabled={disabled || !pending} onClick={() => { setSource(serialized); setError(""); }}><RotateCcw size={17}/>{t("Annuler la saisie")}</button>{pending && <small role="status">{t("Modifications à appliquer")}</small>}</div>{error && <p className="error" role="alert">{t(error)}</p>}</section>;
}
