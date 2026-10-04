import { useEffect, useId, useRef, useState } from "react";
import { localDateTime, localDateTimeToIso } from "../../utils/dates.js";

export function DateTimeInput({ value, onValueChange, storage = "iso", ...props }) {
  const id = useId();
  const input = useRef(null);
  const [text, setText] = useState(() => storage === "local" ? value || "" : localDateTime(value));
  const [error, setError] = useState("");
  useEffect(() => { setText(storage === "local" ? value || "" : localDateTime(value)); setError(""); input.current?.setCustomValidity(""); }, [value, storage]);
  return <><input {...props} ref={input} type="datetime-local" step={60} value={text} aria-invalid={error ? true : undefined} aria-describedby={[props["aria-describedby"], error ? id : ""].filter(Boolean).join(" ") || undefined} onChange={(event) => {
    const selected = event.target.value;
    setText(selected);
    const iso = localDateTimeToIso(selected, storage === "iso" ? value : "");
    const message = selected && !iso ? "Cette heure n’existe pas dans ton fuseau (changement d’heure). Choisis une autre heure." : "";
    event.target.setCustomValidity(message);
    setError(message);
    if (!message) onValueChange(storage === "local" ? selected : iso);
  }} />{error && <small id={id} className="error-text" role="alert">{error}</small>}</>;
}
