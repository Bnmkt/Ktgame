import { useState } from "react";
import { Users } from "lucide-react";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";

export function BeloteTeams({ room, userId, onChange }) {
  const [busy, setBusy] = useState(false);
  const seats = room.beloteSeats ?? room.players.map((player) => player.id);
  async function choose(playerId, team) {
    if (busy) return;
    setBusy(true);
    try { await onChange(playerId, team); } finally { setBusy(false); }
  }
  return <section className="belote-team-picker" aria-label="Choix des équipes"><h2><Users size={21} /> Équipes de belote</h2><div className="belote-team-columns">{[0, 1].map((team) => <section className={`belote-team-choice team-${team}`} key={team}><h3><i />Équipe {team === 0 ? "bleue" : "rouge"}<small>{[team, team + 2].filter((index) => seats[index]).length} / 2</small></h3>{[team, team + 2].map((seat) => {
    const player = room.players.find((entry) => entry.id === seats[seat]);
    return <div className="belote-lobby-seat" key={seat}>{player ? <><DisplayName user={player} /><label><span className="sr-only">Équipe de {player.pseudo}</span><select aria-label={`Équipe de ${player.pseudo}`} disabled={busy || (room.ownerId !== userId && player.id !== userId)} value={team} onChange={(event) => choose(player.id, Number(event.target.value))}><option value={0}>Bleue</option><option value={1}>Rouge</option></select></label></> : <><span>Place libre</span><button type="button" className="secondary" disabled={busy || seats.indexOf(userId) % 2 === team} onClick={() => choose(userId, team)}>Choisir</button></>}</div>;
  })}</section>)}</div></section>;
}
