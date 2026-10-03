import { useId, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import "./password-field.css";

export function PasswordField({ label, value, onChange, blockClipboard = false, feedback, ...inputProps }) {
  const generatedId = useId();
  const id = inputProps.id ?? `secret-${generatedId.replaceAll(":", "")}`;
  const [visible, setVisible] = useState(false);
  const [clipboardError, setClipboardError] = useState("");
  const preventClipboard = (event) => {
    if (!blockClipboard) return;
    event.preventDefault();
    setClipboardError("Le copier-coller n’est pas autorisé à l’inscription.");
  };
  const description = [inputProps["aria-describedby"], feedback ? `${id}-match` : "", clipboardError ? `${id}-clipboard` : ""].filter(Boolean).join(" ");
  return <div className="secret-field">
    <label htmlFor={id}>{label}</label>
    <div className="secret-field-control">
      <input {...inputProps} id={id} type={visible ? "text" : "password"} value={value} aria-describedby={description || undefined} aria-invalid={feedback ? !feedback.matches : inputProps["aria-invalid"]} onChange={(event) => { setClipboardError(""); onChange(event); }} onCopy={preventClipboard} onCut={preventClipboard} onPaste={preventClipboard} onDrop={preventClipboard} onBeforeInput={(event) => { if (["insertFromPaste", "insertFromDrop", "deleteByCut"].includes(event.nativeEvent.inputType)) preventClipboard(event); }} />
      <button type="button" className="secret-eye" data-request-feedback="state" disabled={inputProps.disabled} title={`${visible ? "Masquer" : "Afficher"} : ${label}`} aria-label={`${visible ? "Masquer" : "Afficher"} : ${label}`} aria-pressed={visible} onPointerDown={(event) => event.preventDefault()} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
    </div>
    {feedback && <small id={`${id}-match`} className={`secret-match ${feedback.matches ? "is-match" : "is-different"}`} role="status">{feedback.matches ? <Check size={15} /> : <X size={15} />}{feedback.matches ? "Les mots de passe correspondent." : "Les mots de passe ne correspondent pas."}</small>}
    {clipboardError && <small id={`${id}-clipboard`} className="secret-clipboard-message" role="status">{clipboardError}</small>}
  </div>;
}
