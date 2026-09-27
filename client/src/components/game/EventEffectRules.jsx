import { eventEffectDescription, eventEffectRules } from "../../features/events/effect-rules.js";

export function EventEffectRules({ game }) {
  const rows = eventEffectRules(game);
  return <section className="event-effect-rules"><h3>{game.type === "dice" ? "Effets des dés et combinaisons" : "Effets des cartes"}</h3>
    {!rows.length ? <p>Aucun effet supplémentaire configuré.</p> : <dl>{rows.map((row) => <div key={row.key}><dt><strong>{row.label}</strong><small>{row.condition}</small></dt><dd>{row.effects.length ? <ul>{row.effects.map((effect, index) => <li key={effect.id ?? index}>{effect.label && <strong>{effect.label} : </strong>}{eventEffectDescription(effect)}</li>)}</ul> : "Aucun effet supplémentaire"}</dd></div>)}</dl>}
  </section>;
}
