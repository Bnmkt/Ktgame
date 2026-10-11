import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useState } from "react";
import { Users } from "lucide-react";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";

export function BeloteTeams({ room, userId, onChange }) {
  const { t: localeText } = useLocale();
  const [busy, setBusy] = useState(false);
  const seats = room.beloteSeats ?? room.players.map((player) => player.id);
  async function choose(playerId, team) {
    if (busy) return;
    setBusy(true);
    try { await onChange(playerId, team); } finally { setBusy(false); }
  }
  return <section className="belote-team-picker" aria-label={localeText("Choix des équipes")}><h2><Users size={21} />{" " + localeText("Équipes de belote")}</h2><div className="belote-team-columns">{[0, 1].map((team) => <section className={`belote-team-choice team-${team}`} key={team}><h3><i />{localeText("Équipe") + " "}{team === 0 ? localeText("bleue") : localeText("rouge")}<small>{[team, team + 2].filter((index) => seats[index]).length} / 2</small></h3>{[team, team + 2].map((seat) => {
    const player = room.players.find((entry) => entry.id === seats[seat]);
    return <div className="belote-lobby-seat" key={seat}>{player ? <><DisplayName user={player} /><label><span className="sr-only">{localeText("Équipe de") + " "}{player.pseudo}</span><select aria-label={localeText("Équipe de {value0}", { value0: player.pseudo })} disabled={busy || (room.ownerId !== userId && player.id !== userId)} value={team} onChange={(event) => choose(player.id, Number(event.target.value))}><option value={0}>{localeText("Bleue")}</option><option value={1}>{localeText("Rouge")}</option></select></label></> : <><span>{localeText("Place libre")}</span><button type="button" className="secondary" disabled={busy || seats.indexOf(userId) % 2 === team} onClick={() => choose(userId, team)}>{localeText("Choisir")}</button></>}</div>;
  })}</section>)}</div></section>;
}
