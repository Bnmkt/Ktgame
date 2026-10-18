import { useState } from "react";
import { AlertTriangle, Clock3, Coins, Gift, ImagePlus, Landmark, Megaphone, Palette, Search, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { matchingSettings } from "./settings-navigation.js";

const icons = { identity: Landmark, branding: ImagePlus, theme: Palette, notice: Megaphone, access: Users, editing: ShieldCheck, moderation: ShieldCheck, economy: Coins, bonus: Gift, progression: TrendingUp, pacing: Clock3, maintenance: AlertTriangle };

export function SettingsDirectory({ section, onNavigate }) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const visible = matchingSettings(search), groups = [...new Set(visible.map(row => row.group))];
  return <aside className="settings-directory">
    <label className="settings-directory-search"><Search size={16}/><input type="search" aria-label={t("Rechercher un paramètre")} placeholder={t("Rechercher...")} value={search} onChange={event => setSearch(event.target.value)}/></label>
    <label className="settings-mobile-category">{t("Rubrique")}<select aria-label={t("Rubrique des paramètres")} value={section} onChange={event => onNavigate(event.target.value)}>{!visible.some(row => row.id === section) && <option value={section} disabled>{t("Choisir une rubrique")}</option>}{groups.map(group => <optgroup key={group} label={t(group)}>{visible.filter(row => row.group === group).map(row => <option key={row.id} value={row.id}>{t(row.title)}</option>)}</optgroup>)}</select></label>
    <nav aria-label={t("Catégories des paramètres")}>{groups.map(group => <section key={group}><h3>{t(group)}</h3>{visible.filter(row => row.group === group).map(row => { const Icon = icons[row.id]; return <button key={row.id} type="button" className={`secondary ${section === row.id ? "active" : ""}`} aria-current={section === row.id ? "page" : undefined} onClick={() => onNavigate(row.id)}><Icon size={17}/><span>{t(row.title)}</span></button>; })}</section>)}</nav>
    {!visible.length && <p>{t("Aucun paramètre trouvé.")}</p>}
  </aside>;
}
