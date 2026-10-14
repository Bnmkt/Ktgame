import { Settings } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { gameModifierDefinitions } from "../../features/games/config.js";
import { CompactNumber } from "../../utils/presentation.jsx";

export function WaitingTableSettings({ room, isOwner, onEdit }) {
  const { t } = useLocale();
  const fields = gameModifierDefinitions[room.gameId] ?? [];
  function value(field) {
    const current = room.gameModifiers?.[field.key] ?? field.defaultValue;
    return field.type === "toggle" ? t(current ? "Activé" : "Désactivé") : field.type === "select" ? t(field.options.find(([key]) => key === current)?.[1] ?? String(current)) : String(current);
  }
  return <section className="room-setup-summary" aria-label={t("Paramètres de la table")}><header><h2><Settings size={18}/>{t("Paramètres de la table")}</h2><button type="button" className="secondary" onClick={onEdit}><Settings size={16}/>{t(isOwner ? "Modifier" : "Consulter")}</button></header><dl>
    {!room.ranked && <div><dt>{t(room.gameId === "texas-holdem" ? "Cave par joueur" : "Mise par joueur")}</dt><dd><CompactNumber value={room.stake}/></dd></div>}
    <div><dt>{t("Joueurs")}</dt><dd>{room.minPlayers} - {room.maxPlayers}</dd></div>
    <div><dt>{t("Niveaux admis")}</dt><dd>{room.minLevel ?? 1} - {room.maxLevel ?? t("Sans limite")}</dd></div>
    {room.gameId === "texas-holdem" && <div><dt>{t("Grosse blinde")}</dt><dd><CompactNumber value={room.pokerBlinds?.bigBlind ?? 0}/></dd></div>}
    {fields.slice(0, 3).map(field => <div key={field.key}><dt>{t(field.label)}</dt><dd>{value(field)}</dd></div>)}
  </dl>{fields.length > 3 && <details><summary>{t("Autres paramètres")}</summary><dl>{fields.slice(3).map(field => <div key={field.key}><dt>{t(field.label)}</dt><dd>{value(field)}</dd></div>)}</dl></details>}</section>;
}
