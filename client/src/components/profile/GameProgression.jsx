import { TrendingUp } from "lucide-react";
import "./game-progression.css";
import { RankedProfile, RankedHistory } from "../../features/games/RankedPlay.jsx";

export function GameProgression({ rows = [], favorites = [], selection, equippedTitle, onTitleChange, publicView = false }) {
  const visible = favorites.map((id) => rows.find((row) => row.gameId === id)).filter(Boolean);
  const selectedRow = rows.find((row) => row.gameId === selection?.titleGameId);
  const selectedTitle = selectedRow?.unlockedTitles?.find((row) => row.level === selection?.titleLevel);
  const chosen = selectedTitle ? { gameId: selectedRow.gameId, titleLevel: selectedTitle.level } : selectedRow ? { gameId: selectedRow.gameId, titleLevel: selectedRow.titleLevel } : equippedTitle;
  const value = selection?.titleHidden || !chosen?.titleLevel ? "hidden" : `${chosen.gameId}:${chosen.titleLevel}`;
  if (!onTitleChange && !visible.length && !rows.some((row)=>row.competitive)) return null;
  return <section className="xp-workspace"><header><div><span className="eyebrow">Carrière</span><h3><TrendingUp size={20} />{publicView ? "Titres des jeux favoris" : "Progression des jeux favoris"}</h3></div></header>
    {onTitleChange && <label className="xp-equipped-title">Titre affiché<select aria-label="Titre affiché" value={value} onChange={(event) => {
      if (event.target.value === "hidden") onTitleChange({ titleGameId: "", titleLevel: 0, titleHidden: true });
      else { const [titleGameId, titleLevel] = event.target.value.split(":"); onTitleChange({ titleGameId, titleLevel: Number(titleLevel), titleHidden: false }); }
    }}><option value="hidden">Sans titre</option>{rows.filter((row) => row.unlockedTitles?.length).map((row) => <optgroup key={row.gameId} label={row.gameName}>{row.unlockedTitles.map((title) => <option key={title.level} value={`${row.gameId}:${title.level}`}>{title.label} · niveau {title.level}</option>)}</optgroup>)}</select></label>}
    {!visible.length && <p className="xp-empty">Aucun jeu favori.</p>}
    <div className="xp-game-list">{visible.map((row) => <article key={row.gameId}><header><strong>{row.gameName}</strong>{!publicView && <span>Niveau {row.level}{row.mastery>0 ? ` · Maîtrise ${row.masteryLabel}` : ""}</span>}</header><div><b>{row.title || "Sans titre"}</b>{!publicView && <small>{row.xp.toLocaleString("fr-FR")} XP</small>}</div>{!publicView && <><progress max={row.nextXp || 1} value={row.capped ? 1 : Math.min(row.nextXp, row.levelXp)} aria-label={`${row.gameName} : niveau ${row.level}`} /><small>{row.capped ? "Niveau maximal atteint" : `${row.levelXp.toLocaleString("fr-FR")} / ${row.nextXp.toLocaleString("fr-FR")} XP ${row.level===100 ? "vers la maîtrise suivante" : `vers le niveau ${row.level + 1}`}`}</small></>}</article>)}</div>
    <RankedProfile rows={rows}/>{onTitleChange && <RankedHistory/>}
  </section>;
}
