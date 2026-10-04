import { useState } from "react";
import { TrendingUp } from "lucide-react";
import "./game-progression.css";

export function GameProgression({ rows = [], titleGameId, onTitleChange }) {
  const [filter, setFilter] = useState("played");
  const visible = rows.filter((row) => filter === "all" || row.xp > 0).sort((a, b) => b.xp - a.xp);
  return <section className="xp-workspace"><header><div><span className="eyebrow">Carrière</span><h3><TrendingUp size={20} />Progression par jeu</h3></div><label>Jeux<select aria-label="Afficher la progression" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="played">Jeux avec de l’XP</option><option value="all">Tous les jeux</option></select></label></header>
    {onTitleChange && <label className="xp-equipped-title">Titre affiché sur le profil et les chats<select aria-label="Jeu du titre affiché" value={titleGameId ?? ""} onChange={(event) => onTitleChange(event.target.value)}><option value="">Automatique : jeu avec le plus d’XP</option>{rows.map((row) => <option key={row.gameId} value={row.gameId}>{row.gameName} : {row.title || "Sans titre"} · niveau {row.level}</option>)}</select></label>}
    {!visible.length && <p className="xp-empty">Pas encore d’XP. Les parties terminées et les succès font progresser chaque jeu séparément.</p>}
    <div className="xp-game-list">{visible.map((row) => <article key={row.gameId}><header><strong>{row.gameName}</strong><span>Niveau {row.level}</span></header><div><b>{row.title || "Sans titre"}</b><small>{row.xp.toLocaleString("fr-FR")} XP</small></div><progress max={row.nextXp || 1} value={row.capped ? 1 : Math.min(row.nextXp, row.levelXp)} aria-label={`${row.gameName} : niveau ${row.level}`} /><small>{row.capped ? "Niveau maximal atteint" : `${row.levelXp.toLocaleString("fr-FR")} / ${row.nextXp.toLocaleString("fr-FR")} XP vers le niveau ${row.level + 1}`}</small></article>)}</div>
  </section>;
}
