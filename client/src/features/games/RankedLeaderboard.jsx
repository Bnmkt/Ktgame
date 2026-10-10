import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../../api.js";
import { DisplayName } from "../../components/cosmetics/Cosmetics.jsx";
import { Pagination } from "../../components/feedback/Feedback.jsx";
import { usePagination } from "../../components/common/usePagination.js";
import { RankBadge, rankedGames } from "./RankedPlay.jsx";
import { gameTitle } from "./config.js";

export function RankedLeaderboard({initialGame="yahtzee",onClassic}) {
  const [game,setGame]=useState(rankedGames.includes(initialGame)?initialGame:"yahtzee"),[data,setData]=useState(null),[error,setError]=useState("");
  const pages=usePagination(data?.rows ?? [],game);
  useEffect(()=>{let active=true;setData(null);setError("");api(`/api/ranked/leaderboard/${game}`).then((result)=>{if(active)setData(result);}).catch((err)=>{if(active)setError(err.message);});return()=>{active=false;};},[game]);
  return <main className="app-shell leaderboard-page"><header className="page-heading"><div><span className="eyebrow"><Trophy size={16}/>Compétition</span><h1>Classements par rang</h1></div></header><div className="leaderboard-page-panel" ref={pages.anchor}>
    <div className="ranked-mode-tabs"><button type="button" className="secondary" onClick={onClassic}>Classique</button><button type="button" className="active" aria-pressed="true">Classé</button></div>
    <label>Jeu<select aria-label="Jeu classé" value={game} onChange={(event)=>setGame(event.target.value)}>{rankedGames.map((id)=><option key={id} value={id}>{gameTitle(id)}</option>)}</select></label>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Chargement du classement…</p>}
    {data && <><div className="leaderboard-summary"><h2>{gameTitle(game)}</h2><small>À partir de {data.minimumGames} parties classées</small></div><div className="leaderboard-table-scroll"><table className="leaderboard-table"><thead><tr><th>Position</th><th>Joueur</th><th>Rang</th><th>Parties classées</th><th>Premières places</th><th>Niveau</th></tr></thead><tbody>{pages.rows.map((row)=><tr key={row.id}><td>{row.rank}</td><th scope="row"><DisplayName user={row.user}/></th><td><RankBadge rank={row.ratingRank}/>{row.elo!==undefined && <small>{row.elo} Elo · privé</small>}</td><td>{row.games}</td><td>{row.wins}</td><td>{row.level}{row.mastery>0?` · M${row.mastery}`:""}</td></tr>)}</tbody></table></div>{!data.rows.length && <p>Aucun joueur n’a encore atteint le nombre de parties requis.</p>}<Pagination {...pages} label="Pages du classement classé"/></>}
  </div></main>;
}
