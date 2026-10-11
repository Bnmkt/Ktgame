import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useState } from "react";
import { AlertTriangle, Flag, ShieldCheck } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";

const categories = [
  ["harassment", "Harcèlement ou intimidation"],
  ["cheating", "Triche ou exploitation"],
  ["game-sabotage", "Sabotage d’une partie"],
  ["identity", "Pseudo ou profil inapproprié"],
  ["spam", "Spam ou sollicitations"],
  ["other", "Autre comportement"]
];

export function ReportPlayerDialog({ player, roomCode = "", onClose }) {
  const { t: localeText } = useLocale();
  const [category, setCategory] = useState("harassment");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await api("/api/tribunal/reports", { method: "POST", body: JSON.stringify({ accusedId: player.id, category, description, roomCode }) });
      setSent(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSending(false);
    }
  }

  return <Dialog title={sent ? localeText("Signalement transmis") : localeText("Signaler {value0}", { value0: player.pseudo })} className="player-report-dialog" onClose={onClose}>
    {sent ? <div className="report-success"><ShieldCheck size={36} /><strong>{localeText("Le signalement a été enregistré.")}</strong><p>{localeText("Il restera confidentiel et sera d’abord vérifié avant toute présentation au tribunal.")}</p><button type="button" onClick={onClose}>{localeText("Fermer")}</button></div> : <form onSubmit={submit}>
      <div className="report-privacy-note"><Flag size={20} /><div><strong>{localeText("Décris uniquement les faits observés")}</strong><span>{localeText("Le joueur signalé ne verra ni ton identité ni ton texte brut. Les abus de signalement peuvent être sanctionnés.")}</span></div></div>
      <label>{localeText("Motif")}<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{localeText(label)}</option>)}</select></label>
      <label>{localeText("Faits observés")}<textarea required minLength={20} maxLength={1200} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={localeText("Décris ce qui s’est passé, quand et dans quel contexte.")} /><small>{description.length}{localeText("/1200 caractères")}</small></label>
      {roomCode && <div className="report-room-context"><ShieldCheck size={17} /><span>{localeText("La table") + " "}{roomCode}{" " + localeText("sera jointe comme contexte vérifié.")}</span></div>}
      {error && <div className="error"><AlertTriangle size={17} /> {localeText(error)}</div>}
      <div className="actions"><button type="submit" disabled={sending || description.trim().length < 20}><Flag size={17} />{sending ? localeText("Transmission…") : localeText("Envoyer le signalement")}</button><button type="button" className="secondary" onClick={onClose}>{localeText("Annuler")}</button></div>
    </form>}
  </Dialog>;
}
