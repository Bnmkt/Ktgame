import { useLocale } from "../../locales/LocaleProvider.jsx";
import { normalizeSoftBanRestrictions, softBanOptions } from "../../features/accounts/softban.js";
import "./softban-restrictions.css";

export function SoftBanRestrictions({ value, onChange, games = [], disabled = false }) {
  const { t } = useLocale();
  const selected = normalizeSoftBanRestrictions(value);
  const options = [...softBanOptions, ...games.map(game => [`game:${game.id}`, "Jeux", game.name])];
  const groups = [...new Set(options.map(([, group]) => group).filter(group => group !== "Jeux")), "Jeux"];
  return <div className="account-limit-options">{groups.map(group => <fieldset className={group === "Jeux" ? "account-limit-games" : undefined} key={group} disabled={disabled}><legend>{t(group)}</legend>{options.filter(([, category]) => category === group).map(([id, , label]) => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={event => onChange(event.target.checked ? [...new Set([...selected, id])] : selected.filter(key => key !== id))}/><span>{t(label)}</span></label>)}</fieldset>)}</div>;
}
