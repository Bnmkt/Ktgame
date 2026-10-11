import { useLocale } from "../../locales/LocaleProvider.jsx";
import { eventEffectDescription, eventEffectRules } from "../../features/events/effect-rules.js";

export function EventEffectRules({ game }) {
  const { t: localeText } = useLocale();
  const rows = eventEffectRules(game);
  return <section className="event-effect-rules"><h3>{game.type === "dice" ? localeText("Effets des dés et combinaisons") : localeText("Effets des cartes")}</h3>
    {!rows.length ? <p>{localeText("Aucun effet supplémentaire configuré.")}</p> : <dl>{rows.map((row) => <div key={row.key}><dt><strong>{localeText(row.label)}</strong><small>{row.condition}</small></dt><dd>{row.effects.length ? <ul>{row.effects.map((effect, index) => <li key={effect.id ?? index}>{effect.label && <strong>{localeText(effect.label)} : </strong>}{eventEffectDescription(effect)}</li>)}</ul> : localeText("Aucun effet supplémentaire")}</dd></div>)}</dl>}
  </section>;
}
