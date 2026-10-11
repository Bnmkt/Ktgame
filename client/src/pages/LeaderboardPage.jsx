import { useLocale } from "../locales/LocaleProvider.jsx";
import { useEffect, useState } from "react";
import { Coins, Medal, RefreshCw, TrendingUp, Trophy } from "lucide-react";
import { api } from "../api.js";
import { DisplayName } from "../components/cosmetics/Cosmetics.jsx";
import { CompactNumber } from "../utils/presentation.jsx";
import { Pagination } from "../components/feedback/Feedback.jsx";
import { usePagination } from "../components/common/usePagination.js";
import "./leaderboard.css";
import { RankedLeaderboard } from "../features/games/RankedLeaderboard.jsx";

const metrics = [
  ["balance", "Jetons", Coins], ["wins", "Victoires", Trophy],
  ["gains", "Gains cumulés", TrendingUp], ["record", "Gain record", Coins], ["score", "Meilleur score", Medal]
];
const seasonLabel = (value) => { const [year, quarter] = value.split("-Q"); return `T${quarter} ${year}`; };
const dateLabel = (value) => new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(value));

export function LeaderboardPage({ user }) {
  const { t: localeText } = useLocale();
  const [ranked,setRanked]=useState(()=>new URLSearchParams(window.location.search).has("elo"));
  const [filters, setFilters] = useState({ game: "all", metric: "balance", period: "season", season: "", date: "" });
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const pages = usePagination(data?.rows ?? [], JSON.stringify([user.id, filters]));
  useEffect(() => {
    if(ranked)return undefined;
    let cancelled = false;
    setBusy(true); setError("");
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    api(`/api/leaderboards?${params}`).then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [filters, revision, user.id,ranked]);
  const available = metrics.filter(([key]) => filters.game === "all" ? key !== "score" : key !== "balance");
  const metricName = metrics.find(([key]) => key === filters.metric)[1];
  const monetary = ["gains", "record", "balance"].includes(filters.metric);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  function chooseGame(game) {
    setFilters((current) => ({ ...current, game, metric: (game === "all" && current.metric === "score") || (game !== "all" && current.metric === "balance") ? "wins" : current.metric }));
  }
  function row(entry, pinned = false) {
    return <tr key={pinned ? "self" : entry.id} className={entry.id === user.id ? "leaderboard-self" : ""}>
      <td className="leaderboard-rank">{entry.rank <= 3 && <Medal size={17} className={`medal-${entry.rank}`} />}<span>{entry.rank}</span></td>
      <th scope="row"><DisplayName user={entry.user} />{entry.id === user.id && <small>{localeText("Vous")}{pinned ? (entry.rank > 100 ? localeText(" · hors du top 100") : localeText(" · votre position")) : ""}</small>}</th>
      <td className="leaderboard-games"><CompactNumber value={entry.games} /></td>
      <td className="leaderboard-value"><span><CompactNumber value={entry.value} label={localeText("Valeur exacte")} />{monetary && <Coins size={16} />}</span>{entry.achievedAt && <small>{dateLabel(entry.achievedAt)}</small>}</td>
    </tr>;
  }
  if(ranked)return <RankedLeaderboard initialGame={new URLSearchParams(window.location.search).get("elo")} onClassic={()=>setRanked(false)}/>;
  return <main className="app-shell leaderboard-page">
    <header className="page-heading"><div><span className="eyebrow"><Trophy size={16} />{" " + localeText("Top 100")}</span><h1>{localeText("Classements")}</h1></div><button type="button" className="secondary icon-toggle" title={localeText("Actualiser les classements")} aria-label={localeText("Actualiser les classements")} disabled={busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button></header>
    <div className="leaderboard-page-panel" ref={pages.anchor}>
    <div className="ranked-mode-tabs"><button type="button" className="active" aria-pressed="true">{localeText("Classique")}</button><button type="button" className="secondary" onClick={()=>setRanked(true)}>{localeText("Classé")}</button></div>
    <div className="leaderboard-filters">
      <label>{localeText("Jeu")}<select aria-label={localeText("Jeu")} value={filters.game} onChange={(event) => chooseGame(event.target.value)}><option value="all">{localeText("Tous les jeux")}</option>{data?.games.map((game) => <option key={game.id} value={game.id}>{localeText(game.name)}</option>)}</select></label>
      <div className="leaderboard-periods" role="group" aria-label={localeText("Période du classement")}>{[["day", "Jour"], ["season", "Saison"], ["all", "Global"]].map(([key, label]) => <button key={key} type="button" className={filters.period === key ? "active" : "secondary"} aria-pressed={filters.period === key} onClick={() => update("period", key)}>{localeText(label)}</button>)}</div>
      {filters.period === "season" && <label>{localeText("Saison")}<select aria-label={localeText("Saison")} value={filters.season || data?.period.currentSeason || ""} onChange={(event) => update("season", event.target.value)}>{data?.seasons.map((season) => <option value={season} key={season}>{seasonLabel(season)}</option>)}</select></label>}
      {filters.period === "day" && <label>{localeText("Jour")}<input type="date" value={filters.date || data?.period.today || ""} max={data?.period.today} onChange={(event) => update("date", event.target.value)} /></label>}
    </div>
    <div className="leaderboard-metrics" role="tablist" aria-label={localeText("Catégorie du classement")}>{available.map(([key, label, Icon]) => <button role="tab" type="button" key={key} aria-selected={filters.metric === key} className={filters.metric === key ? "active" : "secondary"} onClick={() => update("metric", key)}><Icon size={17} />{localeText(label)}</button>)}</div>
    {error ? <div role="alert" className="error">{localeText(error)}<button type="button" className="secondary" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />{localeText("Réessayer")}</button></div> : busy ? <p role="status" className="leaderboard-loading">{localeText("Chargement du classement…")}</p> : data && <section aria-label={metricName} className="leaderboard-results">
      <div className="leaderboard-summary"><h2>{metricName}</h2><span>{data.total}{" " + localeText("joueur")}{data.total !== 1 ? localeText("s") : ""}</span>{monetary && <small>{filters.metric === "balance" ? localeText("Solde au {value0}", { value0: dateLabel(`${data.balanceAt}T12:00:00Z`) }) : localeText("Jetons versés · mises restituées comprises")}</small>}{filters.metric === "score" && <small>{data.scoreLabel}{data.ascending ? localeText(" · le plus bas en premier") : ""}</small>}</div>
      {data.rows.length ? <div className="leaderboard-table-scroll"><table className="leaderboard-table"><thead><tr><th scope="col">{localeText("Rang")}</th><th scope="col">{localeText("Joueur")}</th><th scope="col" className="leaderboard-games">{localeText("Parties")}</th><th scope="col">{filters.metric === "score" ? data.scoreLabel : metricName}</th></tr></thead><tbody>{pages.rows.map((entry) => row(entry))}</tbody>{data.self && !pages.rows.some((entry) => entry.id === user.id) && <tfoot>{row(data.self, true)}</tfoot>}</table></div> : <p className="empty-state">{localeText("Aucun résultat pour cette période.")}</p>}
      <Pagination {...pages} label={localeText("Pages du classement")} />
    </section>}
    </div>
  </main>;
}
