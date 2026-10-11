import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Gift, Plus, Trash2 } from "lucide-react";
import { AchievementValuePicker, itemChoices } from "./AchievementValuePicker.jsx";

export function AchievementRewards({ value = {}, onChange, shop = [], games = [] }) {
  const { t: localeText } = useLocale();
  const rewards = { itemIds: value.itemIds ?? [], xp: value.xp ?? [] };
  const updateXp = (index, next) => onChange({ ...rewards, xp: rewards.xp.map((row, i) => i === index ? { ...row, ...next } : row) });
  const available = games.filter((game) => !rewards.xp.some((row) => row.gameId === game.id));
  return <section className="admin-form-section"><div className="admin-form-section-title"><Gift /><div><h3>{localeText("Récompenses")}</h3><p>{localeText("Attribuées une seule fois au déblocage. Les objets déjà possédés ne sont pas ajoutés en double.")}</p></div></div>
    <label>{localeText("Objets offerts")}<AchievementValuePicker choices={itemChoices(shop)} value={rewards.itemIds} multiple allowEmpty emptyLabel={localeText("Aucun objet")} label={localeText("Choisir les objets offerts")} onChange={(itemIds) => onChange({ ...rewards, itemIds })} /></label>
    <div className="xp-title-list">{rewards.xp.map((row, index) => <div key={index}><label>{localeText("XP")}<input aria-label={localeText("XP récompense {value0}", { value0: index + 1 })} required type="number" min={1} max={1000000} value={row.amount} onChange={(event) => updateXp(index, { amount: Number(event.target.value) })} /></label><label>{localeText("Jeu")}<select aria-label={localeText("Jeu récompense {value0}", { value0: index + 1 })} value={row.gameId} onChange={(event) => updateXp(index, { gameId: event.target.value })}>{games.filter((game) => game.id === row.gameId || available.some((entry) => entry.id === game.id)).map((game) => <option key={game.id} value={game.id}>{localeText(game.name)}</option>)}</select></label><button type="button" className="secondary icon-toggle danger-icon" title={localeText("Retirer la récompense XP")} onClick={() => onChange({ ...rewards, xp: rewards.xp.filter((_, i) => i !== index) })}><Trash2 size={17} /></button></div>)}</div>
    <button type="button" className="secondary" disabled={!available.length} onClick={() => onChange({ ...rewards, xp: [...rewards.xp, { gameId: available[0].id, amount: 100 }] })}><Plus size={17} />{localeText("Ajouter une récompense XP")}</button>
  </section>;
}
