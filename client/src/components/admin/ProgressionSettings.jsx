import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useEffect, useState } from "react";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import "../profile/game-progression.css";

export function ProgressionSettings({ value, onChange, games = [] }) {
  const { t: localeText } = useLocale();
  const [gameId, setGameId] = useState("");
  const [preview, setPreview] = useState(null), [error, setError] = useState("");
  const [range, setRange] = useState(25), [measure, setMeasure] = useState("nextXp");
  const [mastery,setMastery]=useState(0);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => api("/api/admin/progression/preview", { method: "POST", body: JSON.stringify(value), background: true }).then((data) => { if (!cancelled) { setPreview(data.rows); setError(""); } }).catch((reason) => { if (!cancelled) { setError(reason.message); setPreview(null); } }), 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [value]);
  if (!value) return <p role="status">{localeText("Chargement de la progression...")}</p>;
  const override = value.games?.[gameId];
  const current = gameId ? { ...value, ...override } : value;
  const update = (key, next) => onChange({ ...value, [key]: next });
  const updateGame = (key, next) => {
    if (!gameId) return update(key, next);
    onChange({ ...value, games: { ...value.games, [gameId]: { ...override, [key]: next } } });
  };
  const titleRows = override?.titles ?? value.titles;
  const rows = (preview ?? []).filter((row) => row.level <= range && (measure !== "nextXp" || row.nextXp > 0)).map((row)=>({...row,nextXp:row.nextXp*(mastery+1),totalXp:row.totalXp*(mastery+1)}));
  const max = Math.max(1, ...rows.map((row) => row[measure]));
  const x = (i) => 64 + i * 820 / Math.max(1, rows.length - 1), y = (row) => 220 - row[measure] / max * 190;
  return <div className="xp-settings">
    <section className="settings-group"><div className="settings-group-heading"><TrendingUp /><div><h3>{localeText("Niveaux et maîtrise par jeu")}</h3><p>{localeText("La formule donne le coût du niveau suivant, multiplié par maîtrise + 1. Au seuil 101 : retour au niveau 1 et une maîtrise supplémentaire. L’XP totale reste conservée.")}</p></div></div>
      <div className="settings-field-grid"><label className="settings-field-wide">{localeText("Formule XP")}<textarea aria-label={localeText("Formule XP")} rows={3} maxLength={500} value={value.formula} onChange={(event) => update("formula", event.target.value)} /></label><label>{localeText("Niveau plafond (101 active la maîtrise)")}<input aria-label={localeText("Niveau plafond")} type="number" min={1} max={101} value={value.maxLevel} onChange={(event) => update("maxLevel", Number(event.target.value))} /></label><label>{localeText("Maîtrise de la projection")}<input type="number" min={0} max={100} value={mastery} onChange={(event)=>setMastery(Number(event.target.value))}/></label></div>
      {error && <p className="error" role="alert">{localeText(error)}</p>}
      <div className="xp-chart-controls"><label>{localeText("Projection")}<select aria-label={localeText("Projection XP")} value={range} onChange={(event) => setRange(Number(event.target.value))}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}{" " + localeText("niveaux")}</option>)}</select></label><label>{localeText("Valeur")}<select value={measure} onChange={(event) => setMeasure(event.target.value)}><option value="nextXp">{localeText("XP du niveau suivant")}</option><option value="totalXp">{localeText("XP cumulée du cycle")}</option></select></label></div>
      {rows.length > 0 && <div className="xp-curve"><svg viewBox="0 0 910 260" role="img" aria-label={localeText("Courbe des niveaux XP")}>{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={64} x2={884} y1={30 + 190 * ratio} y2={30 + 190 * ratio} /><text x={56} y={34 + 190 * ratio} textAnchor="end">{Math.round(max * (1 - ratio)).toLocaleString("fr-FR")}</text></g>)}<polyline points={rows.map((row, i) => `${x(i)},${y(row)}`).join(" ")} />{rows.map((row, i) => <circle key={row.level} cx={x(i)} cy={y(row)} r={3}><title>{localeText("Niveau") + " "}{row.level} : {row.nextXp.toLocaleString("fr-FR")}{" " + localeText("XP pour monter ;") + " "}{row.totalXp.toLocaleString("fr-FR")}{" " + localeText("XP cumulée")}</title></circle>)}<text x={64} y={250}>{localeText("Niveau 1")}</text><text x={884} y={250} textAnchor="end">{localeText("Niveau") + " "}{rows.at(-1).level}</text></svg></div>}
    </section>
    <section className="settings-group"><div className="settings-group-heading"><TrendingUp /><div><h3>{localeText("XP gagnée et titres")}</h3><p>{localeText("Les montants sont attribués une fois à la fin d’une partie. La victoire s’ajoute à la participation.")}</p></div></div>
      <label>{localeText("Configuration")}<select aria-label={localeText("Jeu de progression")} value={gameId} onChange={(event) => setGameId(event.target.value)}><option value="">{localeText("Valeurs communes à tous les jeux")}</option>{games.map((game) => <option key={game.id} value={game.id}>{localeText(game.name)}</option>)}</select></label>
      <div className="settings-field-grid"><label>{localeText("XP par partie terminée")}<input aria-label={localeText("XP par partie terminée")} type="number" min={0} max={1000000} value={current.completionXp} onChange={(event) => updateGame("completionXp", Number(event.target.value))} /></label><label>{localeText("XP bonus de victoire")}<input aria-label={localeText("XP bonus de victoire")} type="number" min={0} max={1000000} value={current.victoryXp} onChange={(event) => updateGame("victoryXp", Number(event.target.value))} /></label></div>
      {gameId && <label className="xp-title-override"><input type="checkbox" checked={Boolean(override?.titles)} onChange={(event) => { if (event.target.checked) updateGame("titles", value.titles.map((row) => ({ ...row }))); else { const { titles: ignored, ...rest } = override; onChange({ ...value, games: { ...value.games, [gameId]: rest } }); } }} />{localeText("Titres propres à ce jeu")}</label>}
      <div className="xp-title-list">{titleRows.map((row, index) => <div key={index}><label>{localeText("Niveau")}<input aria-label={localeText("Niveau du titre {value0}", { value0: index + 1 })} type="number" min={1} max={1000} disabled={Boolean(gameId && !override?.titles)} value={row.level} onChange={(event) => updateGame("titles", titleRows.map((entry, i) => i === index ? { ...entry, level: Number(event.target.value) } : entry))} /></label><label>{localeText("Titre")}<input aria-label={localeText("Nom du titre {value0}", { value0: index + 1 })} maxLength={40} disabled={Boolean(gameId && !override?.titles)} value={row.label} onChange={(event) => updateGame("titles", titleRows.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} /></label><ConfirmActionButton type="button" className="secondary icon-toggle danger-icon" disabled={Boolean(gameId && !override?.titles)} title={localeText("Retirer ce titre")} dialogTitle={localeText("Retirer ce titre ?")} message={localeText("Les joueurs afficheront le titre du palier précédent.")} confirmLabel={localeText("Retirer")} danger onConfirm={() => updateGame("titles", titleRows.filter((_, i) => i !== index))}><Trash2 size={17} /></ConfirmActionButton></div>)}</div>
      <button type="button" className="secondary" disabled={Boolean(gameId && !override?.titles)} onClick={() => updateGame("titles", [...titleRows, { level: Math.min(1000, Math.max(0, ...titleRows.map((row) => row.level)) + 1), label: "Nouveau titre" }])}><Plus size={17} />{localeText("Ajouter un titre")}</button>
    </section>
  </div>;
}
