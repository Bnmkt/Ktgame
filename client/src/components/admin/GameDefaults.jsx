import { Settings } from "lucide-react";
import { gameModifierDefinitions } from "../../features/games/config.js";

const battleFields = [
  { key: "pileMode", type: "select", label: "Plateau", defaultValue: "double", options: [["single", "Pile simple"], ["double", "Pile double"]] },
  { key: "scoringMode", type: "select", label: "Calcul de la confrontation", defaultValue: "high-card", options: [["high-card", "Hauteur de carte"], ["pile-sum", "Addition des piles"], ["poker-combo", "Combo Poker"]] },
  { key: "returnAfterRounds", type: "range", label: "Retour des cartes isolees (manches)", defaultValue: 3, min: 3, max: 20 },
  { key: "hiddenDeck", type: "toggle", label: "Pioche cachee", defaultValue: false }
];

export function GameDefaults({ game, onChange }) {
  const fields = game.id === "bataille" ? battleFields : gameModifierDefinitions[game.id] ?? [];
  if (!fields.length) return null;
  const value = game.defaultModifiers ?? {};
  const change = (key, next) => onChange({ ...value, [key]: next });
  return <section className="admin-form-section game-default-settings">
    <div className="admin-form-section-title"><Settings /><div><h3>Parametres par defaut des tables</h3><p>Appliques aux nouvelles tables. Leurs maitres peuvent ensuite les ajuster en salle d'attente.</p></div></div>
    <div className="admin-field-grid">{fields.filter((field) => field.type !== "toggle").map((field) => <label key={field.key}>{field.label}
      {field.type === "select" ? <select aria-label={field.label} value={value[field.key] ?? field.defaultValue} onChange={(event) => change(field.key, event.target.value)}>{field.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select> : <input aria-label={field.label} required type="number" min={field.min} max={field.max} step="1" value={value[field.key] ?? field.defaultValue} onChange={(event) => change(field.key, event.target.value === "" ? "" : Number(event.target.value))} />}
      {field.help && <small className="field-help">{field.help}</small>}
    </label>)}</div>
    <div className="admin-toggle-row">{fields.filter((field) => field.type === "toggle").map((field) => <label key={field.key}><input type="checkbox" checked={value[field.key] ?? field.defaultValue} onChange={(event) => change(field.key, event.target.checked)} /><span>{field.label}{field.help && <small className="field-help">{field.help}</small>}</span></label>)}</div>
  </section>;
}
