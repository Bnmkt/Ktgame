import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../../api.js";
import { DisplayName } from "../../components/cosmetics/Cosmetics.jsx";
import { Pagination } from "../../components/feedback/Feedback.jsx";
import { usePagination } from "../../components/common/usePagination.js";
import { RankBadge, rankedGames } from "./RankedPlay.jsx";
import { gameTitle } from "./config.js";

export function RankedLeaderboard({initialGame="yahtzee",onClassic}) {
  const { t: localeText } = useLocale();
  const [game,setGame]=useState(rankedGames.includes(initialGame)?initialGame:"yahtzee"),[data,setData]=useState(null),[error,setError]=useState("");
  const pages=usePagination(data?.rows ?? [],game);
  useEffect(()=>{let active=true;setData(null);setError("");api(`/api/ranked/leaderboard/${game}`).then((result)=>{if(active)setData(result);}).catch((err)=>{if(active)setError(err.message);});return()=>{active=false;};},[game]);
  return <main className="app-shell leaderboard-page"><header className="page-heading"><div><span className="eyebrow"><Trophy size={16}/>{localeText("Compétition")}</span><h1>{localeText("Classements par rang")}</h1></div></header><div className="leaderboard-page-panel" ref={pages.anchor}>
    <div className="ranked-mode-tabs"><button type="button" className="secondary" onClick={onClassic}>{localeText("Classique")}</button><button type="button" className="active" aria-pressed="true">{localeText("Classé")}</button></div>
    <label>{localeText("Jeu")}<select aria-label={localeText("Jeu classé")} value={game} onChange={(event)=>setGame(event.target.value)}>{rankedGames.map((id)=><option key={id} value={id}>{localeText(gameTitle(id))}</option>)}</select></label>
    {error && <p className="error" role="alert">{localeText(error)}</p>}
    {!data && !error && <p role="status">{localeText("Chargement du classement…")}</p>}
    {data && <><div className="leaderboard-summary"><h2>{localeText(gameTitle(game))}</h2><small>{localeText("À partir de") + " "}{data.minimumGames}{" " + localeText("parties classées")}</small></div><div className="leaderboard-table-scroll"><table className="leaderboard-table"><thead><tr><th>{localeText("Position")}</th><th>{localeText("Joueur")}</th><th>{localeText("Rang")}</th><th>{localeText("Parties classées")}</th><th>{localeText("Premières places")}</th><th>{localeText("Niveau")}</th></tr></thead><tbody>{pages.rows.map((row)=><tr key={row.id}><td>{row.rank}</td><th scope="row"><DisplayName user={row.user}/></th><td><RankBadge rank={row.ratingRank}/>{row.elo!==undefined && <small>{row.elo}{" " + localeText("Elo · privé")}</small>}</td><td>{row.games}</td><td>{row.wins}</td><td>{row.level}{row.mastery>0?localeText(" · M{value0}", { value0: row.mastery }):""}</td></tr>)}</tbody></table></div>{!data.rows.length && <p>{localeText("Aucun joueur n’a encore atteint le nombre de parties requis.")}</p>}<Pagination {...pages} label={localeText("Pages du classement classé")}/></>}
  </div></main>;
}
