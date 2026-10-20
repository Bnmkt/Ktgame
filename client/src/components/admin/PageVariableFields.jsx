import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { MediaPicker } from "./MediaLibrary.jsx";

export function PageVariableFields({ fields = [], values = {}, onChange, disabled = false }) {
  const { t } = useLocale();
  const [imageField, setImageField] = useState(null);
  const set = (field, value) => onChange({ ...values, [field.key]: value });
  return <div className="page-variable-fields">{fields.map(field => {
    const value = values[field.key] ?? field.defaultValue ?? "";
    return <label key={field.key} className={field.type === "boolean" ? "custom-page-check" : ""}><span>{field.label}{field.required ? " *" : ""}</span>{field.type === "boolean" ? <input type="checkbox" disabled={disabled} checked={value === true} onChange={event => set(field, event.target.checked)}/> : field.type === "textarea" ? <textarea rows={4} maxLength={20000} disabled={disabled} value={value} onChange={event => set(field, event.target.value)}/> : field.type === "select" ? <select disabled={disabled} value={value} onChange={event => set(field, event.target.value)}><option value="">{t("Choisir")}</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select> : field.type === "image" ? <span className="page-variable-image"><input type="text" maxLength={2048} disabled={disabled} value={value} onChange={event => set(field, event.target.value)}/><button type="button" className="secondary icon-toggle" disabled={disabled} title={t("Choisir dans la médiathèque")} aria-label={t("Choisir dans la médiathèque")} onClick={() => setImageField(field)}><ImagePlus size={18}/></button></span> : <input type={field.type === "number" ? "number" : field.type === "color" ? "color" : "text"} step={field.type === "number" ? "any" : undefined} maxLength={4000} disabled={disabled} value={field.type === "color" && !value ? "#ffffff" : value} onChange={event => set(field, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}/>}<small><code>{`{{${field.key}}}`}</code>{field.help ? ` · ${field.help}` : ""}</small></label>;
  })}{imageField && <MediaPicker onClose={() => setImageField(null)} onSelect={image => { set(imageField, image.image); setImageField(null); }}/>}</div>;
}
